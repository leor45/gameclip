# Spec — Silenciar el háptico del DualSense en la captura

**Tipo:** Feature
**Rama:** `feature/silenciar-haptico-dualsense`
**Fecha:** 2026-07-12

## Problema / Objetivo

El DualSense (PS5) en PC transporta la vibración háptica como **audio** por los canales de su
propio dispositivo de salida ("DualSense Wireless Controller"). En modo **Apps específicas**, la
captura por proceso de GameClip (`wasapi_process_output_capture`) graba **todo** lo que renderiza
el proceso del juego, incluido ese flujo háptico, así que el zumbido se cuela en el audio del clip.
Como es el mismo proceso, no se puede separar "juego sí, háptico no" a nivel de OBS.

El único arreglo limpio conocido —y verificado por el owner— es bajar a 0 el volumen de
**`obs64.exe` en el dispositivo del DualSense** en el Mezclador de volumen de Windows (volumen
por-aplicación-por-dispositivo). Pero ese ajuste es **por sesión de audio**: cuando GameClip
relanza/reconstruye la captura, la sesión de `obs64.exe` en ese dispositivo es nueva y el volumen
vuelve a 100. El owner tiene que rehacerlo a mano cada partida y a veces descubre tarde que un clip
quedó con el zumbido.

**Objetivo:** que GameClip reaplique ese silenciado **automáticamente** en cada arranque de
captura, sin intervención manual y sin sacrificar nada (el mando, sus botones, la vibración y el
audio del juego por los cascos siguen igual).

## Alcance

**Dentro:**
- Helper nativo propio (Windows Core Audio) que, dado un patrón de nombre de dispositivo y un
  nombre de proceso, pone a 0 (o mutea) la sesión de audio de ese proceso en ese dispositivo.
- Integración en el ciclo de captura: reaplicar el silenciado tras cada (re)construcción del
  pipeline / arranque de buffer, con reintentos cortos hasta que la sesión exista.
- Ajuste en la sección Audio para activar/desactivar la función e indicar el dispositivo a
  silenciar (por defecto: detectar "DualSense" / "Wireless Controller").
- Empaquetado del binario nativo junto a la app (build + electron-builder).

**Fuera (explícito):**
- Silenciar por canal / rematrix 5.1 dentro de OBS (otra estrategia, otro spec).
- Selector de dispositivo de captura de escritorio (feature aparte; no aplica a modo apps).
- Cualquier control de volumen por-app-por-dispositivo genérico expuesto al usuario más allá de
  este caso concreto.
- Soporte fuera de Windows (la plataforma objetivo es Windows).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con un DualSense conectado y la función activada, un clip grabado en modo Apps específicas
      **no** contiene el zumbido háptico, sin que el owner toque el Mezclador de volumen.
- [ ] El audio del juego (por los cascos/altavoces aparte) se graba normal, con su volumen intacto.
- [ ] La vibración física del mando y sus controles siguen funcionando durante el juego.
- [ ] El silenciado se reaplica tras reiniciar/reconstruir la captura (cambio de juego, re-arranque
      de buffer, nueva grabación) sin acción manual.
- [ ] Con la función desactivada, GameClip no toca ningún volumen del sistema.
- [ ] Sin DualSense presente (o sin sesión de `obs64.exe` en ese dispositivo), la función es un
      no-op silencioso: no rompe la captura ni genera errores visibles.
- [ ] El binario nativo se incluye en el paquete portable y funciona en una instalación limpia.
