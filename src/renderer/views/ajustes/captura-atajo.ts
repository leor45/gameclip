// Piezas comunes de «Editar atajo» (Ajustes → Atajos y el atajo del overlay en Avanzado).

/** Aviso al pulsar el botón derecho o central mientras se captura un atajo. */
export const RECHAZO_BOTON_RATON =
  'Del ratón solo sirven los botones laterales (atrás y adelante). Pulsa uno de ellos o una tecla.';

/** Sin menú contextual mientras se escucha: el botón derecho solo debe dar el aviso. */
export function evitarMenu(e: Event): void {
  e.preventDefault();
}
