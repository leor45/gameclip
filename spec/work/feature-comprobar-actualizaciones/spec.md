# Spec — Comprobar actualizaciones

**Tipo:** Feature
**Rama:** `feature/comprobar-actualizaciones`
**Fecha:** 2026-07-13

## Objetivo

Que la app avise cuando hay una versión nueva publicada y le dé al usuario una vía para ir a
descargarla, sin auto-instalar. Es un **notificador**, no un auto-updater.

## Contexto

- Repo público: `github.com/leor45/gameclip`. `GET /repos/leor45/gameclip/releases/latest` responde
  200 **sin autenticación** → el chequeo se hace desde el cliente sin token ni secretos embebidos.
- La versión instalada ya viaja por IPC (`app:version` → `app.getVersion()`).
- Los releases usan tag `vX.Y.Z` y asset `GameClip-X.Y.Z-portable.exe` (ver proceso de release).
- Distribución actual: portable sin firma. Por eso el auto-update real (electron-updater +
  instalador firmado) queda **fuera**: sería una feature mucho mayor.

## Alcance

**Dentro:**

- **Chequeo en el main** (Electron `net`) contra `releases/latest`, con timeout corto. Devuelve
  `{ current, latest, updateAvailable, url }`. Falla en silencio (offline / rate-limit / respuesta
  rara): `updateAvailable = false`, sin excepción que rompa nada.
- **Comparación de versiones** propia tipo semver sobre `X.Y.Z` (sin dependencia nueva).
- **Al arrancar:** chequeo silencioso; si hay versión nueva, **modal una vez por lanzamiento** con
  botón "Ver release" (abre el `html_url` con `shell.openExternal`) y "Ahora no".
- **Mientras la app corre:** **aviso pasivo** en el sidebar (arriba del indicador de almacenamiento):
  enlace discreto "Actualización disponible: vX.Y.Z" que abre el release. Persiste tras cerrar el
  modal.
- **Botón manual** "Comprobar actualizaciones" en el sidebar (misma zona): re-chequea y da feedback en
  ambos sentidos ("Estás al día ✓" / "Hay vX.Y.Z"). Estado de carga mientras consulta.

**Fuera (explícito):**

- Descargar o instalar la actualización automáticamente (electron-updater, code signing, instalador).
- Changelog dentro de la app / notas del release renderizadas.
- Canal de prereleases (GitHub `releases/latest` ya los excluye, que es lo que queremos).
- Persistir "no volver a avisar de esta versión" (el modal ya se limita a una vez por lanzamiento).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con una versión instalada menor que la del último release, el chequeo devuelve
      `updateAvailable = true`, el `latest` y la `url` correctos.
- [ ] Igual o mayor → `updateAvailable = false`.
- [ ] Un fallo de red / respuesta inválida no lanza: devuelve `updateAvailable = false`.
- [ ] La comparación de versiones ordena bien: `0.6.0 > 0.5.10 > 0.5.2 > 0.5.1`.
- [ ] Al arrancar con update disponible, aparece el modal una vez; "Ver release" abre el navegador.
- [ ] El aviso pasivo del sidebar aparece cuando hay update y abre el release al pulsarlo.
- [ ] El botón "Comprobar actualizaciones" da feedback cuando estás al día y cuando no.
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
