# Spec — Re-índice automático de juegos instalados

**Tipo:** Fix (síntoma: "no detecta juegos de GOG/Ubisoft"; causa raíz: índice sin refrescar en vivo)
**Rama:** `fix/reindice-automatico-juegos`
**Fecha:** 2026-07-15

## Problema / Objetivo

El owner instaló un juego de GOG (**Moonlighter**) y otro de Ubisoft (**Child of Light**) y la app no
los reconocía. La hipótesis inicial —que las fuentes GOG/Ubisoft estaban rotas— **se descartó con
datos reales**.

### Verificación de las fuentes (cierra el hueco "no verificable" del feature anterior)

`feature-deteccion-juegos-y-nombres/spec.md` dejó GOG, Ubisoft/EA/Battle.net y Xbox escritos contra
**fixtures**, sin poder verificarse E2E "hasta que haya un juego instalado en ellas" (esa máquina las
tenía vacías). Ahora sí hay juegos, y se ejecutó el pipeline de producción exacto contra la máquina:

- Fuente `gog` → `Moonlighter → E:\GOGLibrary\Moonlighter`.
- Fuente `registry` (Ubisoft) → `Child of Light → E:/ubisoft/Child of Light/` (publisher `Ubisoft`).
- `indexarEjecutables` produce `moonlighter → Moonlighter` y `childoflight → Child of Light`; los
  ejecutables ruidosos (`unins000`, `UnityCrashHandler64`, `DXSETUP`, `*Install*`, `vcredist`) se
  descartan bien.

Se arrancó la app Electron real: su `refreshGameIndex()` de arranque reconstruyó el índice (34 juegos,
68 ejecutables) y reescribió `games-index.json` con **ambos** juegos. **Las fuentes funcionan.**

### Causa raíz del síntoma

`games-index.json` estaba fechado el **2026-07-12**; los juegos se instalaron el **2026-07-15 10:49**.
El índice solo se (re)construye en **dos** momentos: al arrancar la app (`refreshGameIndex()` en
`app.whenReady`) y al pulsar **re-escanear** en Ajustes (IPC `rescan`). **No hay ningún refresco
mientras la app está abierta.** Si instalas un juego con GameClip corriendo, no se detecta hasta que
reinicias o re-escaneas a mano — que es justo lo que le pasó al owner.

**Objetivo:** que un juego instalado con la app abierta se detecte solo, sin reiniciar ni re-escanear a
mano, en un plazo razonable.

## Alcance

Enfoque **por actividad, no por reloj** (idea del owner, estilo Discord): en vez de un temporizador
ciego cada X minutos, se reacciona cuando **aparece un proceso nuevo que la app no reconoce**. Se
reutiliza el sondeo de procesos que el `GameDetector` **ya hace cada 5 s** (no se añade ningún bucle
nuevo siempre corriendo).

**Dentro:**

- **Detección de novedad en el sondeo existente**: el `GameDetector` toma una foto de los procesos al
  arrancar (línea base, sin disparar nada) y, en las pasadas siguientes, si aparece un proceso que
  (a) no estaba en la base, (b) no es de los que ya reconoce (índice de launchers / lista curada /
  juegos manuales), lo trata como **candidato a juego recién instalado** y pide un re-índice.
- **Re-índice reusando `refreshGameIndex()`**: propaga el índice nuevo al detector (`setIndex`), con lo
  que en la siguiente pasada (~5 s) el juego ya se detecta. Barato: la **huella** corta el escaneo de
  carpetas si la lista de los launchers no cambió, y `relabelGames` no toca la UI cuando no hay cambios.
- **Throttle (cooldown)**: no se re-indexa más de una vez por ventana corta, para que abrir varias apps
  a la vez no dispare una ráfaga de PowerShell. Cada ejecutable, además, dispara como mucho una vez
  (queda registrado como "ya visto").

**Fuera (explícito):**

- Vigilancia por eventos reales del SO (fs.watch de manifiestos Epic, notificaciones de cambio del
  registro de Windows). Más preciso pero frágil y específico de plataforma; el sondeo ya existente
  cubre el caso con una fracción del riesgo. Nota: Discord tampoco usa esto — sondea procesos.
- Temporizador periódico ciego de re-índice (la primera propuesta, descartada a favor de este enfoque).
- Cambios en las fuentes, el escaneo, el índice o el matching: **funcionan y no se tocan**.
- Detección instantánea (sub-sondeo): la latencia es la del bucle de 5 s más el re-índice, no cero.
- Cualquier cambio en la captura, el targeting de ventana o las pistas de audio.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con la app abierta, lanzar un juego recién instalado (cuyo `.exe` no estaba en el índice) provoca
      un re-índice y hace que se detecte solo, sin reiniciar ni pulsar re-escanear, en pocos segundos.
- [ ] El arranque no dispara el re-índice por novedad: la primera pasada solo fija la línea base (ya hay
      un `refreshGameIndex()` de arranque; no se duplica).
- [ ] Un proceso que la app ya reconoce como juego **no** dispara re-índice; un ejecutable que no es un
      juego dispara como mucho un re-índice (la primera vez que se ve) y respeta el cooldown.
- [ ] Cuando la lista de juegos no cambia, el re-índice es barato: no re-escanea carpetas (huella igual)
      y no emite `changed` a la biblioteca (cero parpadeo de UI).
- [ ] El sondeo de procesos sigue igual de barato: cero PowerShell en el camino caliente del sondeo; el
      re-índice (que sí usa PowerShell) corre aparte y con throttle.
- [ ] Test de regresión (rojo → verde): sin el mecanismo nuevo, un proceso nuevo no reconocido no pide
      re-índice (hoy no se detecta el juego hasta reiniciar); con él, sí lo pide — una vez, respetando
      base y cooldown.
- [ ] Gates verdes: type-check · lint · tests.
