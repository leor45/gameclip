# Spec — Overlay de rendimiento configurable

**Tipo:** Feature
**Rama:** `feature/overlay-rendimiento`
**Fecha:** 2026-07-18

## Problema / Objetivo

GameClip no ofrece ninguna lectura de rendimiento en juego. El objetivo es un overlay de
rendimiento al estilo NVIDIA App: métricas en tiempo real (FPS, GPU, CPU, RAM) sobre el juego,
configurable desde **Ajustes → Avanzado**, que conviva con los overlays existentes (REC, toast de
clip, aviso de juego) sin taparlos y que **nunca aparezca en las grabaciones** aunque esté visible
en pantalla.

Aplica a cualquier proceso que presente frames (juegos, emuladores…): los FPS se miden sobre el
juego activo que GameClip ya detecta, incluidos los añadidos a mano como juego manual.

## Alcance

**Dentro:**
- Sección nueva "Overlay de rendimiento" en Ajustes → Avanzado:
  - Activar/desactivar el overlay (switch en la sección).
  - Atajo configurable para mostrar/ocultar la visualización (default **Alt+R**). Solo alterna la
    visibilidad; qué se muestra lo siguen decidiendo los checks.
  - Un checkbox por métrica: FPS · uso de GPU (%) · temperatura de GPU · velocidad de fans de la
    GPU (RPM) · voltaje de la GPU · VRAM usada / total · uso de CPU (%) · temperatura de CPU ·
    RAM usada.
  - Posicionamiento estilo NVIDIA App: **dos sliders** (posición horizontal y vertical, 0–100)
    sincronizados con un **preset** con flechas (parte superior izquierda/central/derecha, parte
    central izquierda/derecha, parte inferior izquierda/central/derecha — 8 posiciones, nunca el
    centro de la pantalla). Mover un slider actualiza el preset mostrado; cambiar el preset fija
    los sliders. Mientras se arrastra, el overlay (si está activo) se mueve **en tiempo real**.
  - Disposición: lineal (una línea) o desglosada (lista vertical).
  - Color del texto y opacidad del fondo.
- Ventana overlay transparente, click-through, en el monitor primario, que pinta las métricas
  elegidas y se actualiza ~1 vez por segundo.
- Exclusión de capturas: el overlay no sale en clips ni grabaciones (ni de juego ni de
  escritorio), aunque esté visible en pantalla.
- Prioridad visual: el REC, el toast de clip guardado y el aviso de juego quedan **siempre por
  encima** del overlay de rendimiento.
- Degradación elegante: una métrica sin sensor disponible (p. ej. voltaje en GPUs que no lo
  exponen, o temperatura de CPU/FPS sin permisos de administrador) se muestra como `—`, sin
  romper el resto, con un hint en Ajustes cuando la causa son permisos.
- Los helpers de métricas van bundleados con impacto mínimo en el portable (~4–5 MB antes de
  compresión: helper de sensores sobre .NET Framework 4.8 —incluido en Windows— + PresentMon
  nativo); todo funciona offline.
- Opción opt-in "Iniciar con Windows como administrador" (tarea programada con privilegios
  elevados; una confirmación UAC al activarla), para que FPS y temperatura de CPU funcionen en el
  arranque automático.

**Fuera (explícito):**
- Overlay sobre juegos en fullscreen exclusivo (misma limitación conocida que el overlay actual).
- Multi-monitor (el overlay vive en el monitor primario, como los overlays existentes).
- Histogramas/gráficas de las métricas, logging a archivo o estadísticas post-partida.
- Cambiar el comportamiento de captura de los overlays existentes (REC/toasts) — si hoy salen en
  la grabación de escritorio, eso queda igual y sería otra tarea.
- Tamaño de fuente configurable (se fija un tamaño legible por defecto).
- Posición libre píxel a píxel fuera de los bordes (los sliders mueven el overlay a lo largo de
  los bordes; el centro de la pantalla queda excluido, como en NVIDIA App).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] En Ajustes → Avanzado puedo activar el overlay, marcar qué métricas ver y elegir posición
      (sliders + preset), disposición, color de texto y opacidad de fondo; los cambios se aplican
      sin reiniciar la app.
- [ ] Arrastrando el slider de posición con el overlay activo, este se mueve en pantalla en
      tiempo real y el preset mostrado cambia según la zona (p. ej. "Parte superior derecha").
- [ ] El atajo (Alt+R por defecto, configurable) muestra/oculta el overlay sin tocar el resto de
      la configuración.
- [ ] El overlay muestra en pantalla solo las métricas marcadas, con valores que se refrescan; los
      FPS se miden también sobre emuladores/juegos manuales detectados como juego activo.
- [ ] Con el overlay visible y en la misma esquina que un aviso, el REC / toast / aviso de juego
      se pintan por encima del overlay de rendimiento.
- [ ] Un clip (game capture) y una grabación de escritorio hechas con el overlay visible **no**
      contienen el overlay en el vídeo resultante.
- [ ] Una métrica no disponible en el hardware/permisos actuales aparece como `—` y las demás
      siguen funcionando; sin admin, Ajustes muestra el hint de permisos.
- [ ] Con el overlay desactivado no existe ventana ni proceso auxiliar de métricas corriendo.
- [ ] El exe portable crece como máximo ~5 MB respecto al build previo (medido antes/después) y
      las métricas funcionan sin conexión a internet.
- [ ] Con "Iniciar con Windows como administrador" activo, tras reiniciar sesión la app arranca
      elevada y FPS + temperatura de CPU dan valores reales.
