import { describe, expect, it } from 'vitest';
import { isValidEmail } from '../auth';

// Email de exactamente `largo` caracteres con forma válida: parte local de 64 + dominio relleno.
function emailDeLargo(largo: number): string {
  const local = 'a'.repeat(64);
  const sufijo = '.test';
  return `${local}@${'b'.repeat(largo - local.length - 1 - sufijo.length)}${sufijo}`;
}

describe('isValidEmail', () => {
  // Regresión D2-BUG-1 (CWE-1333): la regex retrocede en tiempo cuadrático con un dominio lleno de
  // puntos que no termina bien. Con 60 000 caracteres tardaba ~3 s y congelaba el main de Electron.
  it('rechaza al instante un email enorme que fuerza el retroceso de la regex', () => {
    const malicioso = 'a@' + '.'.repeat(60000) + ' ';
    const inicio = performance.now();
    const resultado = isValidEmail(malicioso);
    const ms = performance.now() - inicio;

    expect(resultado).toBe(false);
    expect(ms).toBeLessThan(200);
  });

  it('acepta un email de 254 caracteres (máximo de RFC 5321) y rechaza uno de 255', () => {
    const limite = emailDeLargo(254);
    const pasado = emailDeLargo(255);
    expect(limite).toHaveLength(254);
    expect(pasado).toHaveLength(255);

    expect(isValidEmail(limite)).toBe(true);
    expect(isValidEmail(pasado)).toBe(false);
  });

  it.each([
    ['leo@gameclip.test', true],
    ['a.b+etiqueta@sub.dominio.es', true],
    ['ñandú@correo.es', true],
    ['a@b.c', true],
    ['no-es-email', false],
    ['', false],
    ['a@b', false],
    ['@x.com', false],
    ['a@.com', false],
    ['a b@c.d', false],
    [' a@b.c', false],
    ['a@b@c.d', false],
  ])('con largo normal se comporta igual que siempre: %j → %s', (email, esperado) => {
    expect(isValidEmail(email)).toBe(esperado);
  });
});
