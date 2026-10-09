# Spec — Editor avanzado: salir mientras carga el audio y ▶ tras el final recortado

**Tipo:** Fix
**Rama:** `fix/editor-avanzado-reproduccion`
**Fecha:** 2026-10-09

## Problema / Objetivo

Auditoría bug-hunter D, dos hallazgos de la reproducción del editor avanzado
(`src/renderer/views/EditorAvanzado.tsx`, `togglePlay`):

- **D6-BUG-1 (Medium) — salir mientras carga el audio deja el clip sonando.** El primer ▶ espera a
  `ensureAudioLoaded()` (extrae y decodifica el audio de cada pista: segundos en clips largos, con
  «Cargando audio…») y «Salir» sigue habilitado. Si el usuario sale, al desmontarse el editor
  `engine.dispose()` vacía las pistas del motor; al terminar la carga `hasBuffers()` da false y
  `togglePlay` hace `v.muted = false` + `v.play()` sobre el `<video>` ya desmontado: el clip suena de
  fondo sin forma de pararlo (y con el archivo abierto).
  **Causa raíz:** la continuación de `togglePlay` tras el `await` usa el `<video>` capturado antes de
  la carga sin comprobar que sigue montado.
- **D6-BUG-2 (Low) — con el final recortado, ▶ no hace nada tras llegar al final.** El bucle de
  reproducción para al pasar el último tramo conservado y solo lleva el cursor visual a su fin;
  `v.currentTime` queda pasado el rango. El siguiente ▶ reanuda desde ahí y el primer tick vuelve a
  parar (`nextKeptTime` es null): ▶ queda muerto hasta pulsar ■ o la timeline. Sin recorte no pasa
  porque el navegador reinicia desde 0 un vídeo terminado.
  **Causa raíz:** `togglePlay` arranca siempre desde `v.currentTime`, aunque por delante no quede
  nada conservado.

Al reutilizar para ese reinicio el «salto pendiente» del bucle (`skipTargetRef`) aflora un fallo del
mismo origen: ■ no anula un salto en curso. Si se pulsa ■ antes de que el vídeo aterrice y luego ▶
desde 0 con el principio recortado, el bucle cree que el salto sigue en curso, no lo re-emite y
reproduce lo recortado. Ya pasaba con el salto del principio recortado (▶ ■ ▶ seguidos); el reinicio
de ▶ lo haría más alcanzable, así que se corrige en el mismo paso.

## Alcance

**Dentro:**
- `togglePlay`: tras la carga del audio, si el `<video>` ya no es el montado, no se toca nada.
- `togglePlay`: si el cursor está fuera de todo tramo conservado y no queda ninguno por delante, ▶
  vuelve al inicio del primer tramo (vídeo y cursor visual) y el audio en vivo arranca ahí cuando el
  vídeo termina de buscar (el mismo mecanismo que el salto de huecos).
- `stop()` (■) anula el salto pendiente.
- Tests de regresión y de no-regresión.

**Fuera (explícito):**
- Deshabilitar «Salir» o cancelar la extracción de audio en curso al salir.
- ❚❚ durante un salto en curso (deja el salto pendiente; efecto benigno, ver el plan).
- Volúmenes cambiados durante «Cargando audio…» (hallazgo aparte, ver el plan).

## Criterios de aceptación

- [ ] Salir del editor mientras carga el audio: al terminar la carga, el `<video>` desmontado no se
      reproduce ni se desmutea y no arranca el audio en vivo.
- [ ] Con el editor abierto, al terminar la carga ▶ arranca como siempre (vídeo mudo y audio en vivo
      desde el cursor).
- [ ] Con el final recortado, tras llegar al final ▶ vuelve a empezar desde el inicio del primer
      tramo y sigue reproduciendo; con audio en vivo, el audio arranca en ese punto cuando el vídeo
      aterriza, no antes.
- [ ] ■ durante ese reinicio (o durante el salto del principio recortado) y luego ▶: se salta lo
      recortado.
- [ ] ▶ dentro de un tramo no reposiciona; en un hueco con tramos por delante el bucle salta el hueco
      como siempre; un clip sin recortar vuelve a empezar desde 0 al terminar.
- [ ] Suite verde.
