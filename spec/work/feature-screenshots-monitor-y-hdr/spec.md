# Spec — Captura de pantalla: monitor propio y compatibilidad HDR

**Tipo:** Feature (incluye la causa raíz de un bug reportado)
**Rama:** `feature/screenshots-monitor-y-hdr`
**Fecha:** 2026-07-29

## Problema / Objetivo

La captura de pantalla (`screenshotHotkey`) guarda **el monitor equivocado**: con el monitor
principal en HDR, toma el secundario. Reiniciar la app o apagar y encender la opción no cambia nada.

**Causa raíz (medida en la máquina del owner, Electron 29 / Chromium 122):** con HDR activo, DXGI
entrega el monitor en 10 bits y el capturador de Chromium lo **descarta de la lista de fuentes**:

```
ERROR:dxgi_output_duplicator.cc(116) IDXGIDuplicateOutput does not use RGBA (8 bit)
format, which is required by downstream components, format is 10
```

Comprobado: con dos monitores conectados, `desktopCapturer.getSources({types:['screen']})` devuelve
**una sola fuente**, la del monitor SDR. El monitor HDR no aparece.

Sobre eso, el fallback de `screenshots.ts` remata el bug:

```ts
const source = sources.find((s) => Number(s.display_id) === display.id)  // nunca acierta
  ?? sources[monitorIndex]                                              // ni existe
  ?? sources[0];                                                        // ← captura OTRO monitor
```

O sea: **no es un problema de índice**. `screenMonitorIndex` vale 0 y `getAllDisplays()[0]` sí es el
principal; el fallo es que al no encontrar su fuente se captura «la que haya» en silencio.

Dos problemas de fondo detrás del síntoma:

1. Ante un monitor no capturable, la app captura otro monitor en vez de avisar.
2. No hay forma de capturar un monitor HDR, ni de elegir el monitor del screenshot: hoy va pegado a
   `screenMonitorIndex`, que es el monitor de **grabación de escritorio** — y el modal
   «Grabar escritorio…» lo persiste, así que grabar el escritorio del monitor 2 te mueve también los
   screenshots.

**Objetivo:** que el screenshot capture siempre el monitor que el usuario espera, que pueda elegirlo,
que funcione en monitores HDR (convertido a SDR) y que cuando no pueda capturar lo diga.

## Alcance

**Dentro:**

- Ajuste propio `screenshotMonitorIndex`, independiente del de grabación, con default
  **«seguir al monitor principal»** (sentinela `-1`): cambiar de monitor principal en Windows no
  obliga a reconfigurar nada.
- Selector de monitor para capturas en el `fieldset` que ya existe, «Capturas de pantalla»
  (Ajustes → Grabación), junto al check de activar y al atajo. Se habilita **solo** con
  `screenshotsEnabled`: a diferencia del selector de grabación de escritorio (que está
  `disabled={!desktopRecordingEnabled}`), este funciona con la grabación apagada y con
  `recordingMode: 'off'`.
- Emparejamiento estricto display↔fuente: **nunca** capturar un monitor distinto del pedido. Si el
  monitor objetivo no está entre las fuentes, no se captura y se informa el motivo.
- Aviso al usuario cuando la captura falla (hoy la hotkey no hace nada en silencio), con el motivo y
  apuntando a la casilla de HDR cuando corresponde.
- Ajuste `screenshotHdrCompatibility` en Ajustes → Avanzado → Captura: usa el capturador GDI de
  Chromium (`--disable-features=DirectXCapturer`), que sí enumera monitores HDR y entrega la
  composición **SDR** ya tonemapeada.
  **Encendido por defecto**, decidido tras medirlo: con HDR activo el monitor no sale saturado, sale
  **ausente** de `getSources()`, así que esto no es un extra de calidad sino la única forma de que ese
  monitor sea capturable. Apagado por defecto, la app vendría rota de fábrica para cualquiera con HDR.
  La casilla queda como escape, no como interruptor de la feature.
- El switch solo se puede aplicar al arrancar el proceso (comprobado: en caliente no tiene efecto), y
  a diferencia del `hdrCompatibility` de vídeo —que es un ajuste de fuente de libobs— no hay toggle en
  caliente posible. Para que el usuario no tenga que reiniciar a mano, **la app se relanza sola** al
  cambiar el ajuste, salvo que haya una grabación en curso.
- Previews del modal de monitores (`CaptureGetDisplays`), que hoy salen vacías para un monitor HDR
  por el mismo motivo: pasan a usar el mismo emparejamiento.

**Fuera (explícito):**

- El monitor de **grabación de escritorio** (`screenMonitorIndex`) y su modal: no se tocan.
- El HDR del pipeline de vídeo (`hdrCompatibility` → `rgb10a2_space` de libobs): es otra ruta
  (libobs, no Chromium) y ya existe.
- **Cambiar qué se captura.** El screenshot sigue siendo del **monitor completo**, tal cual funciona
  hoy: no pasa a captura por juego ni por ventana, y los overlays de terceros que estén en pantalla
  (el de Steam, por ejemplo) siguen saliendo dentro, porque es una foto del monitor tal como está. Lo
  único por juego es la carpeta destino (`<Juego>/Capturas/`), que no se toca.
- Tonemapping HDR→SDR propio: se usa el que hace la composición de Windows.
- Migrar `screenMonitorIndex`/`screenshotMonitorIndex` a un id estable de dispositivo (sigue la
  decisión de `fix-monitor-reasignar-al-encender`).
- Resolver el fullscreen exclusivo. **No es un modo de captura**, es un límite de Windows: un juego
  en fullscreen exclusivo real toma la swapchain del monitor y saltea el compositor, así que una
  captura *del escritorio* de ese monitor puede volver vacía (hoy ya se contempla:
  `screenshots.ts:37`). Se sigue tratando como fallo (`captura-vacia`), no se intenta capturar el
  juego por otra vía. Caso raro: el «pantalla completa» de los juegos modernos es borderless, y en la
  prueba del owner un juego a pantalla completa se capturó bien.

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Con el monitor objetivo ausente de la lista de fuentes, **no** se guarda ninguna captura de
      otro monitor: la operación falla con motivo (test de regresión del bug).
- [ ] Por defecto (`screenshotMonitorIndex = -1`) la captura sigue al monitor **principal**, aunque
      el usuario cambie cuál es el principal en Windows y sin importar `screenMonitorIndex`.
- [ ] Grabar el escritorio del monitor 2 desde el modal **no** cambia el monitor de las capturas.
- [ ] El selector de la sección «Capturas de pantalla» lista los monitores (+ «Seguir al monitor
      principal») y persiste `screenshotMonitorIndex`.
- [ ] Con la grabación de escritorio desactivada **y** con `recordingMode: 'off'`, el selector sigue
      habilitado y la captura funciona igual: no depende de la grabación.
- [ ] Al activar `screenshotHdrCompatibility` la app se relanza sola y la captura del monitor
      principal HDR sale con contenido real y colores correctos en SDR (verificado a mano).
- [ ] Con una grabación en curso, cambiar ese ajuste **no** relanza la app: se avisa y queda para el
      próximo arranque.
- [ ] Con la captura fallida, el usuario ve un aviso con el motivo; si el monitor no era capturable,
      el aviso menciona la compatibilidad HDR.
- [ ] Gates verdes: type-check · lint · tests.
