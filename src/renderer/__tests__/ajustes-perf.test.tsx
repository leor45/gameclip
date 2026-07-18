import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import App from '../App';
import { sesionFalsa } from './helpers';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

beforeEach(() => {
  localStorage.setItem('gameclip.session', JSON.stringify(sesionFalsa));
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

/** Renderiza la app con sesión activa y navega a Ajustes → Avanzado. */
async function irAAvanzado() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Ajustes' }));
  await user.click(await screen.findByRole('link', { name: 'Avanzado' }));
  await screen.findByLabelText('Mostrar overlay de rendimiento');
  return user;
}

describe('Ajustes — Overlay de rendimiento', () => {
  it('lista las 9 métricas con su check y el estado por defecto', async () => {
    await irAAvanzado();

    for (const metrica of [
      'FPS',
      'Uso de GPU (%)',
      'Temperatura de GPU',
      'Velocidad de fans de la GPU (RPM)',
      'Voltaje de la GPU',
      'VRAM usada / total',
      'Uso de CPU (%)',
      'Temperatura de CPU',
      'RAM usada',
    ]) {
      expect(screen.getByLabelText(metrica)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('FPS')).toBeChecked();
    expect(screen.getByLabelText('Temperatura de GPU')).not.toBeChecked();
    expect(screen.getByLabelText('Mostrar overlay de rendimiento')).not.toBeChecked();
  });

  it('avisa junto a las métricas que FPS y Temp CPU necesitan administrador', async () => {
    // El aviso tiene que estar donde se marcan las métricas: la explicación completa vive al final
    // del fieldset, y quien marca FPS no tiene por qué haber bajado hasta allí.
    await irAAvanzado();

    const avisos = screen.getAllByText(/necesitan permisos de administrador/i);
    expect(avisos.length).toBeGreaterThanOrEqual(1);
    const juntoALasMetricas = avisos.find((el) => /FPS y Temp CPU/i.test(el.textContent ?? ''));
    expect(juntoALasMetricas).toBeDefined();
    // Y remite a la salida real, no deja al usuario sin qué hacer.
    expect(juntoALasMetricas!.textContent).toMatch(/Iniciar con Windows como administrador/i);

    // La leyenda del checkbox elevado sigue en su sitio (explica el mecanismo completo).
    expect(screen.getByText(/crea una tarea programada elevada/i)).toBeInTheDocument();
  });

  it('la copy no nombra a la NVIDIA App', async () => {
    // La NVIDIA App fue referencia de diseño durante el desarrollo del overlay; el producto no la
    // nombra. La comprobación va sobre el DOM renderizado y NO sobre los ficheros: en el código se
    // conservan a propósito los comentarios que explican el porqué de estas decisiones y el
    // diagnóstico de PresentMon que la cita como capturador que compite por las sesiones ETW.
    await irAAvanzado();

    expect(document.body.textContent).not.toMatch(/NVIDIA App/i);
  });

  it('explica por qué el centro no es una posición elegible', async () => {
    // El dato útil de la leyenda vieja sobrevive a quitar la comparación: sin él, reservar el centro
    // parece arbitrario y acabaría "arreglándose".
    await irAAvanzado();

    const leyenda = screen.getByText(/los cambios se ven en pantalla al instante/i);
    expect(leyenda.textContent).toMatch(/centro de la pantalla/i);
    expect(leyenda.textContent).toMatch(/juego/i);
  });

  it('distingue los dos requisitos: FPS solo admin, Temp CPU admin + PawnIO', async () => {
    // No son el mismo requisito y fundirlos engaña: los FPS salen de PresentMon (ETW, solo pide
    // elevación) y la Temp CPU de los MSR, que además necesitan el driver.
    await irAAvanzado();

    const leyenda = screen.getByText(/crea una tarea programada elevada/i);
    expect(leyenda.textContent).toMatch(/temperatura de CPU necesita\s+además el controlador PawnIO/i);
    expect(leyenda.textContent).toMatch(/los FPS no/i);
  });

  it('sin PawnIO y con Temp CPU marcada, ofrece el enlace de descarga', async () => {
    mock().perf.isPawnIoInstalled.mockResolvedValue(false);
    const user = await irAAvanzado();

    // Sin marcar la métrica no hay aviso: a quien no la use, contarle que le falta un driver de
    // kernel es ruido —y ruido que suena a que la app pide privilegios.
    expect(screen.queryByTestId('aviso-pawnio')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Temperatura de CPU'));

    const aviso = await screen.findByTestId('aviso-pawnio');
    // Dice qué es y qué se pierde, sin prometer que la app lo instale.
    expect(aviso.textContent).toMatch(/PawnIO/);
    expect(aviso.textContent).toMatch(/otras ocho siguen funcionando/i);
    expect(aviso.textContent).toMatch(/anti-cheat/i);

    const enlace = screen.getByRole('link', { name: /Descargar PawnIO/i });
    expect(enlace).toHaveAttribute('href', 'https://pawnio.eu');
  });

  it('con PawnIO instalado no aparece el aviso aunque Temp CPU esté marcada', async () => {
    // El mock lo da por instalado (el caso normal, y el de la máquina del owner).
    const user = await irAAvanzado();
    await user.click(screen.getByLabelText('Temperatura de CPU'));

    expect(screen.queryByTestId('aviso-pawnio')).not.toBeInTheDocument();
  });

  it('si la comprobación de PawnIO falla, no se inventa un aviso', async () => {
    // Best-effort: ante un canal roto, callar es mejor que mandar a instalar un driver de kernel a
    // quien quizá ya lo tiene.
    mock().perf.isPawnIoInstalled.mockRejectedValue(new Error('canal caído'));
    const user = await irAAvanzado();
    await user.click(screen.getByLabelText('Temperatura de CPU'));

    expect(screen.queryByTestId('aviso-pawnio')).not.toBeInTheDocument();
  });

  it('guarda las métricas marcadas y el overlay activado', async () => {
    const user = await irAAvanzado();

    await user.click(screen.getByLabelText('Mostrar overlay de rendimiento'));
    await user.click(screen.getByLabelText('Temperatura de GPU'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    const guardado = mock().capture.setSettings.mock.calls[0][0];
    expect(guardado.perfOverlayEnabled).toBe(true);
    expect(guardado.perfOverlay.metrics.gpuTemp).toBe(true);
    expect(guardado.perfOverlay.metrics.fps).toBe(true);
  });

  it('mover el slider actualiza el preset y esquiva el centro-centro', async () => {
    await irAAvanzado();

    expect(screen.getByTestId('perf-preset')).toHaveTextContent('Parte superior izquierda');

    // range no se teclea: se dispara el change directo, como hace el navegador al arrastrar.
    fireEvent.change(screen.getByLabelText(/Posición horizontal/), { target: { value: '50' } });
    expect(screen.getByTestId('perf-preset')).toHaveTextContent('Parte superior central');

    fireEvent.change(screen.getByLabelText(/Posición vertical/), { target: { value: '50' } });
    // 50/50 no existe: la horizontal se pega a un lado y el preset lo cuenta.
    expect(screen.getByTestId('perf-preset')).toHaveTextContent('Parte central derecha');
  });

  it('las flechas del preset fijan los sliders a la posición canónica', async () => {
    const user = await irAAvanzado();

    await user.click(screen.getByRole('button', { name: 'Posición siguiente' }));
    expect(screen.getByTestId('perf-preset')).toHaveTextContent('Parte superior central');
    expect(screen.getByLabelText(/Posición horizontal/)).toHaveValue('50');

    await user.click(screen.getByRole('button', { name: 'Posición anterior' }));
    expect(screen.getByTestId('perf-preset')).toHaveTextContent('Parte superior izquierda');
    expect(screen.getByLabelText(/Posición horizontal/)).toHaveValue('0');
  });

  it('con el overlay activo, tocar la config manda el preview en vivo', async () => {
    const user = await irAAvanzado();
    mock().capture.getSettings.mockResolvedValue({
      ...DEFAULT_CAPTURE_SETTINGS,
      perfOverlayEnabled: true,
    });

    await user.click(screen.getByLabelText('Mostrar overlay de rendimiento'));
    fireEvent.change(screen.getByLabelText(/Posición horizontal/), { target: { value: '100' } });

    await screen.findByText('Parte superior derecha');
    await new Promise((r) => setTimeout(r, 60)); // debounce del preview
    const preview = mock().perf.preview;
    expect(preview).toHaveBeenCalled();
    const ultimo = preview.mock.calls[preview.mock.calls.length - 1][0];
    expect(ultimo.posX).toBe(100);
  });

  it('rechaza como atajo la tecla del push to talk y los atajos ya asignados', async () => {
    const user = await irAAvanzado();

    await user.click(screen.getByRole('button', { name: 'Editar atajo…' }));
    // F9 es el PTT por defecto.
    fireEvent.keyDown(window, { key: 'F9', code: 'F9' });
    expect(await screen.findByText(/reservada para el push to talk/)).toBeInTheDocument();

    // F8 ya es «Guardar clip».
    fireEvent.keyDown(window, { key: 'F8', code: 'F8' });
    expect(await screen.findByText(/ya está asignada a «Guardar clip»/)).toBeInTheDocument();

    // Una libre sí entra.
    fireEvent.keyDown(window, { key: 'r', code: 'KeyR', altKey: true });
    expect(await screen.findByText('Alt+R')).toBeInTheDocument();
  });

  it('el atajo del overlay aparece también en la sección Atajos', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('link', { name: 'Atajos' }));
    await screen.findByText('Atajos de teclado');
    expect(screen.getByText('Mostrar/ocultar overlay de rendimiento')).toBeInTheDocument();
  });

  it('guarda el tamaño de fuente elegido', async () => {
    const user = await irAAvanzado();

    expect(screen.getByLabelText('Tamaño de fuente')).toHaveValue('standard');
    await user.selectOptions(screen.getByLabelText('Tamaño de fuente'), 'large');
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));

    expect(mock().capture.setSettings.mock.calls[0][0].perfOverlay.fontSize).toBe('large');
  });

  it('guarda el opt-in de iniciar con Windows como administrador', async () => {
    const user = await irAAvanzado();
    await user.click(screen.getByLabelText('Iniciar con Windows como administrador'));
    await user.click(screen.getByRole('button', { name: 'Guardar ajustes' }));
    expect(mock().capture.setSettings.mock.calls[0][0].autoLaunchElevated).toBe(true);
  });
});
