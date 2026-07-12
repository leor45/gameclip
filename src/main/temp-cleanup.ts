import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
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

/**
 * Decide qué carpetas del temporal son basura nuestra. Pura a propósito: barrer de más es el riesgo
 * caro de esta función, así que la decisión se testea sin tocar el disco.
 */
export function carpetasHuerfanas(entorno: EntornoTemp): string[] {
  const { tempDir, exePath, listar, existe, esAnterior } = entorno;
  const exe = basename(exePath); // p. ej. 'GameClip.exe'
  const enUso = dirname(exePath); // la carpeta desde la que corremos

  return listar(tempDir)
    .map((nombre) => join(tempDir, nombre))
    .filter((carpeta) => {
      if (carpeta.toLowerCase() === enUso.toLowerCase()) return false; // NTFS ignora mayúsculas

      // Apartada por un intento anterior que no pudo borrarla. El sufijo lo escribimos solo
      // nosotros, así que es nuestra sin más comprobaciones, y se reintenta ya.
      if (carpeta.endsWith('.borrar')) return true;

      if (!esAnterior(carpeta)) return false; // de la ejecución en curso: el launcher la tiene abierta

      return (
        existe(join(carpeta, exe)) || // payload completo
        existe(join(carpeta, '7z-out', exe)) || // staging del extractor
        existe(join(carpeta, OBS64)) // payload a medio borrar
      );
    });
}

export interface ResultadoLimpieza {
  borradas: number;
  enUso: number;
}

/** Borra las carpetas huérfanas, renombrándolas primero. Best-effort: cerrar la app nunca falla. */
export function limpiarTemporales(entorno: EntornoTemp): ResultadoLimpieza {
  const resultado: ResultadoLimpieza = { borradas: 0, enUso: 0 };
  let carpetas: string[];
  try {
    carpetas = carpetasHuerfanas(entorno);
  } catch (err) {
    console.error('[temp] no se pudo listar la carpeta temporal:', err);
    return resultado;
  }

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
    } catch (err) {
      console.error(`[temp] renombrada pero no borrada (${apartada}):`, err);
      resultado.enUso++;
    }
  }

  if (resultado.borradas || resultado.enUso) {
    console.log(
      `[temp] carpetas de ejecuciones anteriores: ${resultado.borradas} borradas, ${resultado.enUso} en uso`,
    );
  }
  return resultado;
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
