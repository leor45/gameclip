# Plan — Reproductor interno (CSP + mezcla en pista 1)

> **Este plan es un contrato.** *Aprobación delegada al agente en esta sesión.*

## Enfoque

Diagnóstico primero (harness Electron limpio + sondas CDP sobre la app real) para aislar la
causa: el protocolo y sus privilegios eran correctos; el bloqueo era el CSP del renderer.
Fix mínimo con tests de regresión rojos→verdes antes de cada cambio.

## Archivos / módulos afectados

- `src/renderer/index.html` — CSP: `media-src 'self' gameclip-media:` e
  `img-src 'self' data: gameclip-media:`.
- `src/main/media-protocol.ts` — **nuevo**: scheme + privilegios documentados.
- `src/main/index.ts` — usa las constantes.
- `src/main/capture/obs.ts` — `audioTrackPlan` (pista 1 = mezcla) y rewiring de máscaras.
- Tests: `src/renderer/__tests__/csp.test.ts` (nuevo), `src/main/__tests__/media-protocol.test.ts`
  (nuevo), `obs-helpers.test.ts` (audioTrackPlan).

## Decisiones y alternativas consideradas

- **Arreglar el CSP y no quitarlo** — quitar el meta CSP también destapa el player, pero
  perder el CSP degrada la seguridad del renderer; se permite solo el scheme propio.
- **Revertido `standard: true`** que probé durante el diagnóstico: la matriz demostró que los
  privilegios originales bastan; cambiar la semántica de parsing del scheme sin necesidad es
  riesgo gratuito.
- **Pista 1 = mezcla estilo OBS** — alternativa descartada: reproducir/mezclar múltiples
  pistas en el player con WebAudio (complejo, no arregla exportes ni players externos).

## Riesgos

- El CSP de producción (file://) usa el mismo meta: verificar que las directivas nuevas no
  rompen dev (HMR/ws) ni el resto de la app (suite completa verde).

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada)
