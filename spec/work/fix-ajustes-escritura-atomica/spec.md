# Spec — Los ajustes se escriben sin atomicidad: un cierre sucio los deja en defaults

**Tipo:** Fix
**Rama:** `fix/ajustes-escritura-atomica`
**Fecha:** 2026-10-08

## Problema / Objetivo

Auditoría bug-hunter B, BUG-5 (Low, integridad de datos). `SettingsStore.save` reescribe
`capture-settings.json` entero con `writeFileSync` sobre el fichero final (truncado + escritura, no
atómico) y `load()` convierte cualquier JSON ilegible en defaults **sin avisar**. Un apagón, BSOD o
kill durante uno de los saves (son frecuentes: atajo del overlay, sincronización de exclusiones,
cualquier sección de Ajustes) deja el fichero truncado y el usuario pierde atajos, carpeta, juegos
manuales y exclusiones.

**Causa raíz:** escritura no atómica y sin copia de respaldo del último estado válido.

## Alcance

**Dentro:**
- `save`: escribir a `<fichero>.tmp` y `renameSync` sobre el definitivo (mismo volumen → atómico),
  como ya hacen `track-names.ts` y `audio-edit.ts`. Antes de pisar, copiar el principal a
  `<fichero>.bak` si parsea (nunca se respalda basura).
- `load`: si el principal no parsea, intentar el `.bak`; solo después, defaults. El fallback se
  registra en el log.
- Tests de regresión.

**Fuera (explícito):**
- Avisar al usuario en la UI de que se recuperó del respaldo.
- Lo mismo para `games-index.json` (es un caché que se reconstruye solo).

## Criterios de aceptación

- [ ] Tras `save`, no queda `.tmp` y el fichero principal parsea.
- [ ] Con el principal truncado y un `.bak` válido, `load()` devuelve los ajustes del `.bak`.
- [ ] Un principal corrupto nunca se copia al `.bak`.
- [ ] Suite verde.
