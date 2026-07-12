# Spec — Estructura de carpetas por juego y nomenclatura de archivos

**Tipo:** Feature
**Rama:** `feature/estructura-carpetas-clips`
**Fecha:** 2026-07-11

## Problema / Objetivo

Hoy todo cae plano en la carpeta de clips, con el nombre que le pone libobs
(`2026-07-11 19-14-42.mp4`, `Replay …`), y las capturas en un `Capturas/` suelto. No se sabe de
qué juego es cada archivo sin abrirlo, y la carpeta se vuelve un cajón de sastre.

Objetivo: **una carpeta por juego**, con las capturas dentro, y nombres que digan juego + momento.

### Estructura y nomenclatura

```
<carpeta de clips>/
├─ Terraria/                                      ← ejecutable del juego, sin .exe
│   ├─ Terraria 2026.07.02 - 10.02.01.01.mp4
│   └─ Capturas/
│       └─ Terraria Screenshot 2025.12.22 - 20.47.50.78.png
└─ Desktop/                                       ← todo lo que no es un juego
    ├─ Desktop 2026.07.02 - 10.02.01.01.mp4
    └─ Capturas/
        └─ Desktop Screenshot 2025.12.22 - 20.47.50.78.png
```

- Base del nombre = **ejecutable del juego sin `.exe`** (`Terraria.exe` → `Terraria`), o `Desktop`
  si no hay juego (grabación de escritorio, o juego no reconocido).
- Marca de tiempo: `AAAA.MM.DD - HH.MM.SS.CC` (centésimas de segundo al final), la del momento en
  que se guarda el archivo.
- Las capturas llevan `Screenshot` entre la base y la marca de tiempo.
- Aplica igual a grabación manual, grabación automática de sesión y clip retroactivo (replay).

## Alcance

**Dentro:**

- Carpeta destino y nombre según lo de arriba, para videos y capturas.
- **Migración de lo existente** (decisión del owner): al arrancar, los clips que están sueltos en
  la raíz de la carpeta se mueven a la carpeta de su juego (el que tenga el catálogo) o a
  `Desktop`, y se renombran con la nomenclatura nueva; el catálogo se actualiza con la ruta nueva.
  Las capturas del viejo `Capturas/` se mueven a `Desktop/Capturas/` y se renombran.
- Escaneo del catálogo **recursivo**: la reconciliación con el disco tiene que ver los clips dentro
  de las subcarpetas.
- Todo movimiento es best-effort y no destructivo: si un archivo no se puede mover (bloqueado por
  el reproductor, permisos), se queda donde está y el catálogo lo sigue apuntando bien.

**Fuera (explícito):**

- Cambiar el nombre del archivo desde la UI (renombrar en la biblioteca sigue tocando solo el
  título del catálogo, no el archivo en disco).
- Reorganizar por fecha, o carpetas anidadas por año/mes.
- Borrar las carpetas que queden vacías tras el auto-borrado.
- Poner las capturas en el catálogo de la biblioteca (siguen siendo archivos sueltos, como hoy).

## Criterios de aceptación

Observables y verificables uno a uno:

- [ ] Grabar con un juego detectado (`Terraria.exe`) deja
      `<carpeta>/Terraria/Terraria 2026.07.02 - 10.02.01.01.mp4`.
- [ ] Grabar el escritorio (sin juego) deja `<carpeta>/Desktop/Desktop <marca>.mp4`.
- [ ] Un clip retroactivo (replay) con juego activo cae en la carpeta de ese juego, con su nombre.
- [ ] La captura de pantalla con juego activo deja
      `<carpeta>/Terraria/Capturas/Terraria Screenshot <marca>.png`; sin juego, en
      `Desktop/Capturas/`.
- [ ] La biblioteca sigue mostrando todos los clips (escaneo recursivo) y el reproductor los abre.
- [ ] Al arrancar con clips viejos en la raíz, quedan movidos y renombrados, la biblioteca los
      sigue mostrando (misma tarjeta, misma miniatura) y no se duplican.
- [ ] Si el destino ya existe, el archivo nuevo no pisa al viejo (se desambigua el nombre).
- [ ] Gates verdes: `npm run typecheck`, `npm run lint`, `npm run test`.
