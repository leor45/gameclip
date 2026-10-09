# Spec — Lista de «no son juegos» (sincronizada y manual)

**Tipo:** Feature
**Rama:** `feature/exclusion-juegos`
**Fecha:** 2026-10-08

## Problema / Objetivo

La fuente de Steam da de alta **cualquier** `appmanifest`, también las aplicaciones que no son
juegos. En la máquina del owner el índice tiene `wallpaper32/wallpaper64/ui32/webwallpaper64… →
Wallpaper Engine`, `losslessscaling → Lossless Scaling` y la carpeta de «Steamworks Common
Redistributables» (auditoría bug-hunter 2026-10-08, hallazgo BUG-7). Wallpaper Engine corre siempre en
segundo plano: con él abierto la app cree que hay un juego en ejecución **permanente** (en modo auto
graba sin parar; con buffer «solo con juego» el buffer nunca se apaga). Lossless Scaling corre *junto*
al juego y compite con él como juego activo.

El owner quiere **las dos vías a la vez**:

- un **botón para sincronizar**, que detecta solo las aplicaciones conocidas que no son juegos y las
  añade a una lista de exclusión;
- la opción de **añadir a mano** cualquier entrada a esa lista;
- y si algo ya está en la lista (añadido a mano, o un automático que el owner desactivó), la
  sincronización **lo salta**: nunca lo duplica ni lo pisa.

## Alcance

**Dentro:**
- Ajuste persistido `excludedGames`: entradas `{ name, source: 'auto' | 'manual', enabled }`, identificadas
  por el **nombre de catálogo** del juego (sin distinguir mayúsculas).
- Los juegos excluidos **activos** no entran en el índice: ninguno de sus ejecutables se detecta.
- **Sincronización automática** con una lista curada de aplicaciones conocidas que no son juegos
  (por appid de Steam y por nombre): Wallpaper Engine, Lossless Scaling, Steamworks Common
  Redistributables, SteamVR, Soundpad, OBS Studio, etc.
  - Corre en cada refresco del índice (arranque, novedad, re-escaneo) **y** con el botón «Sincronizar».
  - Añade como `auto` lo que esté instalado y no figure ya en la lista con ese nombre (en cualquier
    origen y estado) → **skip** de lo manual.
  - Quita las entradas `auto` de aplicaciones que ya no están instaladas. Nunca toca las `manual`.
- UI en **Ajustes → Grabación**, sección «No son juegos»:
  - lista con nombre, etiqueta *auto* / *manual* y casilla de activo;
  - quitar una entrada manual; las automáticas se desactivan (desactivada, la sincronización la
    respeta y no la reactiva);
  - añadir a mano: elegir de los juegos instalados que encontró la app o escribir un nombre;
  - botón **«Sincronizar»** (re-lee los launchers y aplica la lista curada).
  - Los cambios de esta sección se aplican **al momento** (no esperan a «Guardar ajustes») y no
    reconstruyen el pipeline de captura (no vacían el búfer de repetición).

**Fuera (explícito):**
- Excluir por **ejecutable** suelto (p. ej. un helper concreto): la exclusión es por juego del catálogo.
- Excluir juegos añadidos a mano en «Juegos manuales»: esos son elección explícita del owner.
- Detectar «no-juegos» por heurística (tipo de app de Steam, ausencia de GPU…): solo lista curada.
- Re-etiquetar clips ya grabados con el nombre de una app excluida.

## Criterios de aceptación

- [ ] Con Wallpaper Engine instalado, tras sincronizar aparece en la lista como *auto* y ya no se detecta como juego.
- [ ] Añadir «Lossless Scaling» a mano y sincronizar: queda **una** entrada, *manual*.
- [ ] Desactivar una entrada *auto* y sincronizar: sigue desactivada (y vuelve a detectarse como juego).
- [ ] Una entrada *auto* de una app desinstalada desaparece al sincronizar; una *manual* no.
- [ ] Cambiar la lista no reinicia el búfer de repetición.
- [ ] La lista sobrevive a reiniciar la app.
