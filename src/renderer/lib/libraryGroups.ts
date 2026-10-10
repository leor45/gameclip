/**
 * Grupos por fecha de la Biblioteca: «Hoy», «Ayer», «Esta semana» y, de ahí para atrás, un grupo por
 * mes («Septiembre 2026»).
 *
 * Criterio (todo en la hora LOCAL del equipo, que es la que el usuario reconoce):
 * - «Hoy»: desde las 00:00 de hoy. Una fecha futura (reloj cambiado) también cae aquí: no tiene un
 *   sitio mejor y así no se esconde al fondo de la lista.
 * - «Ayer»: el día natural anterior, aunque sea de la semana pasada (el lunes, «Ayer» es el domingo).
 * - «Esta semana»: desde el LUNES de la semana en curso (semana europea, la del calendario en
 *   español) hasta antes de ayer. El lunes y el martes este grupo queda vacío y no se pinta.
 * - Lo anterior, por mes natural con su año, incluido lo del mes en curso que no es de esta semana.
 *
 * El orden lo pone quien llama (la Biblioteca ya llega de más reciente a más antiguo): los grupos
 * salen en el orden en que aparece su primer clip y, dentro de cada grupo, los clips conservan su
 * orden. Así la agrupación nunca reordena nada.
 */

export interface DateGroup<T> {
  /** Clave estable del grupo (para `key` de React). */
  key: string;
  /** Texto de la cabecera. */
  label: string;
  items: T[];
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** Medianoche local del día `ahora` desplazado `dias` días. `Date` corrige meses, años y horario de verano. */
function medianoche(ahora: Date, dias = 0): number {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dias).getTime();
}

/** Grupo al que pertenece una fecha, visto desde `ahora`. */
export function dateGroupOf(fecha: Date, ahora: Date): { key: string; label: string } {
  const t = fecha.getTime();
  if (Number.isNaN(t)) return { key: 'sin-fecha', label: 'Sin fecha' };
  if (t >= medianoche(ahora)) return { key: 'hoy', label: 'Hoy' };
  if (t >= medianoche(ahora, -1)) return { key: 'ayer', label: 'Ayer' };
  // getDay(): domingo = 0. Días desde el lunes: lunes 0 … domingo 6.
  const desdeLunes = (ahora.getDay() + 6) % 7;
  if (t >= medianoche(ahora, -desdeLunes)) return { key: 'semana', label: 'Esta semana' };
  const mes = fecha.getMonth();
  const anio = fecha.getFullYear();
  return { key: `${anio}-${mes + 1}`, label: `${MESES[mes]} ${anio}` };
}

/** Agrupa por fecha de creación (`createdAt`, ISO 8601) sin reordenar. */
export function groupByDate<T extends { createdAt: string }>(
  items: readonly T[],
  ahora: Date = new Date(),
): DateGroup<T>[] {
  const grupos = new Map<string, DateGroup<T>>();
  for (const item of items) {
    const { key, label } = dateGroupOf(new Date(item.createdAt), ahora);
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = { key, label, items: [] };
      grupos.set(key, grupo);
    }
    grupo.items.push(item);
  }
  return [...grupos.values()];
}

/** «1 clip» / «3 clips». */
export function clipsLabel(n: number): string {
  return n === 1 ? '1 clip' : `${n} clips`;
}
