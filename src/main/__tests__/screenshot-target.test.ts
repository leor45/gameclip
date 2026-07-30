import { describe, expect, it } from 'vitest';
import { SCREENSHOT_MONITOR_PRIMARY } from '../../shared/capture';
import { pickScreenshotSource } from '../capture/screenshot-target';

// Los dos monitores del equipo del owner: el principal es HDR (2560x1440) y el secundario está
// en vertical (1080x1920). Los ids son los reales que devolvió `screen.getAllDisplays()`.
const PRINCIPAL = { id: 2528732444, width: 2560, height: 1440 };
const SECUNDARIO = { id: 2779098405, width: 1080, height: 1920 };
const DISPLAYS = [PRINCIPAL, SECUNDARIO];

/** Fuente de la ruta DXGI: trae `display_id` y el thumbnail respeta el aspecto del monitor. */
function fuenteDxgi(display: { id: number; width: number; height: number }, alto = 360) {
  return {
    display_id: String(display.id),
    width: Math.round((display.width / display.height) * alto),
    height: alto,
  };
}

/** Fuente de la ruta GDI: mismo thumbnail, pero SIN `display_id` (Chromium lo deja vacío). */
function fuenteGdi(display: { id: number; width: number; height: number }, alto = 360) {
  return { ...fuenteDxgi(display, alto), display_id: '' };
}

describe('pickScreenshotSource', () => {
  // REGRESIÓN: con HDR activo, DXGI descarta el monitor y desaparece de getSources(). El código
  // viejo caía a `?? sources[monitorIndex] ?? sources[0]` y guardaba una captura DEL OTRO MONITOR.
  // Un PNG del monitor equivocado en la biblioteca es peor que no tener captura.
  it('si el monitor objetivo no está entre las fuentes, NO elige otro monitor', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
      sources: [fuenteDxgi(SECUNDARIO)], // el principal HDR no aparece
    });

    expect(resultado).toEqual({ ok: false, reason: 'monitor-no-capturable' });
  });

  it('el índice explícito tampoco cae al monitor que sí está disponible', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: 0, // el principal, por índice
      sources: [fuenteDxgi(SECUNDARIO)],
    });

    expect(resultado).toEqual({ ok: false, reason: 'monitor-no-capturable' });
  });

  it('empareja por display_id, no por orden de la lista', () => {
    // El principal es displays[0] pero llega SEGUNDO entre las fuentes: por orden se elegiría mal.
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
      sources: [fuenteDxgi(SECUNDARIO), fuenteDxgi(PRINCIPAL)],
    });

    expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
  });

  it('el default sigue al monitor principal aunque no sea displays[0]', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: SECUNDARIO.id, // el usuario hizo principal al secundario en Windows
      monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
      sources: [fuenteDxgi(PRINCIPAL), fuenteDxgi(SECUNDARIO)],
    });

    expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
  });

  it('un índice explícito elige ese monitor, no el principal', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: 1,
      sources: [fuenteDxgi(PRINCIPAL), fuenteDxgi(SECUNDARIO)],
    });

    expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
  });

  it('índice fuera de rango (monitor apagado o desconectado) → monitor-ausente', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: 5,
      sources: [fuenteDxgi(PRINCIPAL), fuenteDxgi(SECUNDARIO)],
    });

    expect(resultado).toEqual({ ok: false, reason: 'monitor-ausente' });
  });

  it('sin monitores no hay nada que capturar', () => {
    const resultado = pickScreenshotSource({
      displays: [],
      primaryId: PRINCIPAL.id,
      monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
      sources: [fuenteDxgi(PRINCIPAL)],
    });

    expect(resultado).toEqual({ ok: false, reason: 'sin-monitores' });
  });

  it('sin fuentes falla, no captura nada', () => {
    const resultado = pickScreenshotSource({
      displays: DISPLAYS,
      primaryId: PRINCIPAL.id,
      monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
      sources: [],
    });

    expect(resultado).toEqual({ ok: false, reason: 'monitor-no-capturable' });
  });

  describe('ruta GDI (compatibilidad HDR: las fuentes vienen sin display_id)', () => {
    it('empareja por posición y el aspecto lo valida', () => {
      const resultado = pickScreenshotSource({
        displays: DISPLAYS,
        primaryId: PRINCIPAL.id,
        monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
        sources: [fuenteGdi(PRINCIPAL), fuenteGdi(SECUNDARIO)],
      });

      expect(resultado).toEqual({ ok: true, sourceIndex: 0 });
    });

    it('si la posición no valida por aspecto, busca la única fuente que encaje', () => {
      // Chromium enumeró al revés que Electron: 16:9 en el índice 1.
      const resultado = pickScreenshotSource({
        displays: DISPLAYS,
        primaryId: PRINCIPAL.id,
        monitorIndex: 0, // el 16:9
        sources: [fuenteGdi(SECUNDARIO), fuenteGdi(PRINCIPAL)],
      });

      expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
    });

    it('con menos fuentes que monitores no adivina → fuentes-ambiguas', () => {
      const resultado = pickScreenshotSource({
        displays: DISPLAYS,
        primaryId: PRINCIPAL.id,
        monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
        sources: [fuenteGdi(PRINCIPAL)],
      });

      expect(resultado).toEqual({ ok: false, reason: 'fuentes-ambiguas' });
    });

    it('dos monitores del mismo aspecto: manda la posición', () => {
      const gemelo = { id: 99, width: 2560, height: 1440 };
      const resultado = pickScreenshotSource({
        displays: [PRINCIPAL, gemelo],
        primaryId: PRINCIPAL.id,
        monitorIndex: 1,
        sources: [fuenteGdi(PRINCIPAL), fuenteGdi(gemelo)],
      });

      expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
    });

    it('el aspecto tolera el redondeo del thumbnail', () => {
      // 1080x1920 a 360 de alto da 202.5 → Chromium devuelve 203 (medido en la máquina del owner).
      const resultado = pickScreenshotSource({
        displays: DISPLAYS,
        primaryId: SECUNDARIO.id,
        monitorIndex: SCREENSHOT_MONITOR_PRIMARY,
        sources: [
          { display_id: '', width: 640, height: 360 },
          { display_id: '', width: 203, height: 360 },
        ],
      });

      expect(resultado).toEqual({ ok: true, sourceIndex: 1 });
    });
  });
});
