import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../components/ConfirmDialog';
import GameIcon from '../components/GameIcon';
import HdrRestartPrompt from '../components/HdrRestartPrompt';
import { clearIconCache, loadIcon } from '../lib/useIcon';
import { crearGameclipMock } from './setup';

const PNG = 'data:image/png;base64,AAAA';

beforeEach(() => {
  window.gameclip = crearGameclipMock() as unknown as typeof window.gameclip;
  clearIconCache();
});

describe('loadIcon', () => {
  it('pide una sola vez por juego aunque lo pidan varios a la vez (sin distinguir mayúsculas)', async () => {
    let resolver: (v: string | null) => void = () => undefined;
    vi.mocked(window.gameclip.icons.forGame).mockReturnValue(new Promise((r) => (resolver = r)));
    const a = loadIcon({ game: 'Hades' });
    const b = loadIcon({ game: ' hades ' });
    resolver(PNG);
    expect(await a).toBe(PNG);
    expect(await b).toBe(PNG);
    expect(window.gameclip.icons.forGame).toHaveBeenCalledTimes(1);
    await loadIcon({ game: 'Hades' });
    expect(window.gameclip.icons.forGame).toHaveBeenCalledTimes(1);
  });

  it('«sin icono» no se recuerda: la siguiente petición vuelve a preguntar', async () => {
    vi.mocked(window.gameclip.icons.forGame).mockResolvedValue(null);
    expect(await loadIcon({ game: 'Hades' })).toBeNull();
    vi.mocked(window.gameclip.icons.forGame).mockResolvedValue(PNG);
    expect(await loadIcon({ game: 'Hades' })).toBe(PNG);
  });

  it('un fallo o algo que no es una imagen cuenta como sin icono', async () => {
    vi.mocked(window.gameclip.icons.forExe).mockRejectedValue(new Error('boom'));
    expect(await loadIcon({ exe: 'Discord.exe' })).toBeNull();
    vi.mocked(window.gameclip.icons.forExe).mockResolvedValue('javascript:alert(1)');
    expect(await loadIcon({ exe: 'Spotify.exe' })).toBeNull();
  });
});

describe('GameIcon', () => {
  it('muestra el icono del juego cuando el main lo tiene', async () => {
    vi.mocked(window.gameclip.icons.forGame).mockResolvedValue(PNG);
    const { container } = render(<GameIcon game="Hades" />);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', PNG));
    expect(container.querySelector('.gc-icon')).toHaveAttribute('data-icon', 'app');
  });

  it('sin icono se ve el logo de GameClip', async () => {
    const { container } = render(<GameIcon game="Pixel Pals" />);
    await waitFor(() => expect(window.gameclip.icons.forGame).toHaveBeenCalledWith('Pixel Pals'));
    expect(container.querySelector('.gc-icon')).toHaveAttribute('data-icon', 'logo');
    expect(container.querySelector('img')?.getAttribute('src')).not.toBe(PNG);
  });

  it('los iconos fijos y «sin juego» no piden nada al main', () => {
    const { container } = render(
      <>
        <GameIcon fixed="pad" />
        <GameIcon fixed="mic" />
        <GameIcon game={null} />
      </>,
    );
    expect(window.gameclip.icons.forGame).not.toHaveBeenCalled();
    expect(window.gameclip.icons.forExe).not.toHaveBeenCalled();
    const iconos = [...container.querySelectorAll('.gc-icon')].map((e) =>
      e.getAttribute('data-icon'),
    );
    expect(iconos).toEqual(['pad', 'mic', 'desktop']);
  });

  it('un ejecutable pide por exe', async () => {
    render(<GameIcon exe="Discord.exe" />);
    await waitFor(() => expect(window.gameclip.icons.forExe).toHaveBeenCalledWith('Discord.exe'));
  });
});

describe('ConfirmDialog', () => {
  it('destructivo: foco en Cancelar; Esc cancela', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="¿Eliminar el clip?"
        confirmLabel="Eliminar"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>El archivo de vídeo también se borra del disco.</p>
      </ConfirmDialog>,
    );
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar el clip?' });
    expect(dialogo).toHaveAccessibleDescription('El archivo de vídeo también se borra del disco.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirmar llama a onConfirm; clic fuera cancela', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" confirmLabel="Sí" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Sí' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(document.querySelector('.gc-modal-backdrop')!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('ocupado: no se puede descartar ni pulsar', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="T" confirmLabel="Sí" busy onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sí' })).toBeDisabled();
  });
});

describe('HdrRestartPrompt', () => {
  function preguntar() {
    const listener = vi.mocked(window.gameclip.ui.onAskHdrRestart).mock.calls[0][0];
    act(() => listener({ id: 'q1' }));
  }

  it('aparece cuando el main pregunta y responde «now» con el mismo id', async () => {
    render(<HdrRestartPrompt />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    preguntar();
    expect(
      screen.getByRole('alertdialog', { name: 'Compatibilidad HDR en capturas' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reiniciar ahora' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar ahora' }));
    expect(window.gameclip.ui.answerHdrRestart).toHaveBeenCalledWith('q1', 'now');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Esc equivale a «Al próximo arranque»', async () => {
    render(<HdrRestartPrompt />);
    preguntar();
    await userEvent.keyboard('{Escape}');
    expect(window.gameclip.ui.answerHdrRestart).toHaveBeenCalledWith('q1', 'later');
  });
});
