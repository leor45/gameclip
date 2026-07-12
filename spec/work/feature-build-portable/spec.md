# Spec — Build portable (.exe) con la API embebida

**Tipo:** Feature
**Rama:** `feature/build-portable`
**Fecha:** 2026-07-11

## Problema / Objetivo

GameClip solo corre en desarrollo, y como **dos procesos**: la app (`npm run dev`) y la API
(`npm run dev:server`). No hay forma de dárselo a nadie: no existe configuración de
`electron-builder`, la API no arranca sola, y tres cosas del proyecto asumen el entorno de
desarrollo y se romperían dentro de un paquete:

1. **La DB del server vive en `server/data/`**, junto al código. Un `.exe` portable se
   auto-descomprime en una carpeta temporal distinta en cada arranque, así que esa DB se perdería
   en cada ejecución (usuarios y sesiones, siempre en cero).
2. **`bcrypt` es un módulo nativo con ABI de Node.** Dentro de Electron la ABI es otra, así que
   embeber el server tal cual haría fallar el `require`.
3. **osn y ffmpeg necesitan rutas reales de disco.** `ObsWrapper.init` hace
   `SetWorkingDirectory(packageDir)` sobre lo que resuelve `require.resolve`, y libobs desde ahí
   lanza `obs64.exe`; `ffmpeg-static` exporta la ruta de `ffmpeg.exe`. Dentro de un `.asar` esas
   rutas no son archivos de verdad y ninguno de los dos arranca.

**Objetivo:** un único `.exe` **portable** (sin instalador) que al ejecutarse levante la API y la
app juntas, y que guarde sus datos donde sobrevivan a reiniciar y a reemplazar el `.exe` por una
versión nueva.

## Alcance

**Dentro:**

- API Express embebida **en el proceso main** de Electron (mismo puerto y misma superficie HTTP que
  hoy: el renderer no cambia).
- Datos persistentes del server en `userData` (donde ya vive `library.db`).
- `bcrypt` → `bcryptjs` (JS puro; valida los hashes `$2b` ya guardados).
- `better-sqlite3` del server inyectado, para que el main use el binario con ABI de Electron
  (`better-sqlite3-electron`, el alias que ya existe) y los tests sigan con el de Node.
- Configuración de `electron-builder`: target `portable` para Windows x64, con osn, ffmpeg y los
  `.node` fuera del asar y sus rutas reescritas a `app.asar.unpacked`.
- Instancia única (segunda ejecución enfoca la ventana existente en vez de chocar con el puerto).
- `LICENSE` (GPL-3.0) y el aviso de licencia de ffmpeg dentro del paquete.
- Script `npm run build:portable`.

**Fuera (explícito):**

- Instalador NSIS, auto-update, firma de código.
- Publicar el release en GitHub (la tarea deja el `.exe`; subirlo es manual).
- Modo "portable de verdad" (datos junto al `.exe` vía `PORTABLE_EXECUTABLE_DIR`) — mejora aparte.
- Otras plataformas además de Windows x64.

## Criterios de aceptación

Observables y verificables uno a uno:

- [x] `npm run build:portable` produce un `.exe` único en `release/`.
- [x] Ejecutando ese `.exe` **sin el repo delante** (sin `node_modules`): abre la app, registra un
      usuario, inicia sesión y graba un clip retroactivo con la hotkey.
      Verificado: API embebida responde `/api/health`, registro 201, login 200, `obs64.exe` corriendo
      desde `app.asar.unpacked`, y F8 → clip real de 36 MB (1080p, 27,9 s) con las 5 pistas de audio
      nombradas (`default/game/mic/Discord/opera`), lo que prueba que el remux con el ffmpeg
      desempaquetado también corre. La reproducción en la UI **no** se probó a mano.
- [x] Cerrar la app y volver a abrir el `.exe`: la sesión sigue iniciada y el clip sigue en la
      biblioteca (prueba de que los datos no viven en la carpeta temporal).
- [x] Un usuario registrado antes del cambio (hash de `bcrypt`) inicia sesión con `bcryptjs`.
- [x] Abrir el `.exe` dos veces no cuelga la segunda instancia ni tira `EADDRINUSE`: enfoca la ventana
      que ya está abierta.
- [x] `npm run dev` y `npm run dev:server` siguen funcionando igual que hoy.
- [x] Gates verdes: type-check · lint · tests.
