# Plan — Auto-inicio con Windows no arranca (portable)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Extraer la decisión de qué registrar en el arranque a una función **pura** y testeable, y hacer que
`index.ts` la use al llamar a `app.setLoginItemSettings`.

Nuevo `src/main/auto-launch.ts`:

```ts
export function loginItemSettings(
  autoLaunch: boolean,
  env: NodeJS.ProcessEnv,
  execPath: string,
): { openAtLogin: boolean; path: string; args: string[] } {
  return {
    openAtLogin: autoLaunch,
    path: env.PORTABLE_EXECUTABLE_FILE ?? execPath,
    args: ['--hidden'],
  };
}
```

`applyAutoLaunch` en `index.ts` pasa a:
`app.setLoginItemSettings(loginItemSettings(settings.autoLaunch, process.env, process.execPath))`
(sigue con el guard `if (!app.isPackaged) return;`).

## Archivos / módulos afectados

- `src/main/auto-launch.ts` *(nuevo)* — función pura `loginItemSettings`.
- `src/main/index.ts` — `applyAutoLaunch` usa la función.
- `src/main/__tests__/auto-launch.test.ts` *(nuevo)* — test de regresión + casos borde.

## Decisiones y alternativas consideradas

- **Función pura recibe `env` y `execPath` por parámetro** en vez de leerlos dentro: así el test no
  tiene que mutar `process.env`/`process.execPath`. Alternativa descartada: testear `applyAutoLaunch`
  directamente — arrastra `app`/`isPackaged` de Electron, que no está en el entorno de test.
- **`path` siempre presente.** En no-portable cae a `process.execPath`, que es exactamente lo que
  Electron usaría por defecto: no cambia el comportamiento fuera del portable.

## Riesgos

- **Nombre de la env:** electron-builder portable define `PORTABLE_EXECUTABLE_FILE` (ruta del .exe)
  y `PORTABLE_EXECUTABLE_DIR`. Usamos la primera. Verificación manual en un portable real.
- **Propagación de `--hidden`:** el stub portable reenvía los args al proceso interno; se conserva
  el flag para arrancar en bandeja. Se comprueba a mano en el build.

---

**Estado:** ⏳ pendiente de aprobación
