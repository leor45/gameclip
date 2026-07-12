# Spec — Adelgazar el portable (arranque lento)

**Tipo:** Feature
**Rama:** `feature/adelgazar-portable`
**Fecha:** 2026-07-12

## Problema / Objetivo

El `.exe` portable **tarda ~16 s en abrir, siempre**. Medido en dos arranques seguidos: 15,5 s y
16,6 s — no es "la primera vez que tarda", no hay caché que valga.

La causa no es el código: el `.exe` pesa 190 MB comprimidos y **se autodescomprime 738 MB en `%TEMP%`
en cada ejecución**. Además el extractor deja carpetas huérfanas que nadie limpia (se encontraron
**4,15 GB** de restos en la máquina del owner tras unas pocas ejecuciones).

Y ese payload está lleno de lastre. De los **707 MB** que aporta `obs-studio-node`, **solo 90 MB son
libobs de verdad**:

| Qué | Peso | ¿Se usa? |
|---|---:|---|
| Símbolos de depuración (50 archivos `.pdb`) | **336 MB** | No. Sirven para depurar OBS, no para correrlo. |
| Navegador Chromium embebido (`libcef.dll`, `icudtl.dat`, `.pak`) | **265 MB** | No. Es para las *browser sources* de OBS; GameClip no las expone. |
| `mediasoup` (WebRTC de Streamlabs) | **14 MB** | No. Es para el streaming de Streamlabs. |
| libobs y sus plugins de captura/audio | 90 MB | **Sí.** |

Aparte, `ffmpeg-static` mete un `ffmpeg.exe` de **79 MB** que **duplica** el que osn ya trae: el de
osn pesa 302 KB (usa las DLLs de FFmpeg que osn ya incluye) y tiene todo lo que el editor necesita —
`libx264`, `gif`, `palettegen`, `paletteuse` y `amix` (verificado: FFmpeg n7.1.1).

**Objetivo:** que el portable arranque en un tiempo razonable, sacando del paquete lo que no se usa.

## Alcance

**Dentro:**

- Excluir del empaquetado los `.pdb`, el navegador embebido de OBS (CEF + `obs-browser`) y
  `mediasoup`.
- Usar el `ffmpeg.exe` que ya trae osn y sacar la dependencia `ffmpeg-static`.
- **Limpieza de los temporales huérfanos** (pedido del owner, 2026-07-12): al cerrar, la app borra
  las carpetas que dejaron sus ejecuciones anteriores, para que no se acumulen nunca más. Recortar el
  paquete reduce la basura; esto la elimina.
- Medir el antes/después: tamaño del `.exe`, del payload descomprimido y del arranque.
- Que la licencia de FFmpeg que se redistribuye siga viajando en el paquete (obligación GPL).

**Fuera (explícito):**

- Instalador NSIS o cualquier formato que no sea el portable (decisión de producto aparte).
- Borrar la carpeta **de la ejecución en curso**: es de donde corre el `.exe`, sus archivos están en
  uso y Windows no deja. La limpia el arranque siguiente, así que a lo sumo queda **una** carpeta
  viva, no una por ejecución.
- El bug de la grabación manual (1 frame) — tiene su propia rama.

## Resultado medido (2026-07-12)

| | Antes | Después |
|---|---:|---:|
| `.exe` | 190 MB | **93 MB** |
| Payload descomprimido en cada arranque | 738 MB | **418 MB** |
| Arranque | ~16 s | **~13,5 s** |
| Basura acumulada en `%TEMP%` | sin techo (4,15 GB) | **cero** (se limpia al cerrar) |

**La mejora del arranque es modesta, y conviene decirlo claro: la hipótesis inicial era que el tiempo
lo dominaba el tamaño del payload, y no es así.** Midiendo por fases: **10 s son la descompresión** y
3,5 s Electron + nuestro main. Al recortar el payload casi a la mitad, la descompresión bajó mucho
menos de lo proporcional (es LZMA, con el antivirus escaneando cada archivo nuevo).

Se midió también `compression: store` (payload sin comprimir): el arranque bajaba a ~11 s pero el
`.exe` saltaba a **419 MB** — cuadruplicar la descarga por 3 segundos no compensa, y se descartó.

**Conclusión honesta: ~13 s es el piso del formato portable**, porque descomprime 418 MB en cada
ejecución y eso no se puede evitar sin dejar de ser portable. El que arranca al instante es el
instalador (descomprime una sola vez); queda como decisión de producto, con su propio spec.

## Criterios de aceptación

- [ ] El `.exe` y el payload descomprimido bajan de forma medible (se anota el antes/después real).
- [ ] El arranque medido baja de forma medible respecto de los ~16 s actuales.
- [ ] **La captura sigue funcionando en el `.exe` recortado**: F8 guarda un clip real con sus pistas
      de audio nombradas (o sea que el remux con ffmpeg también corre).
- [ ] El editor sigue exportando MP4 y GIF con el ffmpeg de osn.
- [ ] La licencia de FFmpeg viaja en el paquete.
- [ ] **Abrir y cerrar el `.exe` dos veces deja como mucho una carpeta temporal**, no una por
      ejecución: la del arranque anterior desaparece.
- [ ] La limpieza **solo** toca carpetas que contienen el ejecutable de GameClip: el temporal de
      cualquier otro programa (otros `ns*.tmp` de NSIS) queda intacto.
- [ ] Gates verdes: type-check · lint · tests.
