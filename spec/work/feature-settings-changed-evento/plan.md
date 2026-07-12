# Plan — Evento `settings:changed` (ajustes en tiempo real)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

La mitad del trabajo ya está hecha: `CaptureManager.setSettings` **ya emite** un evento `'settings'`
con los ajustes normalizados (`manager.ts:197`) — simplemente nadie lo escucha. Lo que falta es el
puente al renderer, calcado del que ya existe para el estado de captura y el catálogo:

1. `IpcEvent.SettingsChanged = 'settings:changed'` en el contrato compartido, con payload
   `CaptureSettings`.
2. En `index.ts`, junto a los otros puentes:
   `manager.on('settings', (s) => mainWindow?.webContents.send(IpcEvent.SettingsChanged, s))`.
   Emitir desde el **manager** y no desde el handler IPC es lo correcto: así cualquier camino del
   main que guarde ajustes (hoy la UI, mañana un import o un preset) notifica igual, sin acordarse.
3. Preload: `capture.onSettingsChanged(listener)` → devuelve la función de desuscripción, con el
   mismo patrón que `onStatusChanged`.
4. `StorageIndicator` se suscribe y actualiza el límite en el acto. La suscripción se limpia en el
   cleanup del `useEffect`, como las demás.

El indicador queda con dos fuentes: `library:changed` (cambian los bytes usados) y
`settings:changed` (cambia el límite). Cada una actualiza lo suyo.

## Archivos / módulos afectados

- `src/shared/ipc.ts` — `IpcEvent.SettingsChanged` y `CaptureApi.onSettingsChanged`.
- `src/main/index.ts` — puente `manager.on('settings')` → `webContents.send`.
- `src/preload/index.ts` — `onSettingsChanged`.
- `src/renderer/components/StorageIndicator.tsx` — se suscribe al evento.
- Tests: `src/renderer/__tests__/sidebar.test.tsx` — el anillo refleja el límite nuevo al emitirse
  `settings:changed`, sin tocar el catálogo; y `setup.ts` (mock del canal nuevo).

## Decisiones y alternativas consideradas

- **Emitir desde el manager, no desde el handler IPC**: el evento `'settings'` ya existe y cubre
  cualquier vía de guardado. Emitirlo en el handler ataría la notificación a que el cambio venga
  del renderer.
- **Payload con los ajustes completos** en vez de solo el campo cambiado: es lo que ya hace
  `capture:status-changed`, el objeto es pequeño y evita que cada consumidor tenga que pedirlos otra
  vez.
- **No tocar el formulario de Ajustes**: es el emisor del cambio; re-hidratarlo con su propio evento
  podría pisar lo que el usuario está editando. Queda fuera de alcance, anotado en el spec.

## Riesgos

- **Bucle de re-render** si algún consumidor guardara ajustes al recibir el evento. Hoy ninguno lo
  hace (el indicador solo lee), pero conviene tenerlo presente al añadir consumidores.

---

**Estado:** ✅ aprobado el 2026-07-11 (el owner autorizó auto-aprobar esta tarea concreta)
