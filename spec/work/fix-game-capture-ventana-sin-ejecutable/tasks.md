# Tasks — El game capture no se re-apunta cuando la ventana del juego aparece tarde

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Implementación

- [x] 0. **Medir el enum `priority`** volcándolo de la propiedad-lista de libobs, en vez de fiarse
      de la memoria. Resultado: **`0` = clase · `1` = título · `2` = ejecutable**. La anotación
      previa del roadmap tenía el 0 y el 1 **invertidos** (corregida). La semántica tampoco es
      «solo por este campo»: el título se intenta siempre primero y el valor elige el respaldo.
- [x] 1. `ObsCapture.retryAimGameWindow()` — reintenta resolver y apuntar; devuelve `true` cuando
      ya no hay nada que reintentar.
- [x] 2. Bucle acotado en el manager: `AIM_RETRY_INTERVAL_MS` (5 s) × `AIM_RETRY_MAX` (24) = 2 min
      de margen. Arranca al construir un pipeline de perfil `game`, para al apuntar o al agotarse,
      y se corta en el `shutdown`.
- [x] 3. `gameCaptureSettings` emite `priority` desde una constante con el valor medido.
- [x] 4. **Retirado**: el emparejado por título normalizado para ventanas con el ejecutable en
      `unknown`. Se implementó, se probó en máquina real y **no aportó nada** — ver el spec. Se
      quitó junto con sus tests para no dejar en `main` una heurística sin caso de uso.

## Tests unitarios (obligatorios)

- [x] **Regresión**: reintenta hasta que la ventana aparece, y entonces para.
- [x] Caso borde: llega al tope y deja de sondear (no se queda mirando para siempre).
- [x] Caso borde: en perfil de escritorio no reintenta nada.
- [x] Caso borde: cerrar el juego corta los reintentos en curso.
- [x] Caso borde: un backend que lanza no tumba el manager ni el bucle.

## Verificación (gates)

- [x] Type-check verde (`npm run typecheck`)
- [x] Lint verde (`npm run lint`)
- [x] Tests verdes (`npm run test`) — 880 (+5)
- [x] **Comprobación manual con Helldivers 2** (2026-07-19, con `obs64.exe` firmado para aislar la
      causa raíz de la firma):

  | Señal | Resultado |
  |---|---|
  | Re-apuntado | 07:20:47 `any_fullscreen` → 07:20:59 `window` aplicada |
  | Hook | 07:21:03 · `2560x1440` · `d3d12 shared texture capture successful` |
  | Clip | 1920×1080, **0 frames negros**, YAVG 62.5 |
  | Pistas de audio | `default` −28.1 dB · **`game` −28.1 dB** · `mic` −91 · `Discord` −91 |
  | `priority` aplicada | `2 (ejecutable)` — el camino normal, sin heurísticas |

- [x] **Sin regresión**: un juego que ya enganchaba sigue resolviendo por ejecutable con los
      settings de siempre (7 selftests con juego falso).

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [x] `spec/constitution/roadmap.md` actualizado con la causa raíz real (la firma)
- [ ] **Release 0.9.1** con este fix + `fix/fuga-fuentes-video-en-rebuild` (ya en `main`).
      **Ojo con las notas de la release:** la 0.9.1 **no** arregla Helldivers 2 en las builds sin
      firmar; eso depende del certificado, que es otra tarea.
- [ ] Borrar las ramas de sonda (`probe/captura-hook-diagnostico`, `probe/verificacion-fix-hd2`):
      eran diagnóstico y nunca van a `main`.
- [ ] Revertir el certificado de prueba de la máquina del owner (`revertir-firma.ps1`).
