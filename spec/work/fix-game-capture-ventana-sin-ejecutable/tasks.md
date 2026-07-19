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
- [x] 6. **Ampliación sobre el plan** (aprobada por el owner el 2026-07-19, tras la primera
      sesión de verificación con HD2). El matcher arreglado **resolvía la ventana correctamente**
      pero no se aplicaba nunca: el pipeline se construye al aparecer el **proceso** y la ventana
      del juego aparece 8 s más tarde (anti-cheat), sin que nada vuelva a apuntar.
      `ObsCapture.retryAimGameWindow()` + bucle acotado en el manager
      (`AIM_RETRY_INTERVAL_MS` 5 s × `AIM_RETRY_MAX` 24 = 2 min de margen). Para en cuanto apunta;
      agotado el tope se queda en `any_fullscreen`, el comportamiento previo. Un mismo intento
      cubre vídeo y audio.

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
- [x] **Regresión del re-apuntado**: reintenta hasta que la ventana aparece y entonces para.
- [x] Caso borde: llega al tope y deja de sondear (no se queda mirando para siempre).
- [x] Caso borde: en perfil de escritorio no reintenta nada.
- [x] Caso borde: cerrar el juego corta los reintentos en curso.
- [x] Caso borde: un backend que lanza no tumba el manager ni el bucle.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 891 (+16)
- [x] **Sesión 1 con Helldivers 2** (owner, 2026-07-19 05:35–05:37 UTC): clip **sigue negro y sin
      audio**, pero la sonda aisló exactamente qué falló y qué no:

  | Señal de la sonda | Valor | Lectura |
  |---|---|---|
  | `¿aparece en la lista?` | `SÍ → HELLDIVERS™ 2:stingray_window:unknown` | **el matcher funciona** (antes: `NO`) |
  | `capture_mode aplicado` | `any_fullscreen` | nunca se aplicó lo resuelto |
  | `priority aplicada` | `(sin settings)` | ídem |
  | `dimensiones game_capture` | `0x0` durante los 2 min | sin hook |
  | `audio del juego` | `::helldivers2.exe` | fijado al crear, nunca re-apuntado |

  Cronología: proceso a las 05:35:43 (pipeline construido, ventana **aún inexistente** → cae a
  `any_fullscreen`, correctamente) · ventana a las 05:35:51, **8 s después** · nadie vuelve a
  apuntar hasta que se cierra el juego. De ahí la tarea 6.

- [ ] **Sesión 2 con Helldivers 2 (owner, pendiente)**: con el re-apuntado. La sonda debe mostrar
      `capture_mode: window`, `priority: 0 (clase)` y dimensiones distintas de `0x0`; el clip, sin
      frames negros. Anotar si el audio del juego llega o sigue mudo — decide si esa mitad se
      cierra aquí o se va a otro spec.
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
