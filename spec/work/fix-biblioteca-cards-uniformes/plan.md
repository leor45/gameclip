# Plan — Biblioteca: cards uniformes con preview en `contain`

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

Solo CSS. El bug es el ciclo clásico de sizing: `.clip-thumb` declara `aspect-ratio: 16/9`
pero su `<img>` (`width/height: 100%`) participa del flujo; sin altura definida en el
contenedor, `height: 100%` resuelve a `auto`, la imagen impone su altura intrínseca escalada
y el `aspect-ratio` cede (los thumbnails 9:16 estiran la card). El fix saca la imagen del
flujo:

```css
.clip-thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain; /* antes cover: el preview completo, con bandas, sin recorte */
}
```

`.clip-thumb` ya es `position: relative` y tiene fondo oscuro (`#0c0e12`) para las bandas.
Con la imagen absoluta, la altura del botón la define solo el `aspect-ratio` → todas las
cards miden lo mismo. El placeholder (`.clip-thumb-placeholder`) no cambia: su `height:100%`
ya resolvía bien porque el aspect-ratio hace definida la altura cuando no hay contenido que
la dispute.

Regresión: test que fija la regla en `styles.css` (position absolute + contain en
`.clip-thumb img`), rojo antes del fix. Verificación visual en la app real (CDP): con la
biblioteca real (clips 16:9 y 9:16 mezclados), todas las `.clip-thumb` miden lo mismo.

## Archivos / módulos afectados

- `src/renderer/styles.css` — regla `.clip-thumb img`.
- `src/renderer/__tests__/biblioteca-css.test.ts` — regresión de la regla (nuevo).

## Decisiones y alternativas consideradas

- **`position: absolute` + `inset: 0`** — alternativa: `overflow: hidden` + `max-height`.
  Descartada: no elimina el ciclo de sizing, solo lo enmascara recortando.
- **`object-fit: contain`** — alternativa: mantener `cover` (recorta). El owner pidió
  explícitamente `contain` para ver el preview completo.

## Riesgos

- Ninguno estructural: cambio acotado a una regla; el grid y el resto de la card no cambian.

---

**Estado:** ✅ aprobado el 2026-07-11 (aprobación delegada por el owner en esta sesión)
