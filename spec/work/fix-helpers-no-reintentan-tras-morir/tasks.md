# Tasks — Los helpers del overlay no se relanzan si mueren una vez

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Test de regresión primero (rojo → verde)

- [x] R1. El helper de sensores muere → vuelve solo pasado el tiempo de reintento.
- [x] R2. PresentMon muere → vuelve solo pasado el tiempo de reintento.
      *(Rojo confirmado antes de tocar código: 4 tests fallando.)*

## Implementación

- [x] 1. `sensors.ts`: `failed` deja de marcarse al morir; nuevo `muertoEn` + reloj inyectable.
- [x] 2. `sensors.ts`: `reintentarSiMurio()` evaluado desde `latest()` (sin timers), con escalado.
- [x] 3. `sensors.ts`: al relanzar conserva el **modo** (`--cpu` si se estaba pidiendo).
- [x] 4. `presentmon.ts`: lo mismo, como camino aparte del watchdog y compartiendo reloj y contador.
- [x] 5. `failed` se conserva **solo** para «falta el binario».
- [x] 6. Renombrar los dos tests viejos cuyo nombre («tras morir no se relanza solo») ya no describía
      el comportamiento: ahora dicen que `start()` no lo adelanta y `stop()+start()` sí fuerza.

## Tests unitarios (obligatorios)

Camino feliz **y** casos borde.

- [x] Sensores: muere → no relanza en caliente; pasado el tiempo, sí.
- [x] Sensores: al relanzar conserva el modo (`--cpu`).
- [x] Sensores: mientras está muerto no enseña cifras viejas.
- [x] Sensores: dos ticks seguidos no lo relanzan dos veces.
- [x] Sensores: sin binario no reintenta.
- [x] PresentMon: muere → vuelve solo pasado el tiempo.
- [x] PresentMon: los reintentos se espacian en vez de encadenarse.
- [x] PresentMon: sin binario no reintenta.
- [x] El watchdog de «vivo pero mudo» sigue verde (sus tests no se tocaron).

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes — **862** (854 de partida, +8)
- [x] **E2E, helper de sensores matado a mano:** volvió solo a los ~5 s con otro PID.
- [x] **E2E, backoff real:** matándolo seis veces seguidas los huecos escalan y se asientan en
      **exactamente 60 s** (16:47:58 → 16:48:18 → 16:48:24 → 16:49:24 → 16:50:25 → 16:51:25). Se
      recupera, pero un helper que se cae en bucle no encadena arranques.
- [x] **E2E sobre el overlay (CDP):** GPU 36 % · Temp GPU 41 °C · VRAM 2,0/12,0 GB → **«—» en las
      tres** al matarlo → cifras de nuevo, **sin tocar ajustes ni reiniciar**. Confirma de paso que no
      se enseñan cifras viejas durante la ventana de reintento.
- [x] **El log muestra la escalada diseñada**, con el aviso único al entrar en cadencia lenta:
      `reintento 1/3` · `2/3` · `3/3` · `sigue cayéndose; se reintentará cada 60s`.

## Observación de la E2E (no es un fallo, pero conviene saberlo)

**Sin elevar, PresentMon muere al instante** —no puede crear su sesión ETW— y por tanto entra en el
ciclo: 3 intentos rápidos y luego **uno por minuto mientras el overlay siga encendido**. Antes de este
fix era **un solo intento** y silencio. Como FPS viene marcado por defecto y la app es `asInvoker`,
esa es la configuración de arranque de cualquiera que encienda el overlay sin elevar.

No se mitiga, por dos razones: el coste medido es despreciable (un proceso que arranca y muere,
~10 ms, una vez por minuto) y **es la misma política que el watchdog ya aplicaba** al caso «vivo pero
mudo», con el motivo escrito en el propio código — la causa suele resolverse sola al cerrarse el otro
capturador. Queda anotado por si alguna vez se quiere afinar: lo natural sería una cadencia más larga
cuando el proceso ni siquiera logra sobrevivir un par de segundos, que es señal de causa estructural
(sin permisos) y no pasajera.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
