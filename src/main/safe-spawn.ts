import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

// Lanzamiento a prueba de fallos de los helpers nativos (sensores, PresentMon, háptico, mandos).
//
// `child_process.spawn` falla de DOS maneras y los wrappers no cubrían ninguna (D5-BUG-4):
// - **Lanza síncrono** con todo error que Node no considere «de ejecución» (lo que no sea
//   EACCES/EAGAIN/EMFILE/ENFILE/ENOENT). Medido: un archivo que no es un ejecutable válido da EFTYPE
//   y un .exe dañado da UNKNOWN. Un antivirus, Smart App Control o un binario roto lo provocan, y en
//   el arranque (`perfSampler.configure` corre antes de la bandeja, el IPC y la ventana) abortaba la
//   inicialización entera.
// - **Emite `'error'`** con esos cinco (p. ej. ENOENT). Sin listener, el `'error'` de un
//   EventEmitter es una excepción no capturada en el proceso principal.
// Además, el `kill()` de Node sobre un hijo que no llegó a arrancar **lanza EINVAL** si se llama
// antes de que salga ese `'error'` (medido).
//
// Todo eso se convierte aquí en lo único que los readers ya saben manejar: «el proceso terminó».

/** Firma de `spawn` que se usa; inyectable en los tests. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface SafeChild {
  /** El proceso de Node, o null si `spawn` lanzó y no llegó a existir. */
  readonly child: ChildProcess | null;
  /** Mata el proceso. No-op si no llegó a arrancar (sin pid). */
  kill(): void;
  /**
   * «El proceso terminó»: UN solo aviso por suscriptor, venga de `'exit'`, del `'error'` de un
   * lanzamiento fallido, de ambos, o del throw síncrono de `spawn`. Un fallo al lanzar se avisa
   * siempre en diferido, así que llega aunque el llamador se suscriba después de que esto devuelva.
   */
  onEnd(listener: () => void): void;
}

/** Código del error (`EFTYPE`, `ENOENT`…) para el log: una línea, sin stack. */
function codigoDe(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * `spawn` que nunca lanza ni deja un `'error'` sin escuchar. `nombre` es el del helper, solo para
 * el log. Las opciones pasan tal cual: el `stdin: 'pipe'` que protege de huérfanos lo deciden los
 * wrappers, no esto.
 */
export function safeSpawn(
  nombre: string,
  exePath: string,
  args: readonly string[],
  options: SpawnOptions,
  spawnFn: SpawnFn = spawn,
): SafeChild {
  let terminado = false;
  const listeners: (() => void)[] = [];
  const terminar = (): void => {
    if (terminado) return; // Node puede emitir 'error' y después 'exit': se avisa una vez
    terminado = true;
    for (const listener of listeners.splice(0)) listener();
  };

  let lanzado: ChildProcess | null = null;
  try {
    lanzado = spawnFn(exePath, args, options);
  } catch (err) {
    console.warn(`[helpers] no se pudo lanzar ${nombre} (${codigoDe(err)})`);
    // Diferido, igual que hace Node con sus propios fallos de lanzamiento: quien llamó todavía no
    // ha tenido ocasión de suscribirse a `onEnd`.
    process.nextTick(terminar);
  }
  const child = lanzado;

  if (child) {
    child.on('exit', terminar);
    child.on('error', (err) => {
      if (child.pid === undefined) {
        console.warn(`[helpers] no se pudo lanzar ${nombre} (${codigoDe(err)})`);
        terminar();
        return;
      }
      // Con pid el proceso SÍ arrancó y el 'error' viene de un `kill()` fallido: sigue vivo, y
      // darlo por terminado haría que el reader lanzase otro con este aún corriendo. Su 'exit'
      // llegará cuando muera de verdad.
      console.warn(`[helpers] error en ${nombre} (${codigoDe(err)})`);
    });
  }

  return {
    child,
    kill: () => {
      // Sin pid no hay proceso que matar, y el `kill()` de Node lanzaría EINVAL.
      if (child?.pid === undefined) return;
      child.kill();
    },
    onEnd: (listener) => {
      // Tarde (ya terminó): se avisa igual, en diferido, para que nadie se quede esperando.
      if (terminado) process.nextTick(listener);
      else listeners.push(listener);
    },
  };
}
