# Plan — Con un DualSense conectado, un segundo DualSense no se detecta

> **Este plan es un contrato.** Aprobado con el diseño fijado en el encargo (re-escaneo por tiempo
> transcurrido, timeout de 2 s intacto).

## Enfoque

1. `native/gc-controller-listen/main.cpp`, `runHidLoop`:
   - `constexpr DWORD kRescanIntervalMs = 2000`: intervalo de re-escaneo y timeout de la espera (antes,
     el literal `2000`). Un solo valor para que no se desalineen.
   - `ULONGLONG lastRescan = GetTickCount64()` tras el re-escaneo inicial.
   - **Al principio de cada vuelta, antes de montar `waits`:** si `GetTickCount64() - lastRescan >=
     kRescanIntervalMs`, `rescan()` y `lastRescan = GetTickCount64()`. Como cada vuelta empieza justo
     después de tratar el resultado anterior (evento, error de lectura o resultado fuera de rango),
     equivale a «tras cada resultado de la espera».
   - La rama de `WAIT_TIMEOUT` sigue re-escaneando como antes y además actualiza `lastRescan`.

**Seguridad del índice.** `idx = r - WAIT_OBJECT_0 - 1` indexa `open` con un `r` que sale de un
`waits` montado con el `open` vigente: ningún `rescan()` ocurre entre la espera y el uso de
`open[idx]` (el del principio va antes de montar `waits`; el del timeout sale con `continue` sin usar
`r`). Entre la espera y el procesado, `open` solo cambia por el `erase` del propio procesado, tras el
cual la vuelta termina. No depende de que `rescan()` solo añada al final (aunque hoy es así).

**El mando cuya lectura acaba de completar** se procesa en esa misma vuelta (flanco de Create y
re-armado de la lectura); el re-escaneo, si toca, va al principio de la siguiente. Si durante el
re-escaneo completa otra lectura, su evento (manual-reset) queda señalado hasta el `ResetEvent` de
`startRead`, y el `waits` nuevo —mismos mandos en el mismo orden, los nuevos al final— lo recoge en la
siguiente espera.

## Archivos / módulos afectados

- `native/gc-controller-listen/main.cpp` — solo `runHidLoop` (+ la constante y su comentario).
- `spec/work/fix-mando-segundo-dualsense/` — este registro.

El README del helper ya dice «re-escanea cada ~2 s para hotplug»: con el arreglo pasa a ser cierto,
no hay que tocarlo.

## Decisiones y alternativas consideradas

- **Timeout ⇒ re-escaneo sin mirar el reloj.** `GetTickCount64` tiene una resolución de ~15,6 ms:
  tras un timeout de 2000 ms la resta podría dar, p. ej., 1985 y saltarse el re-escaneo, con lo que
  sin mandos el intervalo pasaría de 2 s a 4 s. Mantener el re-escaneo incondicional en el timeout
  deja el comportamiento en reposo idéntico al de antes.
- **`lastRescan` se toma al terminar el re-escaneo**, no al empezar: si uno tarda, entre dos
  re-escaneos queda siempre un intervalo entero atendiendo lecturas (nunca se encadenan).
- **Re-escaneo al principio de la vuelta** frente a justo después de la espera: tras la espera también
  sería seguro hoy, porque `rescan()` solo hace `push_back` y los índices previos no cambian, pero
  dependería de ese invariante. Al principio es seguro por construcción.
- **Timeout fijo de 2 s** frente a uno dinámico (2000 − transcurrido): se mantiene el fijo (cambio
  mínimo). Cota resultante del intervalo entre re-escaneos: ~2 s con reports a 250 Hz; < 4 s con
  eventos escasos (un evento justo antes de cumplir los 2 s y luego silencio), la misma cota que ya
  tenía el original en ese caso. Antes, con un mando reportando, era infinito.
- **Sondeo** frente a notificaciones de PnP: las notificaciones exigen ventana y bucle de mensajes (o
  un callback en otro hilo con sincronización sobre `open`); desproporcionado para un Low.

## Riesgos

- Con un DualSense abierto ahora se re-escanea cada 2 s (antes nunca). Coste medido de `rescan()` en
  la máquina de desarrollo (23 interfaces HID): ~0,44 ms típico, ~64 ms en frío como peor caso.
  Mientras dura, el driver HID guarda los reports del mando abierto en su buffer (32 por defecto,
  ~128 ms a 250 Hz): no se pierden pulsaciones. Es el mismo trabajo que ya se hacía cada 2 s en reposo.
- Un DualSense que no se deja abrir (p. ej. en exclusiva de otra app) se reintenta cada 2 s también
  cuando hay otro abierto (2 `CreateFileW` fallidos por re-escaneo); antes solo en reposo.
- Los mandos ya abiertos no se tocan: `rescan()` los salta por device path antes de abrir, así que no
  se repite el `HidD_GetFeature(0x05)` ni se abre un segundo handle al mismo mando.
- No hay hardware para probar con dos DualSense: se verifica con una simulación del bucle real y queda
  pendiente la prueba con mandos.

---

**Estado:** ✅ aprobado el 2026-10-09
