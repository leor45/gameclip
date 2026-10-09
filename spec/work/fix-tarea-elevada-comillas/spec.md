# Spec — La tarea de auto-inicio elevado nunca se reconoce como correcta

**Tipo:** Fix
**Rama:** `fix/tarea-elevada-comillas`
**Fecha:** 2026-10-08

## Problema / Objetivo

Con «Iniciar con Windows como administrador» activo, en **cada** arranque empaquetado la app cree que
la tarea programada está mal y la vuelve a crear elevando (`Start-Process schtasks -Verb RunAs`). Si la
app arrancó elevada, la recreación es silenciosa pero inútil; si el owner canceló el UAC del relanzado
elevado, la app sigue sin admin y **pide un segundo UAC** enseguida.

### Causa raíz (auditoría bug-hunter 2026-10-08, BUG-6, verificada con la tarea real)

`elevatedTaskMatches` (`src/main/elevated-launch.ts`) compara el `<Command>` del XML con la ruta
**sin comillas**, pero `schtasksCreateArgs` crea la acción con la ruta entrecomillada (`/TR "\"exe\" --hidden"`)
y schtasks la guarda tal cual. La consulta real de la máquina del owner devuelve
`<Command>"D:\Projects\gameclip\release\GameClip-0.9.4-portable.exe"</Command>` → nunca coincide. El
test usaba un XML inventado sin comillas.

**Objetivo:** reconocer la tarea correcta y no recrearla (ni pedir UAC) si ya apunta al ejecutable
actual.

## Alcance

**Dentro:**
- Normalizar el `<Command>` antes de comparar: quitar las comillas que lo envuelven, decodificar las
  entidades XML (`&amp;`, `&quot;`, `&apos;`, `&lt;`, `&gt;`) y comparar sin distinguir mayúsculas
  (rutas de Windows). Igual para los argumentos.

**Fuera (explícito):**
- Cambiar cómo se crea la tarea o el flujo de relanzado elevado.

## Criterios de aceptación

- [ ] El XML real (con comillas) de la tarea que apunta al exe actual → coincide.
- [ ] Una ruta con `&` en el XML (`&amp;`) → coincide con la ruta real.
- [ ] Una tarea que apunta a otra versión del portable → no coincide (se repara, como hoy).
