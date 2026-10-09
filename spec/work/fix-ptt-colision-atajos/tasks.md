# Tasks — El push-to-talk se puede poner en una tecla que ya es atajo

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `hotkeyReservedByPtt`: F8/F7 → su acción, F9 → null; `Ctrl+F8` no choca; Mouse4 sí; cuenta
      acciones apagadas; usa el PTT de los ajustes por defecto.
- [x] Regresión Audio: F8 deshabilitada con el nombre de la acción; F9 habilitada.
- [x] Regresión Audio: choque guardado con PTT activo → aviso y guardar deshabilitado.
- [x] Regresión Atajos: «Restablecer» con PTT F8 no pone F8 en «Guardar clip» y lo explica.

## Implementación

- [x] 1. `hotkeyReservedByPtt` en `@shared/hotkeys`.
- [x] 2. Audio: opciones ocupadas deshabilitadas + bloqueo.
- [x] 3. Atajos: `restablecer()` respeta la reserva.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
