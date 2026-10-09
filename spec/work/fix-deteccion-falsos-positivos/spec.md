# Spec — Falsos positivos en la detección de juegos (GOG Galaxy detectado como «REDLauncher»)

**Tipo:** Fix
**Rama:** `fix/deteccion-falsos-positivos`
**Fecha:** 2026-10-08

## Problema / Objetivo

El owner reporta que **con GOG Galaxy abierto la app cree que hay un juego en ejecución** y lo registra
como «REDLauncher». Consecuencias: en modo auto graba sin parar, y el perfil pasa a `game` con un
game capture que no tiene ventana a la que apuntar (la grabación de escritorio puede salir negra).

### Causa raíz (verificada con los datos reales de la máquina, auditoría bug-hunter 2026-10-08)

Son dos fallos encadenados más uno latente:

1. **La fuente del registro de desinstalación da de alta a REDlauncher como juego.** Su entrada es
   `DisplayName=REDlauncher`, `Publisher=CD Projekt RED`, `InstallLocation=…\CD Projekt RED\REDlauncher\`.
   `EDITORAS_DE_JUEGOS` acepta todo lo publicado por `cd projekt`, y `NO_ES_JUEGO` solo excluye unos
   pocos launchers **por nombre exacto** (`^(battle\.net|…|gog galaxy|…)$`), así que REDlauncher pasa.
   (`src/main/games/sources/uninstall-registry.ts`)
2. **El escaneo de su carpeta indexa ejecutables de runtime genéricos.** `REDlauncher.exe` cae por
   `/launcher/i`, pero `QtWebEngineProcess.exe` y `REDupdater.exe` no: el `games-index.json` real
   contiene `qtwebengineprocess → REDlauncher`. **GOG Galaxy está hecho con Qt y lanza su propio
   `QtWebEngineProcess.exe`** (comprobado con `Get-Process`), y la detección compara solo el nombre del
   proceso → «REDlauncher» detectado. El mismo patrón deja otros exes genéricos en el índice:
   `7za → The Witcher 3`, `createdump → Lossless Scaling`, `crs-handler`/`crs-uploader → Stellar Blade`.
   (`src/main/games/scan.ts`)
3. **(Latente) El dedupe entre fuentes no normaliza la barra final.** GOG devuelve
   `E:\GOGLibrary\Moonlighter` y el registro `E:\GOGLibrary\Moonlighter\`: el mismo juego entra dos
   veces (la huella real lo muestra para Moonlighter y Witcher 3). Hoy no rompe nada porque los nombres
   coinciden, pero si dos fuentes nombran distinto al mismo juego, **todos** sus exes se marcan ambiguos
   y el juego deja de detectarse. (`src/main/games/index.ts`)

**Objetivo:** que ni REDlauncher ni los runtimes genéricos entren al índice, y que el mismo juego por
dos fuentes cuente una sola vez.

## Alcance

**Dentro:**
- Fuente del registro: excluir por **patrón** los launchers/actualizadores (nombre o carpeta de
  instalación con `launcher` / `updater`, y el Social Club de Rockstar), además de la lista actual.
- Escaneo: ignorar ejecutables de runtime que nunca identifican un juego: `QtWebEngineProcess`, `7z`,
  `7za`, `createdump`, `crs-handler`, `crs-uploader`.
- Dedupe entre fuentes por ruta **canónica** (sin barra final, sin distinguir mayúsculas).

**Fuera (explícito):**
- Excluir aplicaciones de Steam que no son juegos (Wallpaper Engine, Lossless Scaling…): es la
  feature `feature/exclusion-juegos`, con su propio spec.
- Validar la **ruta** del proceso en el sondeo (que el exe viva bajo el `installDir` del juego): cambia
  el sondeo barato de `tasklist` y merece su propio spec.
- Re-etiquetar clips ya grabados como «REDlauncher» (se pueden borrar o renombrar a mano).

## Criterios de aceptación

- [ ] Una entrada del registro `REDlauncher` / `CD Projekt RED` no produce ningún juego.
- [ ] Un juego real de CD Projekt (p. ej. `The Witcher 3`, `Cyberpunk 2077`) sigue entrando.
- [ ] `executablesIn` no devuelve `qtwebengineprocess`, `7za`, `7z`, `createdump`, `crs-handler` ni `crs-uploader`.
- [ ] El mismo juego reportado por GOG (sin barra) y por el registro (con barra) cuenta una vez.
- [ ] Con GOG Galaxy abierto en la máquina del owner, la barra de captura dice «Esperando juego».
