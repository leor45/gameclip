// URLs del protocolo de medios del main: el renderer nunca conoce rutas absolutas.

/** `version` fuerza la recarga tras reescribir el archivo (guardar edit); el main ignora el query. */
export function clipMediaUrl(id: number, version = 0): string {
  return version > 0 ? `gameclip-media://clip/${id}?v=${version}` : `gameclip-media://clip/${id}`;
}

/** El query de versión evita servir un thumbnail cacheado tras regenerarlo. */
export function thumbMediaUrl(id: number, version: string | null): string {
  return `gameclip-media://thumb/${id}?v=${encodeURIComponent(version ?? '')}`;
}
