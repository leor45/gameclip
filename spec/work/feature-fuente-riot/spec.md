# Spec — Fuente de juegos de Riot (Riot Client)

**Tipo:** Feature (fuente nueva; cierra un launcher que se quedó fuera de la detección)
**Rama:** `feature/fuente-riot`
**Fecha:** 2026-07-15

## Problema / Objetivo

La detección por launchers (`feature-deteccion-juegos-y-nombres`) cubrió Steam, Epic, Xbox, GOG y el
registro de desinstalación (Ubisoft/EA/Battle.net), pero **no Riot**. No es un bug: **falta la fuente**.
Hoy un juego de Riot solo se detecta si su proceso está en la lista curada (`KNOWN_GAME_PROCESSES`:
Valorant, LoL…). Cualquier otro título de Riot es invisible.

Caso real, verificado en la máquina del owner: **2XKO** instalado en `E:/Riot Games/2XKO/Live`. Su
proceso es `Lion.exe` / `Lion-Win64-Shipping.exe` (nombre en clave "lion") — **no está en la lista
curada** y su ejecutable no se parece al nombre del juego, así que ni se detecta ni se nombraría bien.
Es el mismo patrón que `pioneergame.exe` → ARC Raiders.

Riot guarda **todos** sus juegos en un almacén unificado, así que una sola fuente los cubre todos:

- `%ProgramData%\Riot Games\Metadata\<producto>\<producto>.product_settings.yaml`, con dos claves de
  primer nivel: `product_install_full_path` (carpeta) y `shortcut_name` (nombre, p. ej. `"2XKO.lnk"`).
- **La presencia de ese fichero = juego instalado de verdad.** En la máquina del owner solo `lion.live`
  (2XKO) lo tiene; `valorant.live`, `league_of_legends.live` y `bacon.live` (LoR) existen como carpeta
  de metadatos pero **sin** `product_settings.yaml` (no instalados).

**Objetivo:** que los juegos de Riot instalados se detecten solos y con su nombre real, vía una fuente
`riot` más, con el mismo contrato que las demás (degrada a `[]` ante cualquier error).

## Alcance

**Dentro:**

- Nueva fuente `riot` (id `'riot'`) que lee `Metadata\*\*.product_settings.yaml`, extrae
  `product_install_full_path` + `shortcut_name`, comprueba que la carpeta exista y devuelve
  `{ name, installDir, source: 'riot' }`. El nombre sale de `shortcut_name` sin el sufijo `.lnk`
  (`"2XKO.lnk"` → `2XKO`).
- Integración en `DEFAULT_SOURCES` (corre en paralelo con las demás; si peta, el resto sigue).
- El escaneo de carpetas ya existente saca los ejecutables (`Lion.exe`, `Lion-Win64-Shipping.exe` →
  `2XKO`; `OfflineLauncher.exe` y `EpicWebHelper.exe` los descartan los patrones `launcher`/`helper`).
- Añadir `'riot'` a `GameSourceId`.
- Tests con **fixtures** (montan un `Metadata` de mentira en disco), incluido el parser puro del yaml.

**Fuera (explícito):**

- Quitar Valorant / LoL de la lista curada: se quedan (cubren el caso aunque Riot no esté indexado, y
  no estorban — el índice tiene prioridad sobre la lista curada para el nombre).
- Un parser de YAML genérico o una dependencia nueva: solo interesan dos claves de primer nivel, se
  extraen con un regex por línea (como hace `xbox` con su XML).
- Usar `RiotClientInstalls.json` (da rutas pero no nombres); se prefiere `product_settings.yaml` porque
  aporta el nombre bonito.
- Anti-cheat, patchlines, locales o cualquier otro dato del yaml más allá de ruta + nombre.

## Criterios de aceptación

- [ ] Con 2XKO instalado, la fuente `riot` lo devuelve como `2XKO` en `E:/Riot Games/2XKO/Live`, y el
      índice mapea `lion` → `2XKO` (verificado end-to-end en la máquina del owner).
- [ ] Un producto de Riot con carpeta de metadatos pero **sin** `product_settings.yaml` (no instalado)
      no entra.
- [ ] Un juego cuya carpeta de instalación ya no existe se descarta (mismo criterio que las otras fuentes).
- [ ] El parser saca `product_install_full_path` + `shortcut_name` de primer nivel sin confundirse con
      claves anidadas (`settings.create_shortcut`, etc.), y quita el `.lnk` del nombre.
- [ ] Si el directorio `Metadata` no existe (Riot no instalado) o el yaml está corrupto, la fuente
      devuelve `[]` sin tumbar el índice.
- [ ] Gates verdes: type-check · lint · tests.
