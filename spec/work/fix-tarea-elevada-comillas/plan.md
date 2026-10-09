# Plan — La tarea de auto-inicio elevado nunca se reconoce como correcta

> **Este plan es un contrato.** Se propone y se espera el OK del owner antes de escribir código.
> Aprobado, el alcance queda fijo: lo nuevo lleva su propio spec/plan.

## Enfoque

En `src/main/elevated-launch.ts`, un helper `valorXml(raw)`: decodifica entidades XML, recorta espacios
y quita un par de comillas envolventes. `elevatedTaskMatches` compara
`valorXml(command).toLowerCase() === exePath.toLowerCase()` y `valorXml(arguments) === '--hidden'`.

El test de regresión usa el `<Command>` **literal** que devolvió `schtasks /Query /XML` en la máquina del
owner.

## Archivos / módulos afectados

- `src/main/elevated-launch.ts`
- `src/main/__tests__/elevated-launch.test.ts`

## Decisiones y alternativas consideradas

- **Normalizar al leer** frente a crear la tarea sin comillas: sin comillas una ruta con espacios se
  rompería; el formato con comillas es el correcto.

## Riesgos

- Ninguno relevante.

---

**Estado:** ⏳ pendiente de aprobación
