# Spec — Aviso de que FPS y Temp CPU necesitan administrador

**Tipo:** Hotfix (solo copy de UI)
**Rama:** `hotfix/aviso-metricas-admin`
**Fecha:** 2026-07-18

> **Release:** mismo release que `feature/overlay-rendimiento`, `feature/fps-solo-en-juego` y
> `feature/overlay-proteccion-selectiva`.

## Problema

El usuario marca **FPS** o **Temp CPU** en «Qué mostrar», cierra Ajustes, y las ve en «—» sin saber
por qué. La explicación ya existe y es correcta, pero está **al final del fieldset**, colgada del
checkbox «Iniciar con Windows como administrador» — o sea, **lejos de donde se toma la decisión**.
Nada obliga a haber bajado hasta ahí.

No es que falte la leyenda: es que no está donde se genera la duda.

## Contexto medido (para que la copy no mienta)

Verificado sobre los manifiestos de los binarios: `GameClip.exe`, el portable y `gc-presentmon.exe`
son todos `asInvoker`, y `electron-builder.yml` no define `requestedExecutionLevel`.

**La app NO pide UAC nunca y funciona entera sin elevar.** De las 9 métricas, solo **dos** necesitan
permisos: FPS (sesión ETW) y Temp CPU (driver ring0). Las otras siete —GPU, VRAM, fans, voltaje,
CPU %, RAM— se ven igual sin admin.

Por eso la copy debe encuadrarlo como **una limitación de dos métricas**, nunca como «GameClip
requiere administrador», que sería falso y ahuyentaría al usuario.

## Alcance

**Dentro:** una línea de `settings-hint` bajo la lista de métricas de «Qué mostrar», que nombre las
dos métricas afectadas y remita a la opción de auto-inicio elevado que ya está más abajo.

**Fuera (explícito):**

- Tocar la leyenda existente del checkbox elevado: ahí es donde toca explicar el mecanismo completo
  (tarea programada, un UAC, depende de «Iniciar con Windows»), y está bien como está.
- Deshabilitar o marcar los checkboxes de FPS/Temp CPU según si hay admin. Requeriría detectar la
  elevación en runtime y propagarla al renderer: más alcance, y un check deshabilitado se lee como
  «esto no funciona» en vez de «esto necesita un permiso».
- Quitar la dependencia de admin. Es viable para los FPS (servicio de PresentMon de Intel: un UAC al
  instalar y nunca más) pero es **otro trabajo con su propio spec**.

## Criterios de aceptación

- [ ] Bajo la lista de «Qué mostrar» se ve un aviso que nombra **FPS y Temp CPU** y remite a la
      opción de iniciar como administrador.
- [ ] La leyenda del checkbox elevado sigue intacta.
- [ ] La copy no afirma que la app requiera administrador para funcionar.
- [ ] Gates verdes (type-check · lint · tests) y regresión que fije el aviso.

## Notas del release (recordatorio)

Al armar las notas de las tres ramas, encuadrarlo así: *«dos métricas del overlay (FPS y Temp CPU)
requieren elevación por una restricción de Windows; se activan de una vez con el auto-inicio como
administrador»*. **No** redactarlo como que la app pide admin.
