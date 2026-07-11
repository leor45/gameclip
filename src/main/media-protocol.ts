// Privilegios del scheme de medios (registrados antes de 'ready' en index.ts).
// `stream` habilita el buffering de <video>; `secure` evita warnings de contenido mixto.
// Ojo: además el CSP de src/renderer/index.html debe permitir gameclip-media: en
// media-src e img-src — sin eso Chromium bloquea el reproductor y las miniaturas
// ("Media load rejected by URL safety check"); hay test de regresión del CSP.

export const MEDIA_SCHEME = 'gameclip-media';

export const MEDIA_SCHEME_PRIVILEGES = {
  secure: true,
  stream: true,
} as const;
