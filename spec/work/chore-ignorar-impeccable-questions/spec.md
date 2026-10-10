# Spec — Dejar de versionar el estado temporal de impeccable

**Tipo:** Hotfix (mantenimiento del repo, sin código de la app)
**Rama:** `chore/ignorar-impeccable-questions`
**Fecha:** 2026-10-10

## Problema / Objetivo

`.impeccable/questions/roll.json` es el estado temporal de la skill de diseño (la última «tirada» con
la que eligió propuestas). Se reescribe cada vez que se usa la skill, ensucia `git status` y genera
diffs sin significado; entró en el repo junto con `.impeccable/` en el rediseño y volvió a colarse en
el commit de la v1.0.0. No tiene datos personales ni secretos.

## Alcance

**Dentro:** `.impeccable/questions/` al `.gitignore` y `git rm --cached` del archivo (se conserva en
local).

**Fuera:** reescribir el historial (el archivo sigue en los commits anteriores; pesa unos KB).

## Criterios de aceptación

- [x] `git ls-files .impeccable` no lista nada de `questions/`.
- [x] Usar la skill de nuevo no deja cambios en `git status`.
