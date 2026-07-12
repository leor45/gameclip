# Plan — Sección Atajos

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Hoy no existe ningún módulo de atajos: el catálogo de acciones está implícito en `registerHotkeys()`
(`src/main/index.ts:287-322`), la detección de colisiones vive dentro de esa función (un `Set` local)
y el renderer no sabe nada. El plan es **extraer el dominio a `src/shared/hotkeys.ts`** (puro,
testeable, compartido main ↔ renderer) y construir la UI encima.

### 1. `src/shared/hotkeys.ts` (nuevo, puro)

```ts
export type HotkeyKey = 'replayHotkey' | 'recordingHotkey' | 'screenshotHotkey' | 'gameSwitchHotkey';

/** Catálogo: única fuente de verdad de qué acciones hay (la usan la UI y el registro del main). */
export const HOTKEY_ACTIONS: {
  key: HotkeyKey;
  label: string;          // "Guardar clip"
  description: string;    // "Captura los últimos N segundos…"
  /** Interruptor que la habilita, si tiene uno (screenshotsEnabled / gameSwitchEnabled). */
  enabledBy?: 'screenshotsEnabled' | 'gameSwitchEnabled';
  /** true si depende de que recordingMode no esté en 'off' (clip y grabación). */
  needsRecording?: boolean;
}[]

/** Acelerador desde una pulsación del teclado (evento del DOM ya despiezado). */
export function accelFromKeyPress(e: {key, code, ctrlKey, altKey, shiftKey, metaKey}): string | null;

/** ¿Es un acelerador que Electron acepta? (modificadores + una tecla base soportada) */
export function isValidAccelerator(accel: string): boolean;

/** Acciones que comparten tecla, agrupadas — para pintar la colisión y bloquear el guardado. */
export function hotkeyCollisions(settings: CaptureSettings): HotkeyKey[][];

/**
 * ¿Choca este acelerador con la tecla del push-to-talk? El PTT usa otro motor (uiohook) pero la
 * MISMA tecla física: si el atajo es la tecla suelta del PTT (`F9`), pulsarla dispararía las dos.
 * Reservada aunque el PTT esté apagado, para que encenderlo luego no rompa un atajo ya guardado.
 * `Mouse4/Mouse5` no son aceleradores, así que nunca chocan.
 */
export function isPttReserved(accel: string, pttHotkey: string): boolean;
```

`accelFromKeyPress` devuelve `null` mientras solo haya modificadores pulsados (así el botón sigue "a
la escucha" hasta que llegue la tecla base, como Discord), y normaliza al formato de Electron:
`Ctrl+Shift+S`, `Alt+C`, `F8`.

### 2. Ajuste nuevo

`recordingHotkey: string` (default `'F7'`, libre entre los actuales: F6 captura · F8 clip · F9 PTT ·
F10 cambio de juego) en `CaptureSettings`, con su default y su normalización (mismo trato que los
otros aceleradores: string no vacío, si no cae al default).

### 3. Main

- `registerHotkeys()` (`index.ts:287`) pasa a **iterar `HOTKEY_ACTIONS`** en vez de tener las cuatro
  acciones a mano, y usa `hotkeyCollisions()` para descartar duplicados (misma política que hoy, pero
  con la lógica compartida y testeable).
- Acción nueva del atajo de grabación: alterna según el estado
  (`manager.getStatus().state === 'recording' ? stopRecording() : startRecording()`), y solo se
  registra si `recordingMode !== 'off'`.
- `buildGameNotice()` (`src/shared/overlay.ts`) menciona también el atajo de grabación.

### 4. Renderer

- **`views/ajustes/Atajos.tsx`** (nuevo): una fila por acción del catálogo — nombre + descripción a la
  izquierda, tecla actual + botón "Editar atajo…" a la derecha (el diseño de la referencia). Estado
  local `capturando: HotkeyKey | null`; mientras captura, el botón dice "Pulsa una combinación…" y un
  listener de `keydown` en `window` resuelve la tecla con `accelFromKeyPress` (`Esc` cancela, el
  `blur` también). Fila marcada en rojo si está en una colisión; con colisiones, el botón "Guardar
  ajustes" queda deshabilitado con su aviso.
- Botón **"Restablecer atajos por defecto"**: escribe en el estado local los defaults de las cuatro
  claves (`DEFAULT_CAPTURE_SETTINGS`), sin tocar el resto; el guardado es el normal.
- **Tecla del PTT reservada**: al capturar, si `isPttReserved(accel, settings.pttHotkey)` la
  pulsación se rechaza con el motivo ("`F9` está reservada para el push-to-talk") y el botón sigue a
  la escucha. La sección lleva una leyenda permanente con esa tecla y un enlace a Audio para
  cambiarla. El main **no** necesita cambios por esto: reservándola en la captura, ningún atajo
  guardado puede coincidir con ella.
- Registro de la sección: `AjustesLayout.tsx` (entrada "Atajos") + ruta en `App.tsx`.
- **General.tsx** y **Grabacion.tsx**: los `<input type="text">` de `replayHotkey`,
  `screenshotHotkey` y `gameSwitchHotkey` pasan a ser una tecla en texto (misma píldora que en
  Atajos) + enlace "Editar en Atajos". Los interruptores (activar cambio de juego / capturas) se
  quedan donde están.
- CSS en `styles.css`: `.hotkey-list` / `.hotkey-row` / `.hotkey-info` / `.hotkey-key` (la píldora
  con la tecla) / `.hotkey-capturing` / `.hotkey-conflict`, reutilizando el patrón de
  `.audio-app-row` que ya existe.

## Archivos / módulos afectados

- `src/shared/hotkeys.ts` — **nuevo**: catálogo, `accelFromKeyPress`, `isValidAccelerator`,
  `hotkeyCollisions`.
- `src/shared/capture.ts` — `recordingHotkey` (tipo, default `'F7'`, normalización).
- `src/shared/overlay.ts` — el aviso in-game incluye el atajo de grabación.
- `src/main/index.ts` — `registerHotkeys()` sobre el catálogo + acción de grabación (toggle).
- `src/renderer/views/ajustes/Atajos.tsx` — **nuevo**.
- `src/renderer/views/ajustes/AjustesLayout.tsx`, `src/renderer/App.tsx` — alta de la sección/ruta.
- `src/renderer/views/ajustes/General.tsx`, `Grabacion.tsx` — atajos informativos + enlace.
- `src/renderer/styles.css` — clases de la lista de atajos.
- Tests: `src/shared/__tests__/hotkeys.test.ts` (**nuevo**: catálogo, `accelFromKeyPress` con
  modificadores/`Esc`/teclas no soportadas, `isValidAccelerator`, colisiones),
  `src/shared/__tests__/capture.test.ts` (`recordingHotkey`), `src/shared/__tests__/overlay.test.ts`,
  `src/renderer/__tests__/atajos.test.tsx` (**nuevo**: captura de pulsación, cancelar con `Esc`,
  colisión bloquea el guardado, restablecer defaults), y ajuste de los tests de `ajustes.test.tsx` /
  `grabacion.test.tsx` que hoy editan los atajos por `<input>`.

## Decisiones y alternativas consideradas

- **Catálogo compartido en vez de listas paralelas**: hoy las acciones están escritas a mano en el
  main y la UI las repite pieza a pieza. Con `HOTKEY_ACTIONS` como fuente única, añadir un atajo es
  una entrada del array (y por eso el de grabación sale casi gratis).
- **Colisión bloquea el guardado** en vez de descartar la segunda acción en silencio (lo de hoy):
  guardar algo que no va a funcionar y no decirlo es la peor de las opciones.
- **Sin estado "sin asignar"**: la referencia de Discord lo tiene ("No has configurado…"), pero aquí
  cada acción ya tiene su interruptor para apagarla, y permitir el vacío obligaría a cambiar la
  normalización (hoy un atajo en blanco cae al default, con test que lo fija).
- **`F7` para grabar**: es el único hueco entre las teclas ya usadas (F6/F8/F9/F10).
- **El PTT no entra** (decisión del owner): otro motor, otro formato, lista blanca cerrada.

## Riesgos

- **Un atajo válido puede seguir fallando** si otra app (Discord, el juego, Windows) ya lo tiene
  tomado: `globalShortcut.register()` devuelve false y no hay forma fiable de saber quién lo tiene.
  Sigue igual que hoy — queda fuera de alcance, pero conviene no prometer lo contrario en la UI.
- **La captura de teclas ocurre en el renderer** (evento del DOM), así que solo funciona con la
  ventana de Ajustes enfocada; es exactamente el comportamiento de Discord y de la referencia.
- **Teclas base no soportadas por Electron** (p. ej. teclas muertas o de medios raras): se rechazan al
  capturar en vez de aceptarlas y fallar luego en silencio.

---

**Estado:** ⏳ pendiente de aprobación
