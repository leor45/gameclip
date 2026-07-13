# Plan — Comprobar actualizaciones

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Todo el I/O de red vive en el **main** (Electron `net`, sin CORS/CSP); el renderer solo pide el
resultado por IPC y pinta. La comparación de versiones es una función pura en `@shared` (testeable sin
red).

1. **`@shared/version.ts`** — `compareVersions(a, b)` y `isNewer(latest, current)` sobre `X.Y.Z`
   (parse numérico, faltantes = 0, ignora sufijos raros). Función pura, unit-testeada a fondo.

2. **`src/main/updates.ts`** — `checkForUpdates(currentVersion, deps?)`:
   - `GET https://api.github.com/repos/leor45/gameclip/releases/latest` con `net.request`, header
     `Accept: application/vnd.github+json` y `User-Agent: GameClip`, **timeout ~5 s**.
   - Parsea `tag_name` (quita la `v`) y `html_url`. Devuelve
     `{ current, latest, updateAvailable, url }`.
   - `try/catch` total: cualquier fallo → `{ updateAvailable: false, latest: null, url: releasesUrl }`.
     `deps` inyecta el `fetch`/`request` para testear sin red.

3. **IPC** — nuevo canal `AppCheckUpdate: 'app:check-update'` en `@shared/ipc` (contrato
   `{ request: void; response: UpdateCheckResult }`); handler en `src/main/ipc.ts` que llama a
   `checkForUpdates(app.getVersion())`; método `checkForUpdate()` en el preload. Para abrir el release
   **no hace falta preload nuevo**: `setWindowOpenHandler` (index.ts:153) ya manda cualquier
   `window.open` al navegador, así que la UI abre la url con `window.open(url)`.

4. **Renderer — estado compartido** `src/renderer/updates/UpdateContext.tsx`:
   - Al montar, chequeo silencioso **una vez**; guarda `result` y un flag `mostrarModalArranque`
     (true solo si el chequeo de arranque encontró update).
   - Expone `{ result, comprobando, comprobar() }` para el botón manual y el aviso pasivo.

5. **Renderer — UI:**
   - `UpdateModal` (montado en `App`/layout): visible cuando `mostrarModalArranque && updateAvailable`;
     "Ver release" → `window.gameclip.openExternal(url)` (o reutilizar vía existente); "Ahora no" cierra
     y baja el flag (no vuelve a salir este lanzamiento).
   - `Sidebar`: encima de `<StorageIndicator />`, un bloque con el aviso pasivo (si `updateAvailable`)
     y el botón "Comprobar actualizaciones" con su estado (`comprobando`, "Estás al día ✓", "Hay vX").

## Archivos / módulos afectados

- `src/shared/version.ts` (nuevo) + `src/shared/__tests__/version.test.ts` — compare/isNewer.
- `src/main/updates.ts` (nuevo) + `src/main/__tests__/updates.test.ts` — checkForUpdates con `net`
  inyectable.
- `src/shared/ipc.ts` — canal `AppCheckUpdate`, tipo `UpdateCheckResult`, contrato.
- `src/main/ipc.ts` — handler del canal.
- `src/preload/index.ts` — `checkForUpdate()` (y `openExternal` si no existe ya).
- `src/renderer/updates/UpdateContext.tsx` (nuevo) — estado + chequeo de arranque.
- `src/renderer/components/UpdateModal.tsx` (nuevo) — modal de arranque.
- `src/renderer/components/Sidebar.tsx` — aviso pasivo + botón.
- `src/renderer/App.tsx` — envolver con `UpdateProvider` y montar el modal.
- `src/renderer/styles.css` — estilos del aviso/botón/modal.
- Tests de renderer: `UpdateContext`/`Sidebar` con el IPC mockeado.

## Decisiones y alternativas consideradas

- **Fetch en el main con `net`** vs `fetch` en el renderer — el renderer choca con la CSP y con la
  política de origen; el main no. Además el main es quien ya expone `app.getVersion()`.
- **Notificar + abrir navegador** vs auto-updater — decidido notificar (portable sin firma; el
  auto-update es otra feature). Confirmado con el owner.
- **Comparador propio** vs añadir `semver` — un `X.Y.Z` numérico no justifica una dependencia nueva.
- **Modal solo al arranque + aviso pasivo persistente** — el modal no debe reaparecer al re-chequear a
  mano (sería molesto); el aviso pasivo cubre "mientras la app corre". Confirmado con el owner.
- **Sin persistencia de "versión descartada"** — el modal se limita solito a una vez por lanzamiento;
  añadir estado persistido no aporta para el MVP.

## Riesgos

- **Rate limit de GitHub** (60 req/h por IP sin auth): un chequeo por arranque + los manuales están muy
  lejos del límite; si aun así falla, el fallo es silencioso.
- **Red corporativa/proxy** que bloquee api.github.com: el timeout y el catch lo cubren (queda como
  "estás al día" sin ruido; el botón manual puede decir "no se pudo comprobar").
- **Abrir el release**: resuelto con `window.open` + `setWindowOpenHandler` existente; sin superficie
  nueva en el preload.

## Notas de release (borrador, para el 0.6.0)

Versión: **0.6.0** (minor, feature nueva). Incluye el fix de borrado sin publicar.

```
## ✨ Novedades: GameClip te avisa cuando hay versión nueva

Hasta ahora no había forma de enterarse de que salía una actualización salvo pasando por GitHub.
Desde la 0.6.0, GameClip lo comprueba solo.

- **Aviso al arrancar:** si hay una versión más nueva publicada, la app te lo dice al abrirse, con un
  botón para ir directo al release y descargarla.
- **Botón «Comprobar actualizaciones»** en el menú lateral: compruébalo cuando quieras y te dice si
  estás al día o si hay algo nuevo esperando.
- Mientras la app está abierta, un aviso discreto en el menú te recuerda que hay una versión nueva.

Es solo un aviso: la descarga sigue siendo manual (bajas el portable del release), no se instala nada
solo. Y si te quedas sin internet, no molesta: falla en silencio.

## 🐛 Mejoras y estabilización

- Mejoras y estabilización de los procesos de borrado de clips: borrar un clip ahora lo elimina de
  forma fiable también del disco, incluso si lo estabas previsualizando.
```

---

**Estado:** ✅ aprobado el 2026-07-13 (OK del owner). Decisiones cerradas: modal **propio** (consistente
con la UI, no `dialog` nativo); notas con iconos ✨ / 🐛.
