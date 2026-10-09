import { describe, expect, it } from 'vitest';
import { clipsLabel, dateGroupOf, groupByDate } from '../libraryGroups';

// Fechas construidas en hora LOCAL (como las ve el usuario): el test vale en cualquier zona horaria.
const local = (y: number, m: number, d: number, h = 12, min = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, s, ms);

// Jueves 8 de octubre de 2026, 15:00. La semana empieza el lunes 5.
const AHORA = local(2026, 10, 8, 15);
const etiqueta = (fecha: Date, ahora = AHORA) => dateGroupOf(fecha, ahora).label;

describe('dateGroupOf — bordes de día', () => {
  it('medianoche exacta de hoy es «Hoy»; un milisegundo antes, «Ayer»', () => {
    expect(etiqueta(local(2026, 10, 8, 0, 0, 0, 0))).toBe('Hoy');
    expect(etiqueta(local(2026, 10, 7, 23, 59, 59, 999))).toBe('Ayer');
  });

  it('medianoche de ayer es «Ayer»; un milisegundo antes, «Esta semana»', () => {
    expect(etiqueta(local(2026, 10, 7, 0, 0, 0, 0))).toBe('Ayer');
    expect(etiqueta(local(2026, 10, 6, 23, 59, 59, 999))).toBe('Esta semana');
  });

  it('una fecha futura (reloj cambiado) cae en «Hoy»', () => {
    expect(etiqueta(local(2026, 10, 9, 10))).toBe('Hoy');
  });

  it('una fecha inválida no rompe: «Sin fecha»', () => {
    expect(etiqueta(new Date('no es una fecha'))).toBe('Sin fecha');
  });
});

describe('dateGroupOf — semana (empieza el lunes)', () => {
  it('el lunes de esta semana a las 00:00 es «Esta semana»; el domingo anterior, su mes', () => {
    expect(etiqueta(local(2026, 10, 5, 0, 0, 0, 0))).toBe('Esta semana');
    expect(etiqueta(local(2026, 10, 4, 23, 59))).toBe('Octubre 2026');
  });

  it('un lunes: «Ayer» es el domingo (aunque sea otra semana) y no hay «Esta semana»', () => {
    const lunes = local(2026, 10, 12, 9);
    expect(etiqueta(local(2026, 10, 11, 20), lunes)).toBe('Ayer');
    expect(etiqueta(local(2026, 10, 10, 20), lunes)).toBe('Octubre 2026');
  });

  it('un domingo: la semana va desde el lunes, seis días atrás', () => {
    const domingo = local(2026, 10, 11, 22);
    expect(etiqueta(local(2026, 10, 5, 0, 0, 0, 0), domingo)).toBe('Esta semana');
    expect(etiqueta(local(2026, 10, 4, 23, 59), domingo)).toBe('Octubre 2026');
  });

  it('la semana puede empezar el mes anterior', () => {
    const jueves = local(2026, 10, 1, 12); // jueves 1 de octubre; lunes 28 de septiembre
    expect(etiqueta(local(2026, 9, 28, 8), jueves)).toBe('Esta semana');
    expect(etiqueta(local(2026, 9, 27, 8), jueves)).toBe('Septiembre 2026');
  });
});

describe('dateGroupOf — meses y años', () => {
  it('lo anterior a la semana va por mes con su año', () => {
    expect(etiqueta(local(2026, 9, 30, 12))).toBe('Septiembre 2026');
    expect(etiqueta(local(2026, 1, 1, 0))).toBe('Enero 2026');
  });

  it('cambio de año: diciembre del año pasado no se mezcla con diciembre de este', () => {
    const enero = local(2027, 1, 20, 12);
    expect(etiqueta(local(2026, 12, 31, 23, 59), enero)).toBe('Diciembre 2026');
    expect(dateGroupOf(local(2025, 12, 5), enero).key).not.toBe(
      dateGroupOf(local(2026, 12, 5), enero).key,
    );
  });

  it('el 1 de enero, el 31 de diciembre es «Ayer»', () => {
    expect(etiqueta(local(2026, 12, 31, 23), local(2027, 1, 1, 8))).toBe('Ayer');
  });
});

describe('groupByDate', () => {
  const clip = (id: number, fecha: Date) => ({ id, createdAt: fecha.toISOString() });

  it('agrupa en el orden de la lista (más recientes primero) sin reordenar dentro del grupo', () => {
    const lista = [
      clip(1, local(2026, 10, 8, 14)),
      clip(2, local(2026, 10, 8, 9)),
      clip(3, local(2026, 10, 7, 20)),
      clip(4, local(2026, 10, 5, 10)),
      clip(5, local(2026, 9, 20)),
      clip(6, local(2026, 9, 2)),
      clip(7, local(2025, 12, 24)),
    ];
    const grupos = groupByDate(lista, AHORA);
    expect(grupos.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Hoy', [1, 2]],
      ['Ayer', [3]],
      ['Esta semana', [4]],
      ['Septiembre 2026', [5, 6]],
      ['Diciembre 2025', [7]],
    ]);
  });

  it('orden estable: los grupos salen por su primer clip y los clips conservan su orden', () => {
    // Lista que no viene ordenada por fecha: la agrupación no la reordena.
    const lista = [
      clip(1, local(2026, 9, 3)),
      clip(2, local(2026, 10, 8, 10)),
      clip(3, local(2026, 9, 25)),
    ];
    const grupos = groupByDate(lista, AHORA);
    expect(grupos.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Septiembre 2026', [1, 3]],
      ['Hoy', [2]],
    ]);
  });

  it('lista vacía: sin grupos', () => {
    expect(groupByDate([], AHORA)).toEqual([]);
  });
});

describe('clipsLabel', () => {
  it('singular y plural', () => {
    expect(clipsLabel(1)).toBe('1 clip');
    expect(clipsLabel(0)).toBe('0 clips');
    expect(clipsLabel(48)).toBe('48 clips');
  });
});
