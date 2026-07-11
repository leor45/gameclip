// URLs del protocolo de medios del main: el renderer nunca conoce rutas absolutas.

export function clipMediaUrl(id: number): string {
  return `gameclip-media://clip/${id}`;
}

/** El query de versión evita servir un thumbnail cacheado tras regenerarlo. */
export function thumbMediaUrl(id: number, version: string | null): string {
  return `gameclip-media://thumb/${id}?v=${encodeURIComponent(version ?? '')}`;
}
