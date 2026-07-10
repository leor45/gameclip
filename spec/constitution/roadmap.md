# Roadmap — GameClip

Estado por fases. Cada tarea corre el flujo `spec → plan → tasks` en su propia rama.

## Fase 0 · Bootstrap del workflow — ✅ entregado

- [x] Estructura `spec/` (constitution, work, templates, script de scaffolding).
- [x] CLAUDE.md con workflow, git flow y comandos.
- [x] Preferencias multi-agente (local, git-ignored) + template de ejemplo.
- [x] Repositorio git inicializado.

## Fase 1 · Esqueleto de la app — ✅ entregado

- [x] Scaffolding Electron + React + TypeScript con electron-vite (main / preload / renderer / shared).
- [x] Server Express + TypeScript + SQLite en `server/`, mismo repo, un solo `package.json`.
- [x] Test runner (Vitest), ESLint y Prettier operativos — **los gates quedan reales desde aquí**.
- [x] Ventana principal con navegación base (shell de la UI).

> Nota técnica: Electron fijado en **29.3.1** exacto (la versión que usa Streamlabs Desktop,
> cuya build de `obs-studio-node` se compila contra esa ABI). El paquete npm de osn está
> abandonado; en la Fase 3 se instala desde el S3 de Streamlabs.

## Fase 2 · Autenticación — ✅ entregado

- [x] Registro y login directo (email + contraseña) contra el server: JWT access + refresh, bcrypt.
- [x] Sesión persistente en la app (recordar usuario, logout).
- [x] Pantallas de login/registro en el renderer.

> Refresh tokens opacos, hasheados (sha256) y rotados en cada uso; revocables con logout.
> Mejora futura anotada: mover los tokens de localStorage a safeStorage si llegan a dar
> acceso a la nube.

## Fase 3 · Captura nativa (libobs) — ⏳ pendiente

- [ ] Integración de `obs-studio-node`: inicialización, contexto de video/audio, fijar versión de Electron compatible.
- [ ] Grabación manual de escritorio (display capture) con audio de sistema y micrófono.
- [ ] Game capture de juegos en primer plano.
- [ ] **Clip retroactivo:** buffer de repetición + hotkey global configurable (estilo F8 de las apps de clips).
- [ ] Ajustes de calidad: resolución, FPS, bitrate, encoder (NVENC/AMF/QSV/x264).

## Fase 4 · Biblioteca de clips — ⏳ pendiente

- [ ] Guardado local de clips con metadatos (juego detectado, fecha, duración, etiquetas) en SQLite.
- [ ] Vista de biblioteca: grilla con thumbnails, reproducción, búsqueda y filtros.
- [ ] Gestión: renombrar, etiquetar, favoritos, eliminar, abrir carpeta.

## Fase 5 · Editor de clips — ⏳ pendiente

- [ ] Recorte (trim) con vista previa.
- [ ] Exportación (calidad/formato/GIF) y compartir a portapapeles/archivo.
- [ ] Resto de herramientas del editor de las apps de clips, de forma incremental.

## Fase 6 · Pulido de paridad — ⏳ pendiente

- [ ] Detección automática de juegos en ejecución (auto-inicio del buffer).
- [ ] Overlay in-game (indicador de grabación, confirmación de clip guardado).
- [ ] Auto-arranque con Windows, minimizar a bandeja del sistema.

## Futuro (fuera de alcance por ahora)

- Guardado en la nube y compartir alojado.
- Login social (Discord, Google, etc.).
- Otras plataformas además de Windows.

## Riesgos conocidos

- **`obs-studio-node`:** compatibilidad estricta Electron/Node, binarios nativos, poca documentación
  (la referencia práctica es el código de Streamlabs Desktop). Es el mayor riesgo técnico del
  proyecto; la Fase 3 empieza con una prueba de integración mínima antes de construir encima.
- **Game capture con anticheats:** algunos anticheats bloquean hooks de captura; puede requerir
  fallback a display capture por juego.
- **Rendimiento del buffer de repetición:** consumo de RAM/disco según duración y calidad del buffer.
