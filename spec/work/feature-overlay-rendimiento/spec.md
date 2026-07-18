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

## Alcance

**Dentro:**
- Sección nueva "Overlay de rendimiento" en Ajustes → Avanzado:
  - Activar/desactivar el overlay.
  - Un checkbox por métrica: FPS · uso de GPU (%) · temperatura de GPU · velocidad de fans de la
    GPU (RPM) · voltaje de la GPU · VRAM usada / total · uso de CPU (%) · temperatura de CPU ·
    RAM usada.
  - Posición: una de las 4 esquinas o el centro del borde superior.
  - Orientación: apaisada (una línea) o desglosada (lista vertical).
  - Color del texto y opacidad del fondo.
- Ventana overlay transparente, click-through, en el monitor primario, que pinta las métricas
  elegidas y se actualiza ~1 vez por segundo.
- Exclusión de capturas: el overlay no sale en clips ni grabaciones (ni de juego ni de
  escritorio), aunque esté visible en pantalla.
- Prioridad visual: el REC, el toast de clip guardado y el aviso de juego quedan **siempre por
  encima** del overlay de rendimiento.
- Degradación elegante: una métrica sin sensor disponible (p. ej. voltaje en GPUs que no lo
  exponen, o temperatura de CPU sin permisos) se muestra como `—`, sin romper el resto.

**Fuera (explícito):**
- Hotkey para mostrar/ocultar el overlay al vuelo.
- Overlay sobre juegos en fullscreen exclusivo (misma limitación conocida que el overlay actual).
- Multi-monitor (el overlay vive en el monitor primario, como los overlays existentes).
- Histogramas/gráficas de las métricas, logging a archivo o estadísticas post-partida.
- Cambiar el comportamiento de captura de los overlays existentes (REC/toasts) — si hoy salen en
  la grabación de escritorio, eso queda igual y sería otra tarea.
- Tamaño de fuente configurable (se fija un tamaño legible por defecto).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] En Ajustes → Avanzado puedo activar el overlay, marcar qué métricas ver y elegir posición,
      orientación, color de texto y opacidad de fondo; los cambios se aplican al guardar sin
      reiniciar la app.
- [ ] El overlay muestra en pantalla solo las métricas marcadas, con valores que se refrescan.
- [ ] Con el overlay visible y en la misma esquina que un aviso, el REC / toast / aviso de juego
      se pintan por encima del overlay de rendimiento.
- [ ] Un clip (game capture) y una grabación de escritorio hechas con el overlay visible **no**
      contienen el overlay en el vídeo resultante.
- [ ] Una métrica no disponible en el hardware/permisos actuales aparece como `—` y las demás
      siguen funcionando.
- [ ] Con el overlay desactivado no existe ventana ni proceso auxiliar de métricas corriendo.
