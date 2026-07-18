# Plan — Sensores sin WinRing0: LibreHardwareMonitor 0.9.4 → 0.9.6 (PawnIO)

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Lo que ya se probó antes de escribir este plan

El roadmap pedía **resolver** tres matices, no darlos por hechos. Se resolvieron a mano, con la
0.9.6 descargada y el helper compilado y ejecutado. Resultado: **"subir un número de versión" no es
el trabajo** — el paquete cambió de forma y el helper no enlaza ni arranca sin tres arreglos.

**1. El layout del paquete cambió.** La 0.9.4 tenía `lib\net472\LibreHardwareMonitorLib.dll`, que es
la ruta literal que el script pide hoy ([build-perf-sensors.ps1:38](../../../scripts/build-perf-sensors.ps1#L38)).
En la 0.9.6 **ese `lib/` no existe**: hay `ref/<tfm>/` (ensamblados de referencia, solo para
compilar, 350 KB) y `runtimes/win-<arch>/lib/<tfm>/` (la implementación real, 1,2 MB). Con la ruta
vieja el script falla en el `Write-Error` de `Get-NugetLib`. **`net472` sigue existiendo en ambos**,
así que el enfoque `csc` se mantiene: se compila contra `ref\net472` y se envía `runtimes\win-x64\lib\net472`.

**2. Las dependencias pasaron de una a seis (más transitivas).** El `.nuspec` de la 0.9.6 para
`net472` pide `HidSharp 2.6.4`, `System.Memory 4.6.3`, `System.Management 10.0.2`,
`System.Threading.AccessControl 10.0.3`, `DiskInfoToolkit 1.1.2` y `RAMSPDToolkit-NDD 1.4.2`. Hoy el
script copia dos DLLs a mano; eso ya no basta.

**3. El que no se ve venir: sin binding redirects no arranca.** Compila bien, pero al ejecutar:

```
System.IO.FileNotFoundException: … 'System.Memory, Version=4.0.5.0 …'
```

y tras añadir las DLLs, `FileLoadException … la definición del manifiesto no coincide`. LHM 0.9.6
referencia `System.Memory 4.0.5.0` pero el paquete `System.Memory 4.6.3` **envía el ensamblado
4.0.2.0**. En .NET Framework eso lo resuelve un `<bindingRedirect>` que **MSBuild/NuGet generan
solos y `csc` a pelo no**: como no usamos proyecto ni SDK, hay que **escribir el `app.config` a
mano**. Con él, el probe arranca sin elevar y detecta el hardware real:

```
HW: Cpu / AMD Ryzen 7 7800X3D
HW: GpuNvidia / NVIDIA GeForce RTX 4070 Ti
```

y el helper real emite lo esperado:

```json
{"gpuUsage":19,"gpuTemp":38,"gpuFan":0,"gpuVoltage":null,"vramUsedMb":1421,"vramTotalMb":12282,"cpuTemp":null}
```

**`Program.cs` no necesita ni un cambio** — compiló tal cual con el `csc` de Windows (C# 5),
`exit=0`. La API que usamos (`Computer`, `IHardware`, `ISensor`) es idéntica.

## Enfoque

Tocar **solo el script de build** (más un `app.config` nuevo y la copy). El helper y todo el lado
main/renderer se quedan como están: la degradación que pide el spec —Temp CPU a «—» sin romper el
resto— **ya la da la arquitectura actual** y no hay que programarla. `Program.cs` deja `cpuTemp` en
`null` cuando no hay sensor (y descarta un 0 °C implausible,
[Program.cs:114](../../../native/gc-perf-sensors/Program.cs#L114)), y `SensorsReader` trata cada
lectura ausente como `null` → «—». Sin PawnIO el helper **sigue emitiendo**: no se cae, porque
`computer.Open()` no lanza por no tener ring0 (probado sin elevar, que es el mismo camino de código).

Cuatro piezas:

1. **`Get-NugetLib` aprende el layout nuevo.** Pasa a aceptar la ruta relativa que se le pida (ya lo
   hace) y se le pasan las dos rutas nuevas: `ref\net472\…` para compilar y
   `runtimes\win-x64\lib\net472\…` para enviar. Se añade una función que descarga el resto de
   paquetes y copia sus DLLs a `resources/`.
2. **`app.config` a mano** → se copia a `resources/gc-perf-sensors.exe.config`. Es el fichero que
   hace que el helper arranque; sin él, el `.exe` está roto en runtime aunque el build diga OK.
3. **`/platform:x64`** en vez de `anycpu`: la implementación de la 0.9.6 es **específica de
   arquitectura** (`win-x64`, `win-x86`, `win-arm64`) y enviamos la de x64. Con `anycpu` el proceso
   podría arrancar como 32-bit y cargar una DLL x64 → `BadImageFormatException`. Fijarlo es hacer
   explícito lo que ya es cierto (el resto del portable es x64).
4. **Copy y terceros:** la leyenda de Ajustes → Avanzado suma PawnIO al requisito de administrador, y
   `build/TERCEROS.txt` lista las licencias nuevas (MPL-2.0, Apache-2.0, MIT — todas compatibles con
   la GPL-3.0 del repo; se comprueban al añadirlas, no se presumen).

## Archivos / módulos afectados

- `scripts/build-perf-sensors.ps1` — versión 0.9.4 → 0.9.6, rutas del layout nuevo, descarga del
  cierre de dependencias, copia del `.config`, `/platform:x64`. **El grueso del cambio.**
- `native/gc-perf-sensors/App.config` *(nuevo)* — binding redirects. Se copia a `resources/` como
  `gc-perf-sensors.exe.config`.
- `native/gc-perf-sensors/Program.cs` — **sin cambios de código**; solo el comentario de cabecera,
  que hoy dice "driver ring0" de WinRing0 y pasa a nombrar PawnIO.
- `src/renderer/views/ajustes/Avanzado.tsx` — leyenda: Temp CPU necesita administrador **y PawnIO**.
- `src/renderer/__tests__/ajustes-perf.test.tsx` — regresión de esa copy.
- `src/main/__tests__/perf-metrics.test.ts` — regresión de "sin sensor de CPU, el resto de métricas
  sobrevive" (el test que fija la degradación como contrato, no como accidente).
- `build/TERCEROS.txt` — licencias de las dependencias nuevas.
- `.gitignore` — comprobar que `resources/*.dll` y el `.config` generado siguen ignorados (el build
  los regenera; no se commitean binarios).

## Decisiones y alternativas consideradas

- **Enviar el cierre completo de dependencias (13 DLLs, 3,26 MB) y no el mínimo.** Medido: con solo
  `IsGpuEnabled`/`IsCpuEnabled`, quitar `DiskInfoToolkit`, `RAMSPDToolkit-NDD`, `System.Management` y
  `System.CodeDom` **también funciona** (la carga de ensamblados en .NET es perezosa y ese código no
  se toca). Se descarta afinarlo: el ahorro es ~1,1 MB sobre un portable de **93 MB**, y el precio
  sería un `FileNotFoundException` en la máquina de otro usuario cuyo hardware sí entre por esa rama.
  Total en `resources/`: 939 KB → 3,26 MB. **+2,3 MB sobre 93 MB.**
- **Fijar las versiones exactas de cada dependencia** (como ya se hace con LHM y PresentMon) en vez
  de resolver el grafo dinámicamente. Un resolvedor de NuGet en PowerShell es una pieza que hay que
  mantener y que puede cambiar de resultado entre builds; una lista literal es aburrida, reproducible
  y se actualiza a mano cuando toque.
- **Escribir el `app.config` a mano** en vez de adoptar MSBuild/SDK de .NET para que lo genere. Todo
  el enfoque del helper existe para **no** depender del SDK (ni el build ni el usuario lo tienen);
  cambiar eso por un fichero XML de 20 líneas sería pagar caro. El coste: si una dependencia sube de
  versión, hay que tocar el redirect — queda anotado en el propio fichero.
- **No tocar `Program.cs`.** Compila y corre tal cual; el spec no pide sensores nuevos.
- **No instalar PawnIO desde la app** (queda fuera, ver spec). Lo mínimo que exige el spec es
  degradar limpio y **decirlo**; pedir la instalación es producto y va aparte.

## Riesgos

- **El riesgo que decide la tarea: que `cpuTemp` no vuelva elevado.** Si la 0.9.6 + PawnIO no
  entrega temperatura de CPU, el cambio habría trocado el flag de Defender por una métrica muerta.
  **No se puede comprobar sin elevar**, así que es el **primer** paso de la verificación E2E, antes
  de escribir el resto. Si falla, el plan se replantea (fijar 0.9.5, o Temp CPU por otra vía) en vez
  de seguir adelante.
- **La máquina del owner ya tiene PawnIO** (servicio `Running`), así que valida el caso bueno pero
  **no** el del usuario limpio. El caso ausente se prueba parando el servicio a mano; si no, se
  publicaría sin haber visto nunca lo que ve quien se baja el portable.
- **Anti-cheats:** PawnIO sigue siendo ring0. Esto **no** mejora con el cambio y no es un objetivo;
  solo hay que no empeorar la recomendación al usuario.
- **Superficie del build:** más paquetes descargados = más puntos de fallo de red en un build limpio.
  Mitigado por el caché en `build/perf-sensors-sdk/` que el script ya tiene.
- **Regresión silenciosa:** el build puede terminar OK y dejar un `.exe` que no arranca (es
  exactamente lo que pasó en la prueba). Por eso la verificación **ejecuta el helper**, no se
  conforma con que compile.

---

**Estado:** ⏳ pendiente de aprobación
