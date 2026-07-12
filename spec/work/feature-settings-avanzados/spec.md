# Spec — Settings avanzados (paridad con las apps de clips)

**Tipo:** Feature
**Rama:** `feature/settings-avanzados`
**Fecha:** 2026-07-11

## Problema / Objetivo

Las fases de desarrollo están completas pero los Ajustes son un formulario plano con opciones
mínimas. Falta la paridad de configuración con las apps de clips del mercado: audio por aplicación
con tracks separados, selección de micrófono, calidad con bitrate, gestión de almacenamiento con
límite y auto-borrado, y opciones avanzadas de captura. Además, todo en una sola página produce un
scroll gigante: hay que desglosar Ajustes en submenús.

## Alcance

**Dentro:**

- **Audio**
  - Selección del dispositivo de micrófono entre los del sistema (enumerados vía libobs) + volumen.
  - Modo de captura de audio: todo el escritorio **o** apps específicas (lista con checkbox y
    volumen por app, vía `wasapi_process_output_capture`); entrada especial "Audio del juego"
    que sigue al juego detectado.
  - Toggle "tracks de audio separados" (juego/escritorio, micrófono y apps en pistas distintas
    del MP4) — requiere migrar la salida de Simple* a Advanced* factories de obs-studio-node.
- **Calidad**
  - Presets de calidad (Baja / Estándar / Alta / Personalizada) que fijan resolución + FPS + bitrate.
  - Bitrate configurable (3–100 Mbps) o modo automático por calidad (comportamiento actual).
  - FPS ampliado (24/30/60/120/144) y selección de encoder (ya existía).
- **Almacenamiento**
  - Selector de carpeta de clips con diálogo nativo (el modelo `outputDir` ya existía sin UI).
  - Límite de almacenamiento (GB) + auto-borrado de los archivos más viejos al superarlo.
  - Opción "solo borrar grabaciones largas" (nunca clips de replay) y "usar papelera de reciclaje".
  - Barra de uso del disco (clips / otros / libre) en la UI.
- **Avanzado**
  - Toggles: captura avanzada de ventana, captura experimental, compatibilidad HDR, forzar
    captura de ventana, mostrar cursor del mouse.
  - Buffer de grabación: `disk` | `memory`.
  - Aspect ratio: `game` (actual) · `stretch 16:9` · `16:9 con barras` · `crop 16:9`.
- **UX:** Ajustes desglosado en submenús (rutas anidadas): General · Calidad · Audio ·
  Almacenamiento · Avanzado.

**Fuera (explícito):**

- La sección "Clip Options" de la referencia (watermark, copiar links) — pedido explícito del owner.
- La sección "Development Mode" de la referencia (logging, SDK mode, aceleración por hardware).
- Cloud Sync / importación de grabadores externos — sin nube por ahora.
- Push-to-talk, supresión de ruido y test de micrófono (UI de Audio de la referencia): fase propia.
- **Limitación aceptada:** `recordingBuffer: 'disk' | 'memory'` se persiste y se expone en la UI,
  pero el buffer de repetición de libobs es siempre en RAM; hoy ambos valores se comportan igual
  (queda documentado en la UI y preparado para un motor de buffer a disco futuro).
- Los toggles avanzados se mapean *best-effort* a settings reales de libobs (ver plan); no se
  replica el motor de captura propio de las apps comerciales.

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] Ajustes muestra un submenú lateral con 5 secciones; `/ajustes` redirige a General y no hay
      un scroll monolítico.
- [x] Puedo elegir el micrófono entre los dispositivos del sistema y ajustar su volumen; se
      persiste y sobrevive a reinicio.
- [x] Puedo elegir entre capturar todo el escritorio o apps específicas; en modo apps puedo
      añadir/quitar apps en ejecución y ajustar volumen por app.
- [x] Con "tracks separados" activo, el MP4 resultante contiene pistas de audio separadas
      (verificado con ffmpeg en el selftest: streams 0:1 y 0:2).
- [x] Puedo elegir bitrate (3–100 Mbps) o dejar calidad automática; el pipeline lo aplica
      (verificado: ~15 Mbps CBR vs ~4.4 Mb/s CQP automático).
- [x] Puedo cambiar la carpeta de clips con un diálogo nativo y ver el uso de disco.
- [x] Con límite de almacenamiento y auto-borrado activos, al superar el límite se borran los
      archivos más viejos respetando "solo grabaciones largas" y "papelera de reciclaje".
- [x] Todas las opciones avanzadas se persisten y las que tienen mapeo real (cursor, aspect
      ratio, HDR, modos de captura) alteran el pipeline.
- [x] Ajustes inválidos desde disco/IPC caen a defaults campo a campo (normalización extendida).
- [x] Gates verdes: typecheck · lint · tests.
