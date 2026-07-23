# Plan — Persistencia del overlay oculto y tarea elevada tras actualizar

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Dos cambios acotados, ambos con funciones puras testeables para que los tests fallen con el estado
actual antes de tocar Electron/Windows.

### 1. Estado persistido de visibilidad del overlay

Agregar un campo plano a `CaptureSettings`:

```ts
perfOverlayVisible: boolean; // default true
```

`perfOverlayEnabled` sigue significando "overlay activo y helpers vivos". `perfOverlayVisible` solo
controla si la ventana esta mostrada u oculta. Esto mantiene separadas las dos intenciones:

- Ajustes desactiva/activa el overlay completo.
- La accion configurable `perfOverlayHotkey` alterna solo `perfOverlayVisible` (`Alt+R` es solo el
  default).

`PerfOverlayController` pasa a recibir `visible` en `configure(enabled, config, visible)`. El handler
registrado para la accion `perfOverlayHotkey` ya no muta un booleano privado que se pierde al cerrar;
llama a `capture.setSettings({ perfOverlayVisible: !capture.getSettings().perfOverlayVisible })`. El
evento `settings` existente reconfigura el controller y persiste el cambio via `SettingsStore`.

Cuando el usuario cambia `perfOverlayEnabled` de `false` a `true` desde Ajustes, el renderer fuerza
`perfOverlayVisible: true` en el mismo guardado. Asi se conserva el comportamiento decidido en la spec
original: reactivar manualmente el overlay lo devuelve visible. En cambio, cerrar/reabrir la app no
toca ese campo.

### 2. Reparacion idempotente de la tarea elevada

Extender `elevated-launch.ts` con logica pura para comparar el action actual de la tarea con el action
esperado:

```ts
export function elevatedTaskRunCommand(exePath: string): string;
export function shouldRepairElevatedTask(currentTask: string | null, exePath: string): boolean;
```

Y agregar una operacion no destructiva:

```ts
ensureEnabled(exePath): Promise<boolean>
```

Flujo propuesto al arrancar empaquetada:

1. Si `autoLaunchElevated` esta apagado, no se consulta ni se toca la tarea.
2. Si esta encendido, se consulta la tarea existente sin elevar (`schtasks /Query /TN ... /XML` o `/V
   /FO LIST`, lo que resulte mas estable para parsear el `<Command>`/`<Arguments>`).
3. Si no existe o apunta a otro exe/args, se recrea con el mismo camino actual de UAC
   (`Start-Process -Verb RunAs` + `/Create ... /F`).
4. Si ya coincide, no se hace nada y no aparece UAC.

Esto corrige el caso de update sin pedirle al usuario que desactive/reactive. El peor caso si Windows
no permite consultar la tarea es conservar el comportamiento actual y dejar un log, no entrar en un
prompt UAC ciego en cada arranque.

### 3. Relanzamiento elevado en arranque manual

Extender `elevated-launch.ts` con dos piezas testeables:

```ts
export function isElevated(): Promise<boolean>;
export function relaunchElevated(exePath: string, args: string[]): Promise<boolean>;
```

`isElevated()` puede usar una comprobacion local sin UAC (por ejemplo `net session`, o una alternativa
PowerShell equivalente) y degradar a `false` si falla. `relaunchElevated()` usa `Start-Process -Verb
RunAs` sobre el ejecutable real (`PORTABLE_EXECUTABLE_FILE` si existe) y conserva argumentos relevantes
como `--hidden`.

El orden en `index.ts` es importante para no romper la limpieza del portable:

1. Mantener `barrerTemporales(true)` como primera accion dentro de `app.whenReady()`.
2. Leer settings.
3. Si `autoLaunchElevated` esta activo y `isElevated()` dice que no, intentar `relaunchElevated(...)`.
4. Si el relanzamiento arranca, liberar el single-instance lock, marcar salida real (`quitting = true`)
   y cerrar la instancia no elevada antes de crear API, captura, overlays o ventana.
5. Si el usuario cancela UAC, seguir con la instancia actual sin admin y dejar log; no apagar la app.

La limpieza no se salta: el arranque no elevado ya ejecuto `barrerTemporales(true)` antes de relanzar,
y su `app.quit()` sigue pasando por `will-quit`, donde se llama a `barrerTemporales()` otra vez. La
limpieza tampoco debe borrar el payload en uso porque `entornoReal(..., app.getPath('exe'))` marca la
carpeta del ejecutable actual como intocable.

## Archivos / módulos afectados

- `src/shared/capture.ts` — nuevo `perfOverlayVisible`, default y normalizacion.
- `src/shared/__tests__/perf.test.ts` o `capture.test.ts` — defaults/migracion del campo nuevo.
- `src/main/perf-overlay.ts` — reemplazar `oculto` interno por visibilidad recibida desde settings.
- `src/main/index.ts` — hotkey persiste `perfOverlayVisible`; wiring inicial y en evento `settings`.
- `src/renderer/views/ajustes/Avanzado.tsx` — al activar el overlay desde UI, forzar visible.
- `src/renderer/__tests__/ajustes-perf.test.tsx` — regresion de reactivacion visible si aplica.
- `src/main/elevated-launch.ts` — construir comando esperado, consultar tarea y asegurar reparacion.
- `src/main/__tests__/elevated-launch.test.ts` — regresiones de comparacion/reparacion idempotente.
- `src/main/index.ts` — early relaunch elevado tras limpieza de arranque y antes de inicializar la app.
- `src/main/__tests__/elevated-launch.test.ts` — pruebas de deteccion elevada y argumentos de relaunch.

## Decisiones y alternativas consideradas

- **Campo persistido separado (`perfOverlayVisible`)** — descartado meterlo dentro de
  `perfOverlay.enabled`: ya existe `perfOverlayEnabled` plano y mezclar activo/visible volveria a
  romper la semantica del atajo.
- **La accion configurable del hotkey guarda settings** — descartado mantenerla en memoria: es
  exactamente la causa del bug. No se acopla a `Alt+R`; usa la entrada `perfOverlayHotkey` ya
  configurable.
- **Reparar la tarea solo si difiere** — descartado recrearla siempre al arrancar: provocaria UAC en
  cada inicio de sesion, que contradice el objetivo original del auto-inicio elevado.
- **Consultar antes de elevar** — descartado ejecutar `/Create /F` directamente: arregla el path, pero
  a costa de un prompt recurrente.
- **Relanzar solo en arranque manual no elevado** — descartado elevar siempre: duplicaria UAC incluso
  cuando la tarea programada ya lanza elevada o el usuario abrio el exe como administrador.
- **Relanzar despues de inicializar la app** — descartado: abre ventana/API/captura por unos instantes
  en una instancia que va a morir y complica el single-instance lock. Debe ir tras la limpieza inicial
  y antes del resto del bootstrap.

## Riesgos

- **Formato de salida de `schtasks`:** XML es mas estable que texto localizado, pero hay que validar el
  parseo contra Windows real. Si falla la consulta, no debe bloquear el arranque.
- **Persistir desde hotkey:** `setSettings` es async; pulsaciones rapidas podrian llegar juntas. Se
  calculara contra `getSettings()` en el main y el evento de settings sera la fuente de verdad.
- **Migracion de settings existentes:** los usuarios sin `perfOverlayVisible` deben migrar a `true`
  para no ocultar el overlay por sorpresa.
- **Single-instance lock:** la instancia no elevada debe liberar el lock al relanzar, o la elevada se
  cerraria como segunda instancia. Si el UAC se cancela, no se libera ni se cierra.
- **Temporales del portable:** el relaunch puede abrir otra instancia del launcher portable. La red de
  seguridad es mantener la limpieza al principio y al cierre; la carpeta en uso sigue protegida por
  `exePath`.

---

**Estado:** ⏳ pendiente de aprobación
