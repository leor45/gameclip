import { existsSync } from 'node:fs';
import { parse, resolve } from 'node:path';

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

/** Raíz del volumen de una ruta (`d:\`, `\\servidor\recurso\`), comparable: minúsculas y con `\`. */
export function volumeRootKey(filePath: string): string {
  return parse(filePath).root.replace(/\//g, '\\').toLowerCase();
}

/** Rutas Win32 con prefijo de espacio de nombres (`\\?\`, `\\.\`): Node no sabe comprobar su raíz. */
const CON_PREFIJO = /^[\\/]{2}[?.][\\/]/;

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
    const raiz = parse(filePath).root;
    const clave = volumeRootKey(filePath);
    let accesible = vistas.get(clave);
    if (accesible === undefined) {
      accesible = raiz === '' || CON_PREFIJO.test(raiz) || existsSync(raiz);
      vistas.set(clave, accesible);
    }
    return accesible;
  };
}
