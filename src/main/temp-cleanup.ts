import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'; // prettier-ignore
import { basename, dirname, join } from 'node:path';

/**
 * Limpieza de los temporales que deja el `.exe` portable.
 *
 * El portable no se instala: en CADA ejecución se autodescomprime en la carpeta temporal y deja dos
 * carpetas que nadie borra —se acumularon 4,15 GB en la máquina del owner—:
 *
 *   <temp>\GameClip-<version>\   payload: GameClip.exe + resources\  (de aquí corre el proceso)
 *   <temp>\nsXXXX.tmp\           staging del extractor: 7z-out\GameClip.exe + app-64.7z
 *
 * El payload lleva el nombre de la versión, así que se reutiliza y no se multiplica. El staging lleva
 * **nombre aleatorio**: queda uno nuevo (94–515 MB) por cada ejecución que no termine bien.
 *
 * Tres reglas gobiernan qué se toca, y cada una tapa una forma distinta de hacer daño:
 *
 * 1. **Solo lo nuestro.** Una carpeta se borra si contiene nuestro ejecutable, o `obs64.exe` de
 *    obs-studio-node bajo `resources/`. Lo segundo hace falta porque el launcher borra lo que puede
 *    al salir y suele dejar el payload **a medio borrar**, ya sin el `.exe`: sin ese segundo
 *    marcador, esos restos (cientos de MB) se volverían invisibles. Y sigue siendo específico:
 *    ninguna otra app trae libobs dentro. Los `nsXXXX.tmp` son de NSIS y los usa cualquier
 *    instalador — borrar por prefijo de nombre se llevaría los temporales de otros programas.
 *
 * 2. **Solo lo de ejecuciones anteriores.** Se ignora todo lo modificado después de que arrancó este
 *    proceso: son las carpetas de la ejecución en curso, y el launcher todavía las tiene abiertas.
 *
 * 3. **Nunca a medias.** Antes de borrar, la carpeta se **renombra**. Windows no deja renombrar una
 *    carpeta con archivos abiertos, así que si algo está en uso la operación falla *antes* de tocar
 *    nada y la carpeta queda entera para el próximo cierre. Un `rm -rf` directo borra hasta que
 *    choca con el archivo bloqueado y deja el resto destruido a medias.
 *
 * Y una cuarta que llegó después, con el cierre sucio (`fix/limpieza-temporales-cierre-sucio`):
 *
 * 4. **Lo que fue nuestro sigue siéndolo.** Un cierre sucio (apagón, cuelgue, kill) mata también al
 *    launcher, que alcanza a borrar el `7z-out` del staging pero no el `app-64.7z`. Lo que queda no
 *    tiene ninguno de los marcadores de la regla 1 —es idéntico al staging de cualquier otra app de
 *    electron-builder— así que por contenido es **irreclamable**. Pero al ARRANCAR sí era reconocible
 *    (el `7z-out` estaba recién extraído), así que se anota su ruta entonces: se reclama por lo que
 *    era cuando no había duda, en vez de adivinar por un fichero genérico y arriesgarse a barrer los
 *    temporales de otro programa.
 */

export interface EntornoTemp {
  /** Carpeta temporal del sistema. */
  tempDir: string;
  /** Ruta del ejecutable en curso; su carpeta es la única intocable (está en uso). */
  exePath: string;
  listar: (dir: string) => string[];
  existe: (ruta: string) => boolean;
  /** ¿La carpeta es de una ejecución anterior (no de la actual)? */
  esAnterior: (ruta: string) => boolean;
}

/** Marcador de un payload nuestro que el launcher dejó a medio borrar (ya sin el .exe). */
const OBS64 = join('resources', 'app.asar.unpacked', 'node_modules', '@streamlabs', 'obs-studio-node', 'obs64.exe'); // prettier-ignore

/** El payload comprimido que el extractor deja en su staging. Siempre está; el `7z-out`, no. */
const PAYLOAD_7Z = 'app-64.7z';

/**
 * El staging del extractor de ESTA ejecución: se identifica por el `app-64.7z` y por haberse creado
 * en nuestra ventana de arranque (no es de una ejecución anterior). Su ruta se anota para poder
 * borrarlo en el arranque siguiente si este acaba mal. Ver la regla 4 de arriba.
 *
 * **No vale `7z-out\GameClip.exe` como marcador**: cuando el payload ya está en el temporal de una
 * ejecución anterior, el launcher no necesita extraer nada y **no crea `7z-out`**. Justo en el caso
 * más común —el segundo arranque en adelante— no lo reconoceríamos, y ese staging (94 MB) volvería a
 * quedar huérfano para siempre. `app-64.7z`, en cambio, está siempre.
 *
 * El precio: `app-64.7z` lo escribe cualquier app empaquetada con electron-builder + NSIS, así que en
 * el peor caso adoptaríamos el staging de otra que se lanzase **en el mismo minuto** que nosotros. La
 * ventana temporal lo hace improbable, y aunque pasara, la regla 3 impide tocarlo mientras esté en
 * uso: como mucho se limpiaría basura muerta ajena.
 *
 * Una carpeta ya apartada (`.borrar`) queda fuera pase lo que pase: conserva su `app-64.7z` y el
 * renombrado le dejó el mtime de ahora, así que por las dos señales parecería el staging en curso —
 * pero ese sufijo solo lo escribimos al dar una carpeta por muerta. Adoptarla la volvía intocable y
 * la libraba del borrado justo cuando tocaba reintentarlo.
 */
export function stagingsActuales(entorno: EntornoTemp): string[] {
  const { tempDir, listar, existe, esAnterior } = entorno;

  return listar(tempDir)
    .map((nombre) => join(tempDir, nombre))
    .filter(
      (carpeta) =>
        !carpeta.endsWith('.borrar') && !esAnterior(carpeta) && existe(join(carpeta, PAYLOAD_7Z)),
    );
}

/**
 * Decide qué carpetas del temporal son basura nuestra. Pura a propósito: barrer de más es el riesgo
 * caro de esta función, así que la decisión se testea sin tocar el disco.
 *
 * `registradas` son rutas que una ejecución anterior anotó como suyas (regla 4): se borran aunque ya
 * no quede dentro nada que las delate, y sin necesitar el filtro de edad — pero **nunca** la de la
 * ejecución en curso, que el launcher tiene abierta.
 */
export function carpetasHuerfanas(
  entorno: EntornoTemp,
  registradas: string[] = [],
  excluir: string[] = [],
): string[] {
  const { tempDir, exePath, listar, existe, esAnterior } = entorno;
  const exe = basename(exePath); // p. ej. 'GameClip.exe'
  const enUso = dirname(exePath); // la carpeta desde la que corremos
  const deAhora = new Set(stagingsActuales(entorno).map((c) => c.toLowerCase()));
  const anotadas = new Set(registradas.map((c) => c.toLowerCase()));
  const intocables = new Set([enUso, ...excluir].map((c) => c.toLowerCase()));

  // Solo lo que sigue estando en el temporal: una ruta registrada que ya no aparece es que se borró
  // en su día, y no hay nada que hacer con ella.
  return listar(tempDir)
    .map((nombre) => join(tempDir, nombre))
    .filter((carpeta) => {
      const clave = carpeta.toLowerCase(); // NTFS ignora las mayúsculas
      if (intocables.has(clave)) return false; // la carpeta desde la que corremos y el staging de ahora

      // Apartada por un intento anterior que no pudo borrarla. El sufijo lo escribimos solo
      // nosotros, así que es nuestra sin más comprobaciones, y se reintenta ya.
      if (carpeta.endsWith('.borrar')) return true;

      // Anotada como staging propio por una ejecución ANTERIOR (regla 4): es nuestra aunque por
      // dentro ya no quede nada que lo demuestre. Y se salta el filtro de edad a propósito: el
      // staging de esta ejecución es una carpeta aleatoria recién creada, así que ninguna ejecución
      // anterior pudo haberla anotado — una ruta registrada NUNCA es la actual. Sin esto, un
      // apagón y un reinicio rápido (< MARGEN_MS) dejarían la basura sin tocar, que es justo el
      // caso que este fix vino a resolver.
      if (anotadas.has(clave)) return true;

      // Payload versionado de GameClip: no es ambiguo como un `ns*.tmp`, así que se puede intentar
      // borrar aunque sea reciente. Si realmente está en uso, el rename falla antes de tocarlo.
      if (existe(join(carpeta, exe)) || existe(join(carpeta, OBS64))) return true;

      if (deAhora.has(clave)) return false; // el staging de ahora: el launcher lo tiene abierto
      if (!esAnterior(carpeta)) return false; // staging de la ejecución en curso o demasiado reciente

      return existe(join(carpeta, '7z-out', exe)); // staging del extractor
    });
}

export interface ResultadoLimpieza {
  borradas: number;
  enUso: number;
}

/**
 * Dónde se anota el staging propio para poder borrarlo tras un cierre sucio (regla 4). Inyectable:
 * la decisión de qué borrar se testea sin tocar el disco.
 */
export interface RegistroStaging {
  leer(): string[];
  escribir(rutas: string[]): void;
}

/** Registro en `userData/portable-temp.json`. Best-effort: un registro ilegible se trata como vacío. */
export function registroEnDisco(fichero: string): RegistroStaging {
  return {
    leer: () => {
      try {
        const datos: unknown = JSON.parse(readFileSync(fichero, 'utf8'));
        return Array.isArray(datos) ? datos.filter((r): r is string => typeof r === 'string') : [];
      } catch {
        return []; // no existe (primer arranque) o está corrupto: no es motivo para no arrancar
      }
    },
    escribir: (rutas) => {
      try {
        writeFileSync(fichero, JSON.stringify(rutas), 'utf8');
      } catch (err) {
        console.error('[temp] no se pudo anotar el staging:', err);
      }
    },
  };
}

/**
 * Borra las carpetas huérfanas, renombrándolas primero. Best-effort: ni arrancar ni cerrar la app
 * pueden fallar por esto.
 *
 * Corre **al arrancar y al cerrar**. Al cerrar recupera el espacio en el acto; al arrancar es la
 * única red que atrapa un cierre sucio (apagón, cuelgue, kill), que por definición no pasó por el
 * `will-quit`. Es idempotente, así que llamarla dos veces no cuesta nada.
 */
export function limpiarTemporales(
  entorno: EntornoTemp,
  registro?: RegistroStaging,
): ResultadoLimpieza {
  return sinAsar(() => limpieza(entorno, registro));
}

/**
 * Corre `fn` con el intérprete de asar de Electron **apagado**.
 *
 * Electron intercepta todo `fs` cuyo path contenga un `.asar` y lo trata como un archivo empaquetado:
 * lo **abre para leer su cabecera y deja el handle cacheado** para el resto de la vida del proceso.
 * El staging que borramos lleva dentro un `7z-out\resources\app.asar`, así que el propio `rmSync`
 * hacía que Electron lo abriera, el borrado moría con `EBUSY`... **contra un handle que acabábamos de
 * abrir nosotros**, y que ya no se soltaba. La carpeta quedaba a medias (los 118 MB que el owner
 * encontró) y ningún arranque posterior podía rematarla: se volvía a bloquear sola.
 *
 * Con `noAsar` el `.asar` es un fichero más y se borra como cualquier otro. Se restaura el valor
 * anterior al salir: el resto de la app (que lee de SU propio asar) no se entera.
 */
export function sinAsar<T>(fn: () => T): T {
  const proceso = process as NodeJS.Process & { noAsar?: boolean };
  const antes = proceso.noAsar;
  proceso.noAsar = true;
  try {
    return fn();
  } finally {
    proceso.noAsar = antes;
  }
}

function limpieza(entorno: EntornoTemp, registro?: RegistroStaging): ResultadoLimpieza {
  const resultado: ResultadoLimpieza = { borradas: 0, enUso: 0 };
  const registradas = registro?.leer() ?? [];

  // El staging de ESTA ejecución: el que tiene el marcador y ninguna ejecución anterior anotó (su
  // nombre es aleatorio y se acaba de crear). Se protege de la limpieza y se anota para la próxima.
  const mias = seguro(() => stagingsActuales(entorno), []).filter(
    (s) => !registradas.some((r) => r.toLowerCase() === s.toLowerCase()),
  );

  let carpetas: string[];
  try {
    carpetas = carpetasHuerfanas(entorno, registradas, mias);
  } catch (err) {
    console.error('[temp] no se pudo listar la carpeta temporal:', err);
    return resultado;
  }
  const borradas = new Set<string>();

  // Carpetas ya apartadas por un intento anterior que no llegó a borrarlas (el `.borrar` es nuestro
  // por construcción: nadie más lo escribe). Se reintentan sin más trámite.
  for (const carpeta of carpetas.filter((c) => c.endsWith('.borrar'))) {
    try {
      rmSync(carpeta, { recursive: true, force: true });
      resultado.borradas++;
    } catch {
      resultado.enUso++;
    }
  }

  for (const carpeta of carpetas.filter((c) => !c.endsWith('.borrar'))) {
    const apartada = `${carpeta}.borrar`;
    try {
      rmSync(apartada, { recursive: true, force: true }); // resto de un intento anterior
      renameSync(carpeta, apartada); // falla si algo está abierto: no se destruye nada
    } catch {
      resultado.enUso++;
      continue;
    }
    try {
      rmSync(apartada, { recursive: true, force: true });
      resultado.borradas++;
      borradas.add(carpeta.toLowerCase());
    } catch (err) {
      console.error(`[temp] renombrada pero no borrada (${apartada}):`, err);
      resultado.enUso++;
    }
  }

  // El registro queda con el staging de ESTA ejecución (el que habrá que borrar si el cierre es
  // sucio) más las rutas anotadas que no se hayan podido borrar todavía: si se perdieran, esa basura
  // volvería a ser irreclamable.
  if (registro) {
    // Se conserva lo que sigue en el temporal y no se pudo borrar (se reintentará en el arranque
    // siguiente), y se poda lo que ya no está: si no, el registro crecería con rutas fantasma.
    const enDisco = new Set(
      seguro(() => entorno.listar(entorno.tempDir), []).map((n) =>
        join(entorno.tempDir, n).toLowerCase(),
      ),
    );
    const pendientes = registradas.filter(
      (r) => !borradas.has(r.toLowerCase()) && enDisco.has(r.toLowerCase()),
    );
    registro.escribir([...new Set([...pendientes, ...mias])]);
  }

  if (resultado.borradas || resultado.enUso) {
    console.log(
      `[temp] carpetas de ejecuciones anteriores: ${resultado.borradas} borradas, ${resultado.enUso} en uso`,
    );
  }
  return resultado;
}

/** El registro nunca puede tumbar el arranque ni el cierre. */
function seguro<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Margen hacia atrás para decidir qué es "de una ejecución anterior".
 *
 * El staging de ESTA ejecución se crea **antes** que nuestro proceso (el launcher descomprime y
 * recién entonces lanza la app), así que comparar contra el arranque a secas lo daría por viejo y lo
 * intentaríamos borrar con el launcher todavía sosteniéndolo. Con el margen se salta, y lo limpia el
 * cierre siguiente. El precio: si la app se cierra y se reabre en menos de un minuto, ese staging
 * espera un ciclo más. El saldo sigue acotado, que es lo que importa.
 */
const MARGEN_MS = 60_000;

/** Entorno real. `esAnterior` compara contra el arranque de este proceso, con el margen de arriba. */
export function entornoReal(tempDir: string, exePath: string): EntornoTemp {
  const corte = Date.now() - process.uptime() * 1000 - MARGEN_MS;
  return {
    tempDir,
    exePath,
    listar: (dir) =>
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    existe: existsSync,
    esAnterior: (ruta) => {
      try {
        return statSync(ruta).mtimeMs < corte;
      } catch {
        return false;
      }
    },
  };
}
