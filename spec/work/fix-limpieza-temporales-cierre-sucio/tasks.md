# Tasks — La limpieza de temporales no se recupera de un cierre sucio

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 1. **Test de regresión primero (rojo).** Un staging huérfano sin marcador (solo `app-64.7z`)
       sobrevive hoy a la limpieza; se borra solo si la app registró su ruta en su día.
- [x] 2. `temp-cleanup.ts` — `stagingsActuales()`: el staging del extractor de ESTA ejecución.
- [x] 3. `temp-cleanup.ts` — `carpetasHuerfanas(entorno, registradas, excluir)`: una ruta registrada es
       nuestra aunque ya no quede dentro nada que lo demuestre.
- [x] 4. `temp-cleanup.ts` — `RegistroStaging` + `registroEnDisco()` (`userData/portable-temp.json`),
       con poda de rutas fantasma.
- [x] 5. `main/index.ts` — `barrerTemporales()` corre **al arrancar** (con registro) y al cerrar (sin).
- [x] 6. **Bug 2, encontrado verificando el `.exe`:** tras un apagón, un reinicio rápido (< 60 s) dejaba
       la basura intacta — `esAnterior` tomaba el staging huérfano por el de la ejecución en curso. Una
       ruta registrada se salta el filtro de edad: no puede ser la actual, porque la actual es una
       carpeta aleatoria recién creada que ninguna ejecución anterior pudo anotar.
- [x] 7. **Bug 3, encontrado verificando el `.exe`:** del segundo arranque en adelante el payload ya está
       en el temporal, así que el launcher **no crea `7z-out`**. Buscar ese marcador dejaba el staging sin
       registrar justo en el caso más común. El marcador pasa a ser `app-64.7z`, que está siempre.

## Tests unitarios (obligatorios)

- [x] **Regresión:** un staging sin marcador se borra si está registrado, y es invisible si no lo está.
- [x] Un `ns*.tmp` ajeno con `app-64.7z` NO se toca (nunca lo registramos).
- [x] **Regresión 2:** el staging registrado se borra aunque sea recentísimo (reinicio rápido).
- [x] **Regresión 3:** `stagingsActuales` reconoce el staging aunque no haya `7z-out` (payload cacheado).
- [x] El staging de la ejecución en curso se excluye y queda registrado para la siguiente.
- [x] Una ruta registrada que no se pudo borrar sigue anotada; una que ya no está se poda del registro.
- [x] `stagingsActuales` no reclama el staging de otro instalador NSIS que corra a la vez.
- [x] Sin registro, la limpieza se comporta exactamente como antes.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 546 tests
- [x] **Comprobación manual sobre el `.exe`**: tres ciclos apagón → arranque, matando también al launcher
      (que es lo que hace un corte de luz). Antes del fix, el arranque siguiente al apagón dejaba
      684 MB → **1031 MB** y 3 carpetas, creciendo. Con el fix: 684 MB → **516 MB** y siempre **2 carpetas**
      (payload + staging vivos), ciclo tras ciclo. El consumo queda **acotado** en vez de acumularse.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado
