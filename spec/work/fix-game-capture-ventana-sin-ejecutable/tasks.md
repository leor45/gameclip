# Tasks — El game capture no engancha ventanas cuyo ejecutable libobs no puede leer

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [ ] 0. **Medir el enum `priority`**: volcar los items de la propiedad-lista de un `game_capture`
      real (nombre + valor) y anotar el mapeo. Bloquea a la tarea 4 — sin esto, el número se
      estaría adivinando. Corregir de paso la anotación de `spec/constitution/roadmap.md`.
- [ ] 1. Test de regresión primero (rojo): con el volcado real de HD2,
      `resolveGameWindow` devuelve la cadena de la ventana en vez de `null`.
- [ ] 2. `normalizeWindowKey()` — helper puro: minúsculas, sin extensión, solo alfanuméricos.
- [ ] 3. `resolveGameWindow()` — segundo criterio subordinado sobre ventanas con exe `unknown`,
      con desempate a `null` si hay más de una candidata.
- [ ] 4. Constantes de `priority` (valor de la tarea 0) y `gameCaptureSettings()` emitiendo la que
      corresponde según cómo se resolvió la ventana.
- [ ] 5. Audio: la misma resolución para el `wasapi_process_output_capture` del juego
      (`processCaptureSettings` recibe la ventana ya resuelta).

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [ ] **Regresión**: lista real de HD2 (`HELLDIVERS™ 2:stingray_window:unknown`) + exe
      `helldivers2.exe` → devuelve la cadena completa, no `null`.
- [ ] **Regresión del camino que ya funcionaba**: un exe presente en la lista resuelve por
      ejecutable y `gameCaptureSettings` emite los mismos settings de hoy, `priority` incluida.
- [ ] Caso borde: dos ventanas `unknown` cuyo título normalizado casa → `null` (no se adivina).
- [ ] Caso borde: ventana `unknown` cuyo título no casa con el exe → `null`.
- [ ] Caso borde: normalización con `™`, acentos, espacios y mayúsculas.
- [ ] Caso borde: sin ejecutable detectado → `null` (como hoy).
- [ ] Audio: con ventana resuelta se emite la cadena completa; sin ella, el `::<exe>` de hoy.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] **Comprobación manual con Helldivers 2 (la hace el owner, imprescindible)**: sesión real con
      la sonda activa. La sonda debe reportar dimensiones distintas de `0x0` y el clip tener
      imagen (`blackdetect` sin frames negros, YAVG > 0). Anotar también si el audio del juego
      llega o sigue mudo — decide si la mitad de audio se cierra aquí o se va a otro spec.
- [ ] **Comprobación manual sin regresión**: un juego que ya funcionaba sigue grabando con imagen
      y con las pistas de audio separadas.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
- [ ] **Release 0.9.1** con este fix + `fix/fuga-fuentes-video-en-rebuild` (ya en `main`):
      bump del patch en `package.json` y commit `chore(release)`.
- [ ] Borrar la rama `probe/captura-hook-diagnostico` (`git branch -D`): era solo diagnóstico y
      nunca va a `main`.
