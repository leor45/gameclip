import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Filmstrip from '../components/editor-avanzado/Filmstrip';

// Regresión F5-fix-2: al montar el editor, el clip aún no cargó → duración 0 → los tiempos de muestreo
// salían vacíos y Filmstrip cacheaba un array vacío que NUNCA se reintentaba (efecto solo por [clipId]).
// La barra quedaba azul para siempre. Ahora el muestreo espera a la duración (>0) y no cachea vacío.
//
// jsdom no implementa el `seek` del <video>, así que la extracción real no completa aquí; lo observable
// es si Filmstrip ENTRA o no en la extracción (crea un <video> oculto). Con duración 0 no debe; al
// conocerla, sí (prueba de que no quedó envenenado).

afterEach(() => vi.restoreAllMocks());

function videoCreations(calls: { readonly [0]?: unknown }[]): number {
  return calls.filter((c) => c[0] === 'video').length;
}

describe('Filmstrip — muestreo tras conocer la duración (Fase 5, fix)', () => {
  it('con duración 0 no extrae; al llegar la duración sí extrae (no cachea vacío)', () => {
    const createSpy = vi.spyOn(document, 'createElement');
    // clipId único para no chocar con la caché de módulo de otros tests.
    const clipId = 987654;

    const { rerender } = render(
      <Filmstrip clipId={clipId} segments={[{ start: 0, end: 0 }]} duration={0} />,
    );
    expect(videoCreations(createSpy.mock.calls)).toBe(0); // duración 0 → ni extrae ni cachea vacío

    rerender(<Filmstrip clipId={clipId} segments={[{ start: 0, end: 60 }]} duration={60} />);
    expect(videoCreations(createSpy.mock.calls)).toBeGreaterThan(0); // al conocer la duración, extrae
  });

  it('sin clip no intenta nada', () => {
    const createSpy = vi.spyOn(document, 'createElement');
    render(<Filmstrip clipId={null} segments={[]} duration={60} />);
    expect(videoCreations(createSpy.mock.calls)).toBe(0);
  });
});
