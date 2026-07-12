# Spec — La carpeta apartada (`.borrar`) nunca se termina de borrar

**Tipo:** Hotfix
**Rama:** `hotfix/borrar-adoptado-como-staging`
**Fecha:** 2026-07-12
**Afecta a:** v0.4.1 (introducido por `fix/limpieza-temporales-cierre-sucio`)

## Problema

El owner encontró en `%TEMP%` una carpeta `nsl4E5E.tmp.borrar` de **118 MB** que la app no borraba.

El `.borrar` es el paso intermedio del borrado: `limpiarTemporales()` **renombra antes de borrar** (regla 3
del módulo) para no destruir nada a medias. Si el `rmSync` posterior falla, la carpeta queda apartada con el
sufijo y se reintenta en el arranque siguiente. Hasta ahí, por diseño.

Lo que no era diseño: **ese reintento nunca ganaba**. Son dos fallos encadenados, y el segundo es el grave —
el que hacía que la basura se acumulara sin techo, 118 MB por ciclo.

## Causa raíz 1 — un `.borrar` se confundía con el staging de la ejecución en curso

El reintento **no siempre ocurre**: el `.borrar` puede confundirse con el staging de la ejecución en curso.

`stagingsActuales()` identifica el staging de ahora por dos señales: tiene `app-64.7z` y **no** es de una
ejecución anterior (mtime dentro del margen de 60 s). Una carpeta recién apartada cumple las dos:

- conserva su `app-64.7z` (el borrado falló, el contenido sigue entero), y
- el **renombrado le acaba de tocar el mtime**, así que durante 60 s parece nueva.

Así que si la app se relanza dentro de ese minuto, su propio `.borrar` entra en `stagingsActuales()` → se
pasa como `excluir` a `carpetasHuerfanas()` → cae en `intocables`, y ese `return false`
(`temp-cleanup.ts:110`) **cortocircuita antes** de que se evalúe la regla del `.borrar`
(`temp-cleanup.ts:114`). La carpeta se salta *y además* se anota en el registro como si fuera el staging
vivo de esta ejecución.

**Reproducido sobre el `.exe` de v0.4.1**: se fabrica `nsPRUEBA1.tmp.borrar` con un `app-64.7z` dentro, se
arranca el portable → la carpeta sigue ahí y `portable-temp.json` la lista como staging propio.

**Arreglo:** un `.borrar` nunca puede ser el staging en curso —ese sufijo solo lo escribimos al dar una
carpeta por muerta—, así que `stagingsActuales()` lo excluye y la regla del `.borrar` vuelve a mandar sobre
esas carpetas, tengan la fecha que tengan.

## Causa raíz 2 — el borrado se bloqueaba a sí mismo (el `.asar`)

Con lo anterior arreglado, el reintento **seguía fallando**: `EBUSY` sobre
`<staging>\7z-out\resources\app.asar`, siempre el mismo fichero. El Restart Manager de Windows señaló al
culpable: **nuestro propio proceso principal**.

Electron intercepta toda operación de `fs` cuya ruta contenga un `.asar` y la trata como un archivo
empaquetado: **lo abre para leer su cabecera y deja el handle cacheado** el resto de la vida del proceso. El
staging que borramos lleva dentro el `app.asar` que el extractor descomprimió, así que el propio `rmSync`
hacía que Electron lo abriera — y el borrado moría con `EBUSY` **contra un handle que acabábamos de abrir
nosotros**, que ya no se soltaba.

De ahí el patrón exacto que veía el owner: `rmSync` aborta en el primer error, así que la carpeta queda a
medias con **118 MB** (los 93 del `app-64.7z` intactos, más el `7z-out`), y **ningún arranque posterior
podía rematarla**: volvía a bloquearse sola. Solo se dejaba borrar con GameClip cerrado del todo.

Y explica por qué la v0.4.1 pasó la verificación: en aquellos ciclos el launcher no extraía nada (el payload
ya estaba en el temporal) y **el staging no tenía `7z-out`** — ningún `.asar` en el árbol, ningún bloqueo.

**Arreglo:** el borrado corre con `process.noAsar = true` (`sinAsar()`), el interruptor que Electron trae
justo para esto. Con él, un `.asar` es un fichero más y se borra como cualquier otro. Se restaura el valor
anterior al salir, así que el resto de la app (que lee de su propio asar) no se entera.

## Fuera de alcance

- Tocar el margen de 60 s (`MARGEN_MS`) ni el resto de reglas del módulo.
- Perseguir el `obs64.exe` huérfano. No era el que bloqueaba: se comprobó matándolo, y la carpeta seguía
  sin poder borrarse.
- Que el propio NSIS limpie su staging (sigue fuera, como en la tarea anterior).

## Criterios de aceptación

- [x] Tests de regresión primero (rojo → verde): un `.borrar` con `app-64.7z` y mtime **de ahora** se borra,
      no se adopta; y no acaba en el registro como staging propio.
- [x] El borrado corre con el intérprete de asar apagado, y el valor se restaura aunque el borrado reviente.
- [x] El staging real de la ejecución en curso se sigue protegiendo y anotando (sin regresión).
- [x] Verificado sobre el `.exe`: tres apagones simulados seguidos dejan el temporal **plano en 937 MB**
      (un staging + un payload), sin residuo `.borrar`. Antes acumulaba 118 MB por ciclo.
- [x] Gates verdes: type-check · lint · tests (550).
