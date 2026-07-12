# Plan — Adelgazar el portable (arranque lento)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.

## Enfoque

Todo el recorte se hace **en el empaquetado**, no en `node_modules`: las exclusiones viven en
`electron-builder.yml` (patrones `!…` dentro de `files`), así que `npm install` sigue trayendo osn
entero y el desarrollo no cambia. Nada de borrar archivos del árbol de dependencias a mano — eso se
perdería en la próxima instalación y rompería a cualquiera que clone el repo.

Tres cortes, de menos a más riesgo:

1. **`.pdb` (336 MB) — riesgo cero.** Son símbolos de depuración de OBS; el `.exe` no los abre nunca.
   Un `!**/*.pdb` los saca todos.
2. **Navegador embebido de OBS (265 MB) — riesgo bajo.** `libcef.dll` + `obs-browser*` + `icudtl.dat`
   + los `.pak` existen para las *browser sources* de OBS, una fuente que GameClip no expone en
   ninguna pantalla. Si libobs no encuentra un plugin **no se cae: lo registra y sigue** — ya se ve
   hoy en el log (`Failed to load plugin: decklink`, `Failed to load plugin: obs-ndi`) y la captura
   funciona igual. Aun así, esto es lo que hay que **verificar sí o sí grabando** con el `.exe`
   recortado.
3. **`mediasoup` (14 MB) — riesgo bajo.** Es el WebRTC del streaming de Streamlabs; mismo argumento.

**FFmpeg (79 MB):** `ffmpeg-static` se va y el main pasa a usar el `ffmpeg.exe` de osn, que ya viaja
en el paquete y ya está desempaquetado. La ruta se resuelve como ya se resuelve la de osn (`obs.ts`
hace `require.resolve` + `unpackedPath`), así que sale una función chica y compartida en `paths.ts`.
**Verificado antes de proponerlo:** el ffmpeg de osn es n7.1.1 y trae `libx264`, `gif`, `palettegen`,
`paletteuse` y `amix` — exactamente lo que usan la exportación del editor y el remux de nombres de
pista. En dev resuelve igual, desde `node_modules`.

**Limpieza de los temporales (ampliación pedida por el owner).** El portable deja dos carpetas por
ejecución y nadie las borra: el **payload** (`%TEMP%\<aleatorio>\` con `GameClip.exe` y
`resources\app.asar` — es de donde corre el proceso) y el **staging del extractor**
(`%TEMP%\ns*.tmp\` con `7z-out\GameClip.exe` y el `app-64.7z`). Se acumulan sin techo: 4,15 GB en la
máquina del owner.

Al cerrar, la app barre `%TEMP%` y borra esas carpetas. La regla para no llevarse nada ajeno: **una
carpeta solo se toca si contiene nuestro propio ejecutable** —`GameClip.exe` en su raíz o en
`7z-out\`— comparando contra el nombre real del binario (`basename(app.getPath('exe'))`), no contra
un prefijo de nombre. Así, el `ns*.tmp` de cualquier otro instalador NSIS queda intacto; se
comprobó que en la máquina del owner hay tres de otros programas.

La carpeta de la ejecución en curso se **excluye**: sus archivos están en uso (el `.exe` corre desde
ahí) y Windows no permite borrarla. La barre el arranque siguiente, así que el saldo pasa de "una
carpeta por ejecución, para siempre" a "como mucho una viva". Todo es best-effort: si un borrado
falla (antivirus, un handle suelto), se registra y se sigue — cerrar la app nunca puede fallar por
esto, y de eso ya se encarga el `try/catch` por paso de `teardown()` (`fix/tray-destruida-al-cerrar`).

**Orden de trabajo:** primero se mide (hoy: 190 MB de `.exe`, 738 MB descomprimidos, ~16 s), después
se corta, y al final se vuelve a medir y a **grabar un clip de verdad con F8**. El criterio de éxito
no es que el `.exe` sea chico: es que sea chico **y siga grabando**.

## Archivos / módulos afectados

- `electron-builder.yml` — exclusiones (`files: !…`) y la licencia de FFmpeg en `extraResources`, que
  ahora sale de osn.
- `package.json` — fuera `ffmpeg-static`.
- `src/main/paths.ts` — `ffmpegPath()`: resuelve el binario de osn (desempaquetado en el paquete,
  `node_modules` en dev).
- `src/main/index.ts` — usa `ffmpegPath()` en vez del import de `ffmpeg-static`.
- `src/main/temp-cleanup.ts` *(nuevo)* — `carpetasHuerfanas()` (pura: recibe el listado y decide qué
  es nuestro) y `limpiarTemporales()` (la que borra). Separadas para poder testear la decisión sin
  tocar el disco, que es donde está el riesgo de barrer de más.
- `src/main/shutdown.ts` — un paso más en `teardown()`: la limpieza, al final.
- `src/main/__tests__/paths.test.ts` y `temp-cleanup.test.ts` — resolución del ffmpeg y, sobre todo,
  que la limpieza **no** toque el temporal de otro programa ni la carpeta en uso.

## Decisiones y alternativas consideradas

- **Excluir en el empaquetado, no podar `node_modules`** — lo segundo se revierte en cada
  `npm install`.
- **Reusar el ffmpeg de osn** — descartado seguir con `ffmpeg-static`: son 79 MB para duplicar un
  binario que ya viaja. Descartado también compilar un ffmpeg mínimo: no vale la complejidad.
- **No se toca `compression`** — con el payload en ~120 MB, el cuello de botella (descomprimir 738 MB
  en cada arranque) se va solo. Si tras medir sigue lento, se evalúa aparte.
- **El portable se mantiene** — un instalador NSIS arrancaría instantáneo (descomprime una sola vez),
  pero el owner pidió portable. Si tras el recorte el arranque sigue molestando, es la conversación
  siguiente, con su propio spec.

## Riesgos

- **El único riesgo real: que libobs necesite algo de lo que sacamos.** El plan lo acota a plugins que
  no usamos, y la evidencia dice que un plugin ausente solo se registra en el log. Se verifica
  grabando con el `.exe` recortado; si algo falla, el log de libobs lo dice con nombre y apellido, y
  el corte se revierte archivo por archivo (son patrones en un YAML).
- La licencia de FFmpeg tiene que seguir viajando (obligación de la GPL): hoy sale de `ffmpeg-static`
  y pasará a salir de osn.

- **La limpieza podría barrer de más.** Es el riesgo más caro de todos (borrar el temporal de otro
  programa). Se acota exigiendo que la carpeta contenga *nuestro* ejecutable, y la decisión se aísla
  en una función pura con tests que incluyen justamente el caso "un `ns*.tmp` ajeno".
- **La limpieza demora el cierre.** Borrar cientos de MB tarda. Se mide; si molesta, se evalúa
  hacerlo al arrancar en segundo plano (fuera del camino crítico).

---

**Estado:** ✅ aprobado el 2026-07-12 (con la ampliación de la limpieza de temporales)
