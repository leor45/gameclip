# Tasks — Botón de captura del mando (DualSense / Xbox)

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.
**No empezar hasta que el plan esté aprobado.**

## Implementación

- [x] 0. **Espina GameInput — ✅ VALIDADA (2026-07-13).** Probe con MinGW cargando `GameInputInitialize`
       desde `GameInputRedist.dll` (v3): `SetFocusPolicy(EnableBackgroundShareButton)` +
       `RegisterSystemButtonCallback(GameInputSystemButtonShare)` → botón Compartir del Xbox por USB
       detectado 8/8, **también en segundo plano**. Fija: enlazar v3 vía redist, `SetFocusPolicy` es
       imprescindible.
- [x] 1. Ajuste `controllerCaptureEnabled: boolean` (default `false`) en `src/shared/capture.ts`
       (interfaz + `DEFAULT_CAPTURE_SETTINGS` + `normalizeCaptureSettings`).
- [x] 2. Helper `native/gc-controller-listen/main.cpp` — **vía HID (DualSense):** enumerar HID
       (SetupAPI + HidD), allowlist VID/PID (DualSense), lectura solapada + rescan por timeout,
       decodificar el bit Create (USB/BT), emitir `capture` en el flanco, bloquear en stdin.
- [x] 3. Helper — **vía GameInput (Xbox USB+BT):** init `IGameInput`, `SetFocusPolicy(background
       share)` + callback de `GameInputSystemButtonShare` → emitir `capture`; no-op si el runtime no carga.
- [x] 4. `native/gc-controller-listen/README.md` (contrato + build). `GameInput.h` **NO** vendorizado:
       se descarga del NuGet en build (licencia GPL vs redistribuible de Microsoft).
- [x] 5. `scripts/build-controller-listen.ps1` (calco de `build-haptic-mute.ps1`, `hid.lib`/`setupapi.lib`,
       GameInput por carga dinámica + fetch del NuGet); `.gitignore` para el `.exe` y `build/gameinput-sdk/`;
       `package.json` `build:native` compila los dos helpers.
- [x] 6. Wrapper `src/main/capture/controller-capture.ts` (`ControllerCaptureListener`): resolver
       ruta, spawn, leer líneas de stdout, invocar `onCapture` en `capture`; `apply(enabled, onCapture)`
       idempotente; `stop()`.
- [x] 7. Cablear en `src/main/capture/manager.ts`: inyectar listener, `applyControllerListener()` en
       `initialize()`/`setSettings()`, `stop()` en `shutdown()`.
- [x] 8. UI: `fieldset` con checkbox "Habilitar botón de captura de mandos" + hint (DualSense/Xbox
       USB/BT; leyenda de qué instalar para Xbox-USB vía GameInput; nota de Game Bar) en `Atajos.tsx`.
- [x] 9. Empaquetado: `resources/gc-controller-listen.exe` en `extraResources` de `electron-builder.yml`.
- [x] 10. (Añadido a pedido) Overlay de aviso de juego: bajo los atajos, línea "Captura con mandos
       habilitada" cuando la opción está activa. `OverlayNotice.controllerCapture` en
       [overlay.ts](../../../src/shared/overlay.ts) + render en [Overlay.tsx](../../../src/renderer/overlay/Overlay.tsx) + estilo `.overlay-card-note`.

## Tests unitarios (obligatorios)

- [x] `capture.test.ts` — `normalizeCaptureSettings` fija `controllerCaptureEnabled` a `false` por
      defecto y respeta `true`/`false`.
- [x] `controller-capture.test.ts` — con spawn inyectado: `apply(true)` arranca y `apply(false)` mata;
      `exit` limpia el estado; una línea `capture` por stdout invoca `onCapture`; varias → varias
      llamadas; líneas que no son `capture` se ignoran; sin binario → no-op; usa el callback más reciente.
- [x] `atajos.test.tsx` — el toggle se renderiza y alternarlo llama a `set('controllerCaptureEnabled', …)`.
- [x] `overlay.test.ts` / `overlay.test.tsx` — `buildGameNotice` marca `controllerCapture` según el
      ajuste; el overlay pinta "Captura con mandos habilitada" solo cuando está activa.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 595 tests.
- [x] E2E del **helper**: DualSense (USB) → Create emite `capture` 12/12; Xbox (USB) → Compartir emite
      `capture` (GameInput, 8/8 en la espina); flanco por pulsación; apagado limpio por EOF (exit 0).
- [ ] E2E en la **app completa** (pendiente): helper → `saveReplay` guarda el clip con overlay;
      Xbox por **Bluetooth**; hotplug sin reiniciar; opción off no lanza el helper; sin runtime
      GameInput = Xbox no-op y DualSense OK; portable en instalación limpia.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
