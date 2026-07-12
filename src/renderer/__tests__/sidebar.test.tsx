import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import StorageIndicator from '../components/StorageIndicator';
import { crearGameclipMock } from './setup';

type GameclipMock = ReturnType<typeof crearGameclipMock>;

function mock(): GameclipMock {
  return window.gameclip as unknown as GameclipMock;
}

const GB = 1024 ** 3;

beforeEach(() => {
  Object.defineProperty(window, 'gameclip', { writable: true, value: crearGameclipMock() });
});

/** Stats y límite del catálogo, como los devuelve el main. */
function conAlmacenamiento(clipsGb: number, recordingsGb: number, limitGb: number) {
  mock().library.getStorageStats.mockResolvedValue({
    clipsBytes: clipsGb * GB,
    recordingsBytes: recordingsGb * GB,
    driveFreeBytes: 60 * GB,
    driveTotalBytes: 100 * GB,
  });
  mock().capture.getSettings.mockResolvedValue({
    ...DEFAULT_CAPTURE_SETTINGS,
    storageLimitGb: limitGb,
  });
}

function renderIndicador() {
  return render(
    <MemoryRouter initialEntries={['/biblioteca']}>
      <Routes>
        <Route path="/biblioteca" element={<StorageIndicator />} />
        <Route path="/ajustes/almacenamiento" element={<p>Sección Almacenamiento</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function anillo(): SVGCircleElement | null {
  return document.querySelector('.storage-ring-value');
}

describe('Indicador de almacenamiento del sidebar', () => {
  it('muestra el espacio usado y el límite configurado', async () => {
    conAlmacenamiento(2, 1, 10); // 3 GB usados de 10

    renderIndicador();

    expect(await screen.findByText('3 GB')).toBeInTheDocument();
    expect(screen.getByText('10 GB')).toBeInTheDocument();
  });

  it('el anillo representa el porcentaje usado', async () => {
    conAlmacenamiento(3, 0, 10); // 30 %
    renderIndicador();
    await screen.findByText('3 GB');

    const circunferencia = 2 * Math.PI * 16;
    const offset = Number(anillo()?.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(circunferencia * 0.7, 1); // 70 % del anillo sin pintar
  });

  it('sin límite muestra solo lo usado y no pinta progreso', async () => {
    conAlmacenamiento(3, 0, 0);

    renderIndicador();

    expect(await screen.findByText('Sin límite')).toBeInTheDocument();
    expect(anillo()).toBeNull();
  });

  it('pasado del límite el anillo se completa y entra en alerta', async () => {
    conAlmacenamiento(12, 0, 10);
    renderIndicador();
    await screen.findByText('12 GB');

    expect(Number(anillo()?.getAttribute('stroke-dashoffset'))).toBe(0);
    expect(document.querySelector('.storage-indicator')).toHaveClass('is-full');
  });

  it('se actualiza cuando cambia el catálogo (guardar o borrar un clip)', async () => {
    conAlmacenamiento(3, 0, 10);
    let notificar: () => void = () => undefined;
    mock().library.onChanged.mockImplementation((listener: () => void) => {
      notificar = listener;
      return () => undefined;
    });

    renderIndicador();
    await screen.findByText('3 GB');

    conAlmacenamiento(5, 0, 10); // se guardó un clip nuevo
    notificar();

    expect(await screen.findByText('5 GB')).toBeInTheDocument();
  });

  it('lleva a Ajustes → Almacenamiento al pulsarlo', async () => {
    const user = userEvent.setup();
    conAlmacenamiento(3, 0, 10);
    renderIndicador();
    await screen.findByText('3 GB');

    await user.click(screen.getByRole('button', { name: /Almacenamiento/ }));

    await waitFor(() => expect(screen.getByText('Sección Almacenamiento')).toBeInTheDocument());
  });

  it('sin stats (la API falla) no rompe el sidebar: no se muestra nada', async () => {
    mock().library.getStorageStats.mockRejectedValue(new Error('sin DB'));

    renderIndicador();

    await waitFor(() => expect(document.querySelector('.storage-indicator')).toBeNull());
  });
});

describe('formatStorage', () => {
  it('compacta bytes a MB/GB sin decimales de más', async () => {
    const { formatStorage } = await import('@shared/library');
    expect(formatStorage(3 * GB)).toBe('3 GB');
    expect(formatStorage(3.42 * GB)).toBe('3.4 GB');
    expect(formatStorage(750 * 1024 ** 2)).toBe('750 MB');
    expect(formatStorage(0)).toBe('0 MB');
    expect(formatStorage(-1)).toBe('0 MB');
  });
});
