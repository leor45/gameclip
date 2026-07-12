# Spec — La limpieza de temporales no se recupera de un cierre sucio

**Tipo:** Fix
**Rama:** `fix/limpieza-temporales-cierre-sucio`
**Fecha:** 2026-07-12

## Problema / Objetivo

Apagar el PC (o que la app se cuelgue, o matarla) sin cerrar GameClip deja entre **94 y 515 MB** en
`%TEMP%` que **no se borran nunca**. Con el auto-arranque activado —que es el caso normal— eso se repite
en cada encendido. Es el origen de los 4,15 GB que se acumularon en la máquina del owner y que motivaron
`feature/adelgazar-portable`: aquella tarea añadió la limpieza, pero no cubrió el cierre sucio.

### Causas raíz (son dos, independientes)

**1. La limpieza solo corre al cerrar.** `limpiarTemporales()` cuelga de `will-quit`
(`src/main/index.ts:472`), dentro del `teardown`. Si el proceso muere sin pasar por ahí (apagón, cuelgue,
`taskkill /F`), nadie limpia — y **al arrancar tampoco**, así que esa basura no tiene ya ninguna
oportunidad de desaparecer. Un apagado normal de Windows *quizá* alcance a ejecutar el `will-quit`, pero
hay un presupuesto de tiempo y el `teardown` apaga libobs (lo lento) **antes** de limpiar: no se puede
depender de ello.

**2. Parte de la basura es invisible para la limpieza.** El portable deja dos carpetas por ejecución:
el payload (`GameClip-<versión>\`, nombre fijo → se reutiliza, no se multiplica) y el **staging del
extractor** (`nsXXXX.tmp\`, **nombre aleatorio → uno nuevo por arranque**). `carpetasHuerfanas()`
reconoce lo suyo por tres marcadores (`GameClip.exe`, `7z-out\GameClip.exe`, `obs64.exe`), pero un
staging que muere en el momento justo se queda solo con `app-64.7z` y las DLLs de NSIS, **sin ninguno de
los tres**. Ni siquiera un cierre limpio posterior se lo lleva. Y no se puede reclamar por `app-64.7z`:
lo produce cualquier app empaquetada con electron-builder + NSIS, así que barrerlo sería llevarse
temporales ajenos — justo lo que la regla 1 de `temp-cleanup.ts` evita a propósito.

**Reproducido y medido** (2026-07-12, sobre el `.exe` de v0.4.0): dos apagones simulados dejaron
`nsdFCF6.tmp` (515 MB, con marcador → recuperable) y `nsn6CB8.tmp` (94 MB, **sin marcador → permanente**).
Ejecutando la propia `carpetasHuerfanas()` contra ese `%TEMP%`: la de 515 MB se borra, la de 94 MB
sobrevive.

**Objetivo:** que el consumo quede **acotado**. Un cierre sucio seguirá dejando su carpeta —eso es
inevitable, un proceso muerto no limpia nada—, pero el **arranque siguiente** debe barrerla.

## Alcance

**Dentro:**

- La limpieza corre también **al arrancar** (además de al cerrar). Así un cierre sucio se recupera solo
  en el encendido siguiente, en vez de acumular para siempre.
- **Registro del staging propio**: al arrancar, el staging de esta ejecución **todavía tiene el marcador**
  (`7z-out\GameClip.exe`, recién extraído). Se anota su ruta en `userData`. En arranques posteriores, esa
  ruta se borra aunque para entonces haya degradado a un `app-64.7z` irreconocible. Se reclama por lo que
  **era** cuando no había duda, en vez de adivinar por un fichero genérico.
- Test de regresión primero: un staging huérfano sin marcador sobrevive hoy (rojo) y se borra después.

**Fuera (explícito):**

- Cambiar el orden del `teardown` para que la limpieza corra antes que el apagado de libobs. Ganaría
  algo en el apagado de Windows, pero no arregla el corte de luz ni el cuelgue: el arranque es la única
  red que atrapa **todos** los casos.
- Reclamar `nsXXXX.tmp` ajenos por heurística (`app-64.7z` a secas). Es exactamente el riesgo que la
  regla 1 evita.
- Tocar el empaquetado del portable (que el propio NSIS limpie su staging).
- Los ~500 MB del último apagón si el owner **nunca** vuelve a abrir la app: la limpieza necesita que algo
  corra. Inevitable, y acotado a una sola carpeta.

## Criterios de aceptación

- [ ] Un staging huérfano **sin marcador** (solo `app-64.7z`), cuya ruta quedó registrada en una ejecución
      anterior, **se borra** en el arranque siguiente.
- [ ] Un `nsXXXX.tmp` **ajeno** (de otro instalador NSIS, jamás registrado por nosotros) **no se toca**,
      tenga o no `app-64.7z`.
- [ ] El staging de la ejecución **en curso** no se borra (lo tiene abierto el launcher) y queda registrado
      para la siguiente.
- [ ] La limpieza corre al arrancar **y** al cerrar, y es idempotente.
- [ ] Un registro corrupto o ausente no rompe el arranque (best-effort, como el resto del módulo).
- [ ] Verificado sobre el `.exe`: apagón simulado → el arranque siguiente deja `%TEMP%` sin basura nuestra.
- [ ] Gates verdes: type-check · lint · tests.
