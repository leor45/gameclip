import { existsSync } from 'node:fs';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';

/**
 * Forma canónica de la ruta de un clip. El catálogo indexa SIEMPRE esta forma: cada vía de alta
 * escribe la ruta a su manera (libobs pega su carpeta con `/`, Node con el separador nativo) y,
 * comparadas como string, dos formas de la misma ruta parecen archivos distintos → clip duplicado.
 */
export function canonicalClipPath(filePath: string): string {
  return resolve(filePath.trim().replace(/[\\/]+$/, ''));
}

/** Clave de comparación: NTFS no distingue mayúsculas, así que la ruta canónica en minúsculas. */
export function clipPathKey(filePath: string): string {
  return canonicalClipPath(filePath).toLowerCase();
}

/**
 * Raíz del volumen de una ruta, normalizada: con `\` y acabada en `\` (`D:\`, `\\servidor\recurso\`);
 * '' si no tiene. El selector de carpetas da la raíz de un recurso compartido sin barra final
 * (`\\nas\clips`, y `parse` la deja así) mientras que las filas la llevan: sin normalizar, la misma
 * unidad no se reconocía.
 */
function volumeRoot(filePath: string): string {
  const raiz = parse(filePath).root.replace(/\//g, '\\');
  return raiz === '' || raiz.endsWith('\\') ? raiz : `${raiz}\\`;
}

/**
 * Raíz del volumen de una ruta (`d:\`, `\\servidor\recurso\`), comparable: normalizada y en
 * minúsculas.
 */
export function volumeRootKey(filePath: string): string {
  return volumeRoot(filePath).toLowerCase();
}

/** Rutas Win32 con prefijo de espacio de nombres (`\\?\`, `\\.\`): Node no sabe comprobar su raíz. */
const CON_PREFIJO = /^[\\/]{2}[?.][\\/]/;

/** `\\?\UNC\servidor\recurso\…` es la forma con prefijo de `\\servidor\recurso\…`. */
const CON_PREFIJO_UNC = /^[\\/]{2}[?.][\\/]UNC[\\/]/i;

/** Quita el prefijo `\\?\` / `\\.\` (y el `UNC\` de su forma de red) para que `path` compare rutas. */
function sinPrefijo(ruta: string): string {
  if (CON_PREFIJO_UNC.test(ruta)) return `\\\\${ruta.replace(CON_PREFIJO_UNC, '')}`;
  return ruta.replace(CON_PREFIJO, '');
}

/**
 * ¿Cuelga `filePath` de `dir`, a cualquier profundidad? Es pura manipulación de strings (no consulta
 * el disco: corre en el hilo principal, y una unidad de red caída lo bloquea segundos) con las reglas
 * de Windows: sin distinguir mayúsculas, con `/` o `\`, con o sin barra final, y con la raíz de una
 * unidad (`D:\`) o de un recurso de red (`\\nas\recurso`) como carpeta.
 *
 * La propia carpeta no cuenta como «dentro» de sí misma. Una carpeta vacía no contiene nada (sin
 * esto, `path` la resolvería contra el directorio de trabajo). OJO: no pasar por `canonicalClipPath`
 * una carpeta que sea una raíz: recorta la barra final y `D:\` queda `D:`, que `resolve` entiende como
 * el directorio de trabajo de esa unidad.
 *
 * Dos formas distintas de llegar a la misma carpeta (`Z:\` y `\\nas\recurso`, un junction) NO se
 * reconocen aquí: para eso hace falta mirar el disco.
 */
export function isInsideDir(dir: string, filePath: string): boolean {
  if (dir.trim() === '') return false;
  const rel = relative(sinPrefijo(dir), sinPrefijo(filePath));
  // `relative` da una ruta absoluta cuando no hay camino relativo (otra unidad, otro recurso).
  return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

/**
 * ¿Está accesible la unidad de cada ruta? Mira la raíz del volumen (`D:\`, `\\servidor\recurso\`)
 * una sola vez por unidad mientras viva la función devuelta (una pasada): la primera consulta a un
 * recurso de red caído tarda segundos.
 *
 * Solo responde `false` cuando lo puede comprobar. Una ruta sin raíz, o con prefijo `\\?\`/`\\.\`
 * (`existsSync('\\?\D:\')` da false con la unidad montada), cuenta como accesible: se trata como
 * antes de existir esta comprobación.
 */
export function createVolumeAccessCheck(): (filePath: string) => boolean {
  const vistas = new Map<string, boolean>();
  return (filePath) => {
    const raiz = volumeRoot(filePath);
    const clave = raiz.toLowerCase();
    let accesible = vistas.get(clave);
    if (accesible === undefined) {
      accesible = raiz === '' || CON_PREFIJO.test(raiz) || existsSync(raiz);
      vistas.set(clave, accesible);
    }
    return accesible;
  };
}

/**
 * ¿Vive el clip en la unidad de la carpeta de clips, y esa unidad no está montada? Son las únicas
 * filas sin archivo que `reconcile` conserva (D5-BUG-3) y las únicas que el uso y el auto-borrado
 * dejan fuera.
 *
 * Pregunta al disco una sola vez —por la raíz de la carpeta de clips, y solo si algún clip vive en
 * ella—. Las filas de otras unidades no se miran: una unidad de red caída bloquea el hilo principal
 * segundos (decenas con el servidor apagado), y quien llama corre en él.
 */
export function createOfflineOutputVolumeCheck(outputDir: string): (filePath: string) => boolean {
  const unidad = volumeRootKey(outputDir);
  let montada: boolean | undefined;
  return (filePath) => {
    if (unidad === '' || volumeRootKey(filePath) !== unidad) return false;
    montada ??= createVolumeAccessCheck()(outputDir);
    return !montada;
  };
}
