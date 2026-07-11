# Spec — Pistas de audio por rol, ordenadas y nombradas

**Tipo:** Feature
**Rama:** `feature/pistas-audio-por-rol`
**Fecha:** 2026-07-11

## Problema / Objetivo

Hoy, con "pistas de audio separadas" activo, el reparto de pistas es rígido y poco útil para
editar: pista 1 = mezcla completa, pista 2 = micrófono, pista 3 = apps extra (todas juntas),
y el audio del juego NO tiene pista propia (va solo dentro de la mezcla). El owner quiere un
reparto por **rol** que permita mutear/ajustar cada fuente por separado al editar:

- **Pista 1 — `default`:** la mezcla completa de todo (se conserva como está: los
  reproductores que solo leen la primera pista siguen oyendo todo).
- **Pista 2 — `game`:** el audio del juego **aislado**.
- **Pista 3 — `mic`:** el micrófono **aislado**.
- **Pistas 4/5/6 — una por app** adicional activa, **en el orden** en que están en los
  ajustes, nombradas con el ejecutable **sin `.exe`** (p. ej. `Discord`, `opera`).

Restricciones de diseño ya resueltas con el owner (2026-07-11):
- El layout aplica **solo en modo de audio `apps`** (captura por proceso). El modo
  `escritorio` es un único loopback del sistema y no permite separar juego de apps, así que
  queda **como está hoy** (pista 1 mezcla + pista 2 mic con "pistas separadas").
- libobs soporta **máximo 6 pistas de audio**. Con 1/2/3 fijas, quedan 3 para apps →
  **tope de 3 apps activas con captura de audio**; la UI lo limita/avisa.

Hallazgo técnico del spike (repro `osn-min/repro-names.js`, 2026-07-11): `AudioTrackFactory
.create(bitrate, name)` fija el nombre **interno** a libobs pero **NO lo escribe en el MP4**
(los streams salen como `SoundHandler` genérico, sin `title`). Para que el nombre quede en
el archivo hace falta un **remux post-grabación con ffmpeg** (ya bundleado): copiando streams
y seteando `handler_name`/`title` por pista, ffmpeg deja los nombres legibles (verificado:
`handler_name` pasa a `default`/`mic` y se relee). El owner pidió los nombres "de ser
posible" → se incluyen vía este remux (ver plan; es la parte con más costo).

## Alcance

**Dentro:**
- Nuevo reparto de máscaras por rol para **modo `apps` con `separateAudioTracks`**:
  `game` → pista 1+2, `mic` → pista 1+3, app #n (n=1..3) → pista 1 + pista (3+n). Toda
  máscara conserva el bit de la pista 1 (invariante de la mezcla).
- Helper puro y testeado que, dada la lista **ordenada** de apps activas, devuelve las
  máscaras por fuente y la lista de pistas `{ index, name }` a crear (con sus nombres
  `default`/`game`/`mic`/`<app sin .exe>`).
- Crear las pistas de libobs con esos nombres e índices.
- Tope de **3 apps** activas con audio en modo `apps`: validación en el modelo compartido y
  aviso/límite en la UI de ajustes de audio.
- Remux post-grabación con ffmpeg que escribe los nombres de pista en el MP4, **solo** cuando
  el reparto por rol está activo (modo `apps` + pistas separadas). Se aplica a la grabación
  manual y al clip del replay buffer.
- Verificación E2E: clip en modo `apps` con juego + mic + 2 apps sonando → el MP4 tiene las
  pistas en el orden y con los nombres esperados, la pista 1 lleva la mezcla y cada pista de
  rol está aislada (medible con `ffmpeg -map` + `volumedetect`).

**Fuera (explícito):**
- Cambiar el modo `escritorio` (queda idéntico; el layout por rol es exclusivo de `apps`).
- Renombrar pistas del modo `escritorio` o del caso `separateAudioTracks: false`.
- Reordenar apps por drag&drop en la UI (se respeta el orden actual de la lista; reordenar
  es otra tarea si se quiere).
- Editor de clips que muestre/mutee pistas por nombre (consumiría esta feature; va aparte).
- Más de 6 pistas / apps ilimitadas (límite duro de libobs).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Test (rojo→verde): el helper de reparto, dada `[appA, appB]` activas + juego + mic en
      modo `apps`, devuelve máscaras `game=0b000011`, `mic=0b000101`, `appA=0b001001`,
      `appB=0b010001` y pistas `[{1,'default'},{2,'game'},{3,'mic'},{4,'appA'},{5,'appB'}]`.
- [ ] Test: toda máscara incluye el bit de la pista 1 (la mezcla nunca se rompe).
- [ ] Test: el nombre de la app se deriva del ejecutable sin `.exe`, sin ruta y sin
      distinción de mayúsculas para el match (p. ej. `Discord.exe` → `Discord`).
- [ ] Test: la normalización de settings limita a 3 las apps activas en modo `apps` (las
      extra quedan en la lista pero desmarcadas / no capturadas).
- [ ] Test: el modo `escritorio` y el caso `separateAudioTracks: false` NO cambian de
      comportamiento (regresión).
- [ ] La UI de ajustes de audio impide/avisa marcar más de 3 apps con audio.
- [ ] E2E máquina real: clip en modo `apps` (juego + mic + 2 apps con tono) → `ffmpeg`
      lista 5 pistas de audio con `handler_name` `default/game/mic/<app>/<app>` en ese
      orden; la pista 1 tiene señal de todo y cada pista de rol solo su fuente.
- [ ] Suite completa verde (typecheck · lint · tests).
