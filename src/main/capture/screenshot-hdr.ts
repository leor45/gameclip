import type { CaptureState } from '../../shared/capture';

/**
 * ¿Hay que relanzar la app porque cambió `screenshotHdrCompatibility`?
 *
 * El ajuste es un switch de Chromium (`--disable-features=DirectXCapturer`) y la `FeatureList` se
 * congela al arrancar el proceso: comprobado que aplicarlo después de `ready` no tiene efecto
 * (Chromium registra el switch, pero `getSources()` sigue sin el monitor HDR). Así que no hay toggle
 * en caliente — a diferencia de `hdrCompatibility`, que es un ajuste de fuente de libobs.
 *
 * Con una grabación en curso **no** se relanza: se perdería la grabación. El ajuste ya quedó
 * persistido, así que se aplica solo en el próximo arranque.
 *
 * Con `buffering` sí se relanza: es el estado normal con `bufferMode: 'always'`, así que exigir
 * `idle` sería no relanzar nunca. El coste es perder el búfer de repetición, y el diálogo lo avisa.
 */
export function debeRelanzarPorHdr(
  prev: boolean,
  next: boolean,
  state: CaptureState,
): boolean {
  if (prev === next) return false;
  return state !== 'recording';
}
