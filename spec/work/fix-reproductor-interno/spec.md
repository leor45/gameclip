# Spec — Reproductor interno: video bloqueado por CSP y mezcla ausente en la pista 1

**Tipo:** Fix
**Rama:** `fix/reproductor-interno`
**Fecha:** 2026-07-11

## Problema / Objetivo

El owner reporta que el reproductor interno "no funciona": el video no carga (pantalla negra).
Verificado en la app real vía CDP: el `<video>` falla con `MEDIA_ELEMENT_ERROR: Media load
rejected by URL safety check` y las miniaturas de la Biblioteca tampoco cargan.

**Causa raíz (1 — la reportada):** el CSP de `src/renderer/index.html` (de la Fase 1,
`default-src 'self'`) nunca se actualizó cuando la Fase 4 introdujo el protocolo
`gameclip-media://`; sin `media-src`/`img-src` que permitan el scheme, Chromium bloquea el
video del reproductor/editor y las miniaturas. El bug existía desde la Fase 4 en la app real
(los privilegios del scheme — secure+stream — eran correctos: en un harness sin CSP el mismo
protocolo reproduce y hace seek perfectamente; matriz de privilegios verificada).

**Causa raíz (2 — encontrada en el diagnóstico):** con `separateAudioTracks`, la pista 1 del
MP4 llevaba solo el audio del juego/escritorio; los reproductores (el interno incluido)
reproducen únicamente la primera pista, así que mic y apps quedaban inaudibles — y en modo
apps sin juego, la pista 1 era silencio total. Introducido en la Fase 7 con la migración a
pistas múltiples.

## Alcance

**Dentro:**
- CSP: permitir `gameclip-media:` en `media-src` e `img-src` (+ `data:` en img).
- Extraer los privilegios del scheme a `src/main/media-protocol.ts` (documentados y testeados).
- Pista 1 = mezcla completa siempre; con tracks separados, mic → 1+2 y apps → 1+3
  (helper puro `audioTrackPlan` en `obs.ts`).

**Fuera (explícito):**
- `supportFetchAPI` para el scheme (nada de la app usa fetch sobre él).
- El `connect-src` con puertos de dev hardcodeados (funciona; mejora aparte si molesta).

## Criterios de aceptación

- [x] Test de regresión del CSP (rojo→verde): `media-src` e `img-src` incluyen `gameclip-media:`.
- [x] Test de regresión de pistas (rojo→verde): toda máscara de `audioTrackPlan` incluye la
      pista 1; con separados mic=1+2, apps=1+3.
- [x] Verificado en la app real (CDP): `<video gameclip-media://clip/N>` llega a `canplay` y
      la miniatura carga (la app la regeneró sola tras el fix).
- [x] Gates verdes: typecheck · lint · tests.
