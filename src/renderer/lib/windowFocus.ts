/**
 * ¿El `focus` que llega ahora es porque la VENTANA recupera el foco (alt-tab desde el juego)?
 *
 * Al volver a la ventana, Chromium relanza `focus`/`focusin` sobre el elemento que ya estaba
 * enfocado. Para la Biblioteca eso no es un gesto del usuario sobre la tarjeta y no debe arrancar
 * una vista previa. Criterio: desde que la ventana pierde el foco (`blur` de window) hasta que lo
 * recupera (`focus` de window) y termina esa tarea, cualquier foco de elemento es «de vuelta». El
 * orden entre el focus del elemento y el de window no importa: la marca se limpia en la tarea
 * siguiente al focus de window, así que ambos órdenes la encuentran puesta.
 */
let volviendo = false;

if (typeof window !== 'undefined') {
  // Sin captura: blur/focus de elementos no burbujean, así que aquí solo llegan los de la ventana.
  window.addEventListener('blur', () => {
    volviendo = true;
  });
  window.addEventListener('focus', () => {
    setTimeout(() => {
      volviendo = false;
    }, 0);
  });
}

export function focoPorVueltaDeVentana(): boolean {
  return volviendo;
}

/** Solo para tests. */
export function resetWindowFocus(): void {
  volviendo = false;
}
