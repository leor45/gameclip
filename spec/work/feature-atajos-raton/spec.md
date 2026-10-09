# Spec — Botones laterales del ratón como atajos

**Tipo:** Feature
**Rama:** `feature/atajos-raton`
**Fecha:** 2026-10-08

## Problema / Objetivo

Los cinco atajos de GameClip (guardar clip, grabar/parar, captura, cambiar de juego, overlay de
rendimiento) solo admiten **teclas**: van por `globalShortcut` de Electron y la captura de atajos en
Ajustes escucha `keydown`. Los botones laterales del ratón (los «extra» de un ratón de juego) solo
sirven hoy para el push-to-talk, que usa `uiohook-napi`.

Objetivo: que cualquiera de los cinco atajos pueda ser `Mouse4` o `Mouse5` (los dos botones
laterales), solos o con modificadores (`Ctrl+Mouse4`), con la misma experiencia que una tecla: se
capturan pulsándolos en «Editar atajo», funcionan dentro del juego y respetan las colisiones.

## Alcance

**Dentro:**
- `@shared/hotkeys`: `Mouse4`/`Mouse5` como teclas base válidas; `accelFromMousePress` (botón DOM 3 →
  `Mouse4`, 4 → `Mouse5`, con modificadores); `isMouseAccelerator`; `isPttReserved` compara también
  con un PTT de ratón (hoy devuelve false si el PTT es `Mouse…`).
- Main: `MouseHotkeys` sobre el hook global (`mousedown` con botón + modificadores), con `register` /
  `unregisterAll`, y un **hook compartido** con el push-to-talk (una sola instancia de `uIOhook`, con
  recuento de usuarios para arrancar/parar). `registerHotkeys` reparte cada acelerador a
  `globalShortcut` (teclas) o a `MouseHotkeys` (ratón).
- Renderer: en Ajustes → Atajos y en el atajo del overlay (Avanzado), «Editar atajo» acepta también una
  pulsación de los botones laterales (los botones izquierdo/derecho/central se ignoran con aviso).
- **Desactivar la navegación atrás/adelante del ratón en la app.** Hoy los botones laterales
  navegan el historial de pantallas como en un navegador (Windows los manda como
  `APPCOMMAND_BROWSER_BACKWARD/FORWARD` y Electron los ejecuta); con un atajo en `Mouse4`, pulsarlo
  con la app delante guardaría el clip **y** cambiaría de pantalla. Se anula siempre (no solo con un
  atajo asignado): la app no está pensada para navegarse con el ratón y así el comportamiento es
  predecible.
- Tests en shared, main (hook falso) y renderer.

**Fuera (explícito):**
- Botón central y botones 6+. Windows (y por tanto el hook) solo ve cinco botones de ratón: los
  ratones con **cuatro laterales** entregan los dos primeros como `Mouse4`/`Mouse5` y los otros dos
  solo existen a través del software del fabricante (G HUB, Synapse, SteelSeries GG…), que los emite
  como **teclas**; esas teclas ya sirven hoy como atajo de teclado sin tocar nada.
- Interceptar el botón para que no le llegue al juego (igual que con las teclas, no se intercepta).
- Botones de mando (acordes): queda anotado en el roadmap como futuro.

## Criterios de aceptación

- [ ] En Ajustes → Atajos, pulsar el botón lateral del ratón durante «Editar atajo» asigna `Mouse4` o
      `Mouse5` (con `Ctrl+`/`Alt+`/`Shift+` si se mantienen); izquierdo, derecho y central no asignan
      nada y avisan.
- [ ] Con «Guardar clip» en `Mouse4`, pulsar ese botón con la app en segundo plano guarda un clip; con
      `Ctrl+Mouse4` solo con Ctrl pulsado.
- [ ] Un atajo de ratón y el PTT en el mismo botón se rechazan como colisión, igual que con las teclas.
- [ ] Guardar atajos no reconstruye el pipeline (ya cubierto por `PIPELINE_SETTING_KEYS`) y re-registra
      solo lo que cambió.
- [ ] El hook global se arranca una sola vez aunque PTT y atajos de ratón estén activos, y se para
      cuando ninguno lo necesita.
- [ ] Con la app delante, los botones laterales del ratón **no cambian de pantalla** (ni con atajo
      asignado ni sin él); el resto de la navegación (menú lateral, botones «Volver») sigue igual.
- [ ] Suite verde; verificación real con el ratón del owner (y con `SendInput` para XBUTTON1/2).
