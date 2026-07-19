# Tasks — El game capture no engancha ventanas cuyo ejecutable libobs no puede leer

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 0. **Medir el enum `priority`**: volcado de la propiedad-lista de un `game_capture` real.
      Resultado: **`0` = clase · `1` = título · `2` = ejecutable**. La anotación previa del
      roadmap tenía el 0 y el 1 **invertidos** (corregida en esta rama): de haber hardcodeado de
      memoria habríamos pedido *título* creyendo pedir *clase*. Mismos valores en
      `wasapi_process_output_capture`. La semántica no es «solo por este campo»: el título se
      intenta siempre primero y el valor elige el campo de respaldo.
- [x] 1. Test de regresión primero (rojo): con el volcado real de HD2,
      `resolveGameWindow` devuelve la cadena de la ventana en vez de `null`.
- [x] 2. `normalizeWindowKey()` — helper puro: minúsculas, sin extensión, solo alfanuméricos.
      También quita los `#3A` (los `:` que libobs escapa en el título) y los diacríticos.
- [x] 3. `resolveGameWindow()` — segundo criterio subordinado sobre ventanas con exe `unknown`,
      con desempate a `null` si hay más de una candidata.
- [x] 4. Constantes de `priority` (valor de la tarea 0) y `gameCaptureSettings()` emitiendo la que
      corresponde según cómo se resolvió la ventana, vía `windowPriority()`.
- [x] 5. Audio: la misma resolución para el `wasapi_process_output_capture` del juego
      (`processCaptureSettings` recibe la ventana ya resuelta). Con el ejecutable legible se
      mantiene el `::<exe>` de siempre — ese matcher sí lo acepta y funciona.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde. Si es un Fix: el test de regresión va primero (rojo → verde).

- [x] **Regresión**: lista real de HD2 (`HELLDIVERS™ 2:stingray_window:unknown`) + exe
      `helldivers2.exe` → devuelve la cadena completa, no `null`.
- [x] **Regresión del camino que ya funcionaba**: un exe presente en la lista resuelve por
      ejecutable y `gameCaptureSettings` emite los mismos settings de hoy, `priority` incluida.
- [x] Caso borde: dos ventanas `unknown` cuyo título normalizado casa → `null` (no se adivina).
- [x] Caso borde: ventana `unknown` cuyo título no casa con el exe → `null`.
- [x] Caso borde: normalización con `™`, acentos, espacios, mayúsculas y `#3A`.
- [x] Caso borde: sin ejecutable detectado → `null` (como hoy).
- [x] Audio: con ventana resuelta se emite la cadena completa; sin ella, el `::<exe>` de hoy.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 886 (+11)
- [ ] **Comprobación manual con Helldivers 2 (la hace el owner, imprescindible)**: sesión real con
      la sonda activa. La sonda debe reportar dimensiones distintas de `0x0` y el clip tener
      imagen (`blackdetect` sin frames negros, YAVG > 0). Anotar también si el audio del juego
      llega o sigue mudo — decide si la mitad de audio se cierra aquí o se va a otro spec.
- [x] **Comprobación manual sin regresión** — 7 selftests con juego falso (`cs2.exe`) forzando el
      cambio de perfil:

  | Comprobación | Resultado |
  |---|---|
  | Vídeo | 1920×1080, 245 frames, 0 frames negros, YAVG ≈ 42 |
  | Pistas de audio | 3 separadas, con nombres de rol (`default`, `pc`, `mic`) |
  | Tamaño del clip | ~5.1–5.4 MB |

  **Incidencia anotada, sin cerrar:** la **primera** de las 8 ejecuciones del día (7 con el fix, 1
  sobre `main` como control) salió con `Total frames output: 1` y un MP4 de 261 bytes. Es el bug
  abierto de la grabación manual, que resultó **no estar obsoleto** sino ser intermitente. No se
  pudo atribuir a este fix —las 6 ejecuciones siguientes con el mismo código fueron correctas— pero
  con 1 fallo en 8 **tampoco queda descartado del todo**. Detalle y frecuencia medida en la entrada
  del roadmap de ese bug.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
- [ ] **Release 0.9.1** con este fix + `fix/fuga-fuentes-video-en-rebuild` (ya en `main`):
      bump del patch en `package.json` y commit `chore(release)`.
- [ ] Borrar la rama `probe/captura-hook-diagnostico` (`git branch -D`): era solo diagnóstico y
      nunca va a `main`.
