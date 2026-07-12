<div align="center">

# GameClip

**Grabador de clips de juegos para Windows. 100% local, sin nube, sin marca de agua y sin plan de pago.**

Captura retroactiva con una tecla, pistas de audio separadas por fuente y un editor que entiende
esas pistas — todo dentro de la misma app.

</div>

---

## Por qué existe esto

GameClip es un **proyecto personal y sin ánimo de lucro**. No hay empresa detrás, no hay modelo de
negocio, no hay cuenta premium: lo empecé para resolver un problema mío y lo publico por si le sirve
a alguien más.

El problema concreto: las apps de clips que existen capturan bien, pero el audio llega **mezclado en
una sola pista**. Si al revisar la partida resulta que el micro suena alto, que un amigo tosió en
Discord, o que la música del juego se come la voz, ya no hay nada que hacer — o vuelves a grabar, o
te resignas. La alternativa habitual es montar OBS con pistas separadas y editar en un programa
aparte: dos herramientas, dos configuraciones, un archivo que hay que exportar y arrastrar de una a
otra, y un flujo demasiado pesado para algo que quiero hacer treinta segundos después de una
partida.

Lo que yo quería era simple, y no lo encontré en ningún sitio:

> **Que el mismo software que captura el audio sea el que me deja editarlo, y que yo tenga el control
> real de lo que entra en cada pista.**

Eso es GameClip. Graba el juego, el micrófono y cada aplicación (Discord, el navegador, lo que sea)
en **pistas separadas y con nombre** dentro del mismo MP4. Después, en el editor integrado, marcas o
desmarcas las fuentes que quieres oír y guardas — la mezcla se rehace desde las pistas originales,
que nunca se tocan. Puedes cambiar de opinión mil veces sin degradar el clip ni volver a grabar.

Y ya que estaba, lo demás también: sin marca de agua, sin límite de resolución, sin suscripción para
desbloquear el bitrate. Todo lo que otras apps cobran como premium, aquí está y punto — porque el
motor de captura es el mismo que usan ellas ([libobs](https://obsproject.com/), el de OBS), solo que
sin nadie que te lo racione.

**Los clips son tuyos y se quedan en tu disco.** No hay subida a la nube, no hay telemetría, no hay
servidores míos por medio. Ni los quiero mantener ni los quiero pagar.

---

## Qué hace

### Captura

- **Clip retroactivo.** La app mantiene un buffer de repetición en segundo plano; pulsas la tecla
  (`F8` por defecto) y guarda los últimos segundos de juego que *ya habían pasado*. Es la razón de
  ser de la app: el clip nunca se pierde por haber reaccionado tarde.
- **Grabación manual** con hotkey (`F7`) y **modo automático**, que graba la sesión entera del juego
  y corta al cerrarlo o al cambiar de juego.
- **Grabación de escritorio** con selección de monitor, para lo que no es un juego.
- **Capturas de pantalla** con su propia tecla.
- **Detección automática de juegos**: la app sabe cuándo lanzas uno (lista curada, ampliable a mano
  con cualquier `.exe`) y activa el buffer sola.
- **Calidad sin recortes**: resolución, FPS, bitrate real hasta 100 Mbps o CQP automático, y
  aceleración por GPU (NVENC · AMF · QSV · x264 como último recurso).

### Audio — el motivo de todo

- **Pistas separadas y con nombre** en el MP4: la mezcla completa, el juego aislado, el micrófono, y
  una pista por cada aplicación que elijas (hasta 3, que es lo que da libobs).
- **Volumen por aplicación**, captura de audio **por proceso** (no del escritorio entero),
  **push-to-talk** global (teclado o Mouse4/5) y **supresión de ruido** del micrófono.
- En modo escritorio, opción de separar **PC y micrófono** en pistas distintas.

### Biblioteca y editor

- Biblioteca local con miniaturas, preview al pasar el cursor, búsqueda, filtros por juego,
  favoritos, etiquetas y organización en carpetas por juego.
- Límite de espacio en disco configurable con auto-borrado de lo más viejo (los favoritos no se
  tocan).
- **Editor integrado**: recorte con vista previa, exportación a MP4 o GIF, copiar al portapapeles y
  — lo importante — **mezcla de pistas de audio**: marcas las fuentes que quieres, guardas, y el
  clip de la biblioteca se reescribe conservando **todas** las pistas originales intactas. El edit
  es reversible siempre.

### Extras

- Overlay in-game, minimizar a la bandeja, auto-arranque con Windows, atajos configurables al estilo
  Discord (con detección de colisiones).

---

## Estado del proyecto

Funciona y lo uso a diario, pero es software personal en desarrollo: **espera aristas**. El roadmap
completo, con lo entregado, lo pendiente y los bugs abiertos —documentados con su causa raíz— está
en [`spec/constitution/roadmap.md`](spec/constitution/roadmap.md).

Limitaciones que conviene conocer de entrada:

- **Solo Windows.** La captura nativa (libobs, game capture) es lo que es, y no tengo intención de
  portarlo.
- El **overlay no se ve en fullscreen exclusivo** — es una ventana siempre-encima, no una inyección
  en el juego como la de Discord o Steam. Juega en ventana sin bordes si lo quieres ver.
- **Game capture y anticheats** no siempre se llevan bien; algunos juegos pueden requerir captura de
  monitor.
- Hay bugs conocidos y anotados; si te topas con uno, probablemente ya esté en el roadmap.

---

## Instalación

### Usar la app

Descarga el `.exe` **portable** desde la
[última release](https://github.com/leor45/gameclip/releases/latest) — no hay instalador: lo
ejecutas y ya. O constrúyelo tú:

```bash
npm install
npm run build:portable      # → release/GameClip-<version>-portable.exe
```

Requiere **Windows 10/11**. La primera vez, entra en Ajustes y configura la carpeta de salida, la
calidad y el audio.

### Desarrollo

```bash
npm install
npm run dev                 # app Electron (renderer + main)
npm run dev:server          # API Express (solo en dev; en producción va embebida)
```

Gates de verificación:

| Gate | Comando |
|---|---|
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Tests | `npm run test` |

---

## Cómo está hecho

| Capa | Tecnología |
|---|---|
| Escritorio | Electron 29.3.1 (versión fijada: la que soporta `obs-studio-node`) |
| Interfaz | React 18 + TypeScript + Vite (`electron-vite`) |
| Captura | **libobs** vía `obs-studio-node` — el mismo motor que OBS y Streamlabs |
| Edición | `ffmpeg-static` en el proceso main |
| API | Node + Express + TypeScript (embebida en el `.exe`) |
| Datos | SQLite (`better-sqlite3`), tras una capa de repositorio |
| Tests | Vitest |

```
src/
  main/        · proceso main: captura libobs, hotkeys, biblioteca, IPC
  preload/     · bridge seguro main ↔ renderer (contextIsolation activo)
  renderer/    · app React: biblioteca, editor, ajustes
  shared/      · tipos y constantes compartidos
server/        · API Express (auth, usuarios)
spec/          · el proyecto se desarrolla con un workflow spec-driven; aquí vive todo
```

El desarrollo sigue un flujo `spec → plan → tasks` documentado en
[`spec/work/README.md`](spec/work/README.md), y toda la documentación —incluidas las causas raíz de
cada bug arreglado— está en español dentro de `spec/`. Si vienes a entender **por qué** algo está
hecho así, empieza por ahí: probablemente ya esté explicado.

---

## Contribuir

No espero contribuciones ni las necesito para seguir, pero son bienvenidas. Si abres un issue con un
bug, incluye qué juego, qué ajustes y el log de libobs
(`%APPDATA%/gameclip/obs-data/node-obs/logs/`) — sin eso, un problema de captura es indistinguible
de la magia negra.

Si vas a mandar código, lee antes [`CLAUDE.md`](CLAUDE.md) y `spec/work/README.md`: hay un flujo, y
lo sigo también yo.

---

## Licencia

**GPL-3.0** — ver [`LICENSE`](LICENSE).

No es una elección estética: la app enlaza `obs-studio-node` (que es libobs, GPL-2.0) y redistribuye
el binario de FFmpeg de `ffmpeg-static` (GPL-3.0-or-later). El copyleft viene con el motor, así que
el proyecto es libre por obligación y por gusto a partes iguales. Mismo encuadre que hace Streamlabs
Desktop.

Úsalo, tócalo, forkéalo. Si lo mejoras, comparte lo que hiciste.
