import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Select, { BUSCADOR_DESDE, type SelectOption } from '../components/Select';
import { opcionesAbiertas } from './helpers';

afterEach(cleanup);

const OPCIONES: SelectOption<string>[] = [
  { value: 'a', label: 'Alta' },
  { value: 'm', label: 'Media' },
  { value: 'x', label: 'Ocupada', disabled: true },
  { value: 'b', label: 'Baja' },
];

function Controlado({
  opciones = OPCIONES,
  inicial = 'm',
  onChange = () => {},
  placeholder,
}: {
  opciones?: SelectOption<string>[];
  inicial?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  const [v, setV] = useState(inicial);
  return (
    <label>
      Calidad
      <Select
        value={v}
        options={opciones}
        placeholder={placeholder}
        onChange={(nv) => {
          setV(nv);
          onChange(nv);
        }}
      />
    </label>
  );
}

describe('Select', () => {
  it('toma el nombre de su <label> y muestra la opción elegida', () => {
    render(<Controlado />);
    const campo = screen.getByRole('combobox', { name: 'Calidad' });
    expect(campo).toHaveTextContent('Media');
    expect(campo).toHaveAttribute('aria-expanded', 'false');
  });

  it('clic abre la lista (en un portal) con la elegida marcada; clic en otra la elige y cierra', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    const campo = screen.getByLabelText('Calidad');
    await user.click(campo);
    expect(campo).toHaveAttribute('aria-expanded', 'true');
    const lista = screen.getByRole('listbox');
    expect(campo.contains(lista)).toBe(false);
    expect(screen.getByRole('option', { name: 'Media' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('option', { name: 'Baja' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(campo).toHaveTextContent('Baja');
    expect(campo).toHaveFocus();
  });

  it('teclado: ↓ abre, ↓ salta las desactivadas, Intro elige; Esc cierra sin cambiar y no se escapa', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    const campo = screen.getByLabelText('Calidad');
    campo.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Desde «Media», ↓ salta «Ocupada» (desactivada) y llega a «Baja».
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('b');

    const fuera = vi.fn();
    window.addEventListener('keydown', fuera);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}{Escape}');
    window.removeEventListener('keydown', fuera);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(fuera).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  });

  it('una opción desactivada no se puede elegir', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    await user.click(screen.getByLabelText('Calidad'));
    const ocupada = screen.getByRole('option', { name: 'Ocupada' });
    expect(ocupada).toHaveAttribute('aria-disabled', 'true');
    await user.click(ocupada);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('escribir salta a la opción que empieza así (sin buscador)', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    screen.getByLabelText('Calidad').focus();
    await user.keyboard('{ArrowDown}b{Enter}');
    expect(screen.getByLabelText('Calidad')).toHaveAttribute('data-value', 'b');
  });

  it('valor fuera de las opciones: muestra el texto de «elegir»', () => {
    render(<Controlado inicial="" placeholder="Elegir una app…" />);
    expect(screen.getByLabelText('Calidad')).toHaveTextContent('Elegir una app…');
  });

  it(`con ${BUSCADOR_DESDE} o más opciones lleva buscador, que filtra por texto y por detalle`, async () => {
    const user = userEvent.setup();
    const muchas = Array.from({ length: BUSCADOR_DESDE }, (_, i) => ({
      value: `app${i}.exe`,
      label: `app${i}.exe`,
      detail: i === 4 ? 'Spotify Premium' : `Ventana ${i}`,
    }));
    render(<Controlado opciones={muchas} inicial="" />);
    await user.click(screen.getByLabelText('Calidad'));
    const buscador = screen.getByRole('combobox', { name: 'Buscar' });
    expect(buscador).toHaveFocus();
    await user.type(buscador, 'spotify');
    expect(opcionesAbiertas()).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Calidad')).toHaveAttribute('data-value', 'app4.exe');
  });

  it('desactivado no abre', async () => {
    const user = userEvent.setup();
    render(
      <label>
        Calidad
        <Select value="m" options={OPCIONES} onChange={() => {}} disabled />
      </label>,
    );
    await user.click(screen.getByLabelText('Calidad'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clic fuera cierra sin cambiar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <>
        <Controlado onChange={onChange} />
        <button type="button">Otro</button>
      </>,
    );
    await user.click(screen.getByLabelText('Calidad'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Otro' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
