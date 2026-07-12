import { resolve } from 'node:path';

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
