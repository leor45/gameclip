# Tasks — Un micrófono guardado que ya no existe deja el mic mudo y la UI lo enmascara

## Tests unitarios (obligatorios; primero, en rojo)

- [x] `resolveMicDevice`: vacío/default, presente, ausente con lista, ausente con lista vacía.
- [x] Regresión obs: con un id huérfano y dispositivos enumerados, `wasapi_input_capture` recibe
      `device_id: 'default'`; con enumeración vacía, el id se respeta.
- [x] Regresión renderer: Ajustes → Audio con un id huérfano muestra la opción «(no conectado)» y el
      aviso; con el id presente no.

## Implementación

- [x] 1. `resolveMicDevice` en `@shared/capture`.
- [x] 2. `obs.ts`: enumeración parametrizada + fallback con warn.
- [x] 3. `Audio.tsx`: opción huérfana + aviso.

## Verificación (gates)

- [x] Type-check verde · Lint verde · Tests verdes

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
