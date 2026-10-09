# Tasks — Rediseño «Portada oscura»

Pasos pequeños y verificables. Una tarea a la vez; marcar al completar.

## Fase 1 — base común (rama de la feature)

- [ ] 1. Instalar `@fontsource/anton`, `@fontsource/barlow`, `@fontsource/geist-mono` e importarlas en `main.tsx`.
- [ ] 2. Tokens nuevos en `:root` de `styles.css` con alias de los viejos; base tipográfica.
- [ ] 3. Primitivas compartidas en `styles.css`: botones (primario, fantasma, peligro, icono), píldora, punto de estado, interruptor, campo, tecla, etiqueta de grupo, modal.
- [ ] 4. Crear `styles/{shell,library,settings,editor,auth}.css` vacíos con su cabecera e importarlos.
- [ ] 5. Contrato de iconos: tipos en `shared/ipc.ts`, preload, handler del main que devuelve `null`, `useIcon`, `<GameIcon>` con variantes y logo de reserva.
- [ ] 6. `<Modal>` y `<ConfirmDialog>`.
- [ ] 7. Contrato de la pregunta de reinicio HDR: canales en `shared/ipc.ts` y preload.
- [ ] 8. Commit de la base y gates verdes.

## Fase 2 — áreas en paralelo (una rama por área)

- [ ] 9. Iconos (main): índice con ruta del exe, resolución nombre → exe, `getFileIcon`, logo de paquete Store, caché disco + memoria.
- [ ] 10. Lateral y barra superior (variante A, menú de duración con enlace a General, estados de actualización).
- [ ] 11. Biblioteca (grupos por fecha, panel reproductor, filas, teclado, filtro propio, acciones, modales de eliminar).
- [ ] 12. Ajustes (pie fijo, 8 secciones, iconos en listas y mezcla, llegada a General con foco, modal HDR main + renderer).
- [ ] 13. Editor y acceso (sin clip, básico, avanzado, render, login, registro).

## Tests unitarios (obligatorios)

- [ ] `useIcon`: una sola petición por clave en vuelo; caché; `null` → logo.
- [ ] `<GameIcon>`: variantes fijas no piden icono; reserva al logo cuando no hay icono o falla.
- [ ] `<Modal>`: Esc y clic fuera cierran; foco inicial; devuelve el foco.
- [ ] Iconos (main): caché en disco reutilizada; exe inexistente → `null`; error de `getFileIcon` → `null`; app de Store → logo del paquete.
- [ ] Barra superior: texto de estado solo fuera de «Buffer activo»; menú de duración (opciones, valor fuera de lista, aplicar, Esc); enlace a General.
- [ ] Biblioteca: agrupación por fecha (bordes de día, semana, mes); panel abre/cierra/navega; Intro abre el editor; filtro con contadores, orden y buscador; modal de eliminar (cancelar, confirmar, error).
- [ ] Ajustes: pie fijo presente en las 8 secciones; llegada a General enfoca la duración; modal HDR responde `now`/`later`; respaldo nativo sin ventana o sin respuesta.
- [ ] Editor: acciones y atajos intactos tras el restyle.

## Verificación (gates)

- [ ] Type-check verde (`npm run typecheck`)
- [ ] Lint verde (`npm run lint`)
- [ ] Tests verdes (`npm run test`)
- [ ] Revisores de bugs introducidos: «cerrado, nada nuevo» en cada área.
- [ ] Comprobación manual en la app real (CDP / capturas) de cada pantalla frente a la maqueta, incluidas fuentes e iconos.

## Cierre

- [ ] Aprobación del owner
- [ ] Merge a `main` con `--no-ff` y rama borrada (`git branch -d`)
- [ ] `spec/constitution/roadmap.md` actualizado
