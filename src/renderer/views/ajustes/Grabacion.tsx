import { useEffect, useState } from 'react';
import {
  CUSTOM_GAMES_MAX,
  type AudioAppInfo,
  type DisplayInfo,
  type RecordingMode,
} from '@shared/capture';
import DisplayPicker from '../../components/DisplayPicker';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

interface ModoOpcion {
  valor: RecordingMode;
  titulo: string;
  descripcion: string;
}

const MODOS: ModoOpcion[] = [
  {
    valor: 'manual',
    titulo: 'Captura manual',
    descripcion: 'Usa los hotkeys para capturar clips.',
  },
  {
    valor: 'auto',
    titulo: 'Grabar automáticamente la sesión de juego completa',
    descripcion: 'Al abrir un juego empieza a grabar (los hotkeys siguen activos).',
  },
  {
    valor: 'off',
    titulo: 'Grabación apagada',
    descripcion: 'No se graba nada.',
  },
];

/** Quita la extensión y normaliza a minúsculas, para comparar ejecutables sin duplicar. */
function claveExe(exe: string): string {
  return exe.trim().toLowerCase().replace(/\.exe$/, '');
}

export default function AjustesGrabacion() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [procesos, setProcesos] = useState<AudioAppInfo[]>([]);
  const [procesoSeleccionado, setProcesoSeleccionado] = useState('');
  const [juegoLibre, setJuegoLibre] = useState('');
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [avisoEscritorio, setAvisoEscritorio] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([window.gameclip.capture.getAudioApps(), window.gameclip.capture.getDisplays()]).then(
      ([apps, disp]) => {
        if (!vivo) return;
        setProcesos(apps);
        setDisplays(disp);
      },
    );
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  // Capturado tras el guard: TS no estrecha `settings` dentro de las funciones anidadas.
  const customGames = settings.customGames;
  const limiteAlcanzado = customGames.length >= CUSTOM_GAMES_MAX;
  const agregados = new Set(customGames.map(claveExe));
  const procesosDisponibles = procesos.filter((p) => !agregados.has(claveExe(p.executable)));

  function agregarJuego() {
    const exe = (procesoSeleccionado || juegoLibre).trim();
    if (!exe || limiteAlcanzado) return;
    if (agregados.has(claveExe(exe))) return;
    set('customGames', [...customGames, exe]);
    setProcesoSeleccionado('');
    setJuegoLibre('');
  }

  function quitarJuego(exe: string) {
    set(
      'customGames',
      customGames.filter((g) => g !== exe),
    );
  }

  async function grabarEscritorio(index: number) {
    set('screenMonitorIndex', index);
    await window.gameclip.capture.setSettings({ screenMonitorIndex: index });
    const status = await window.gameclip.capture.startRecording();
    setMostrarModal(false);
    // startRecording es no-op en modo apagado o si ya hay una grabación en curso:
    // sin este aviso el modal cerraría con sensación de éxito falso.
    setAvisoEscritorio(
      status.state === 'recording'
        ? null
        : 'No se pudo iniciar: la grabación está apagada o ya hay una en curso.',
    );
  }

  return (
    <>
      <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
        <fieldset>
          <legend>Modo de grabación</legend>
          {MODOS.map((modo) => (
            <label key={modo.valor} className="settings-radio">
              <input
                type="radio"
                name="recordingMode"
                checked={settings.recordingMode === modo.valor}
                onChange={() => set('recordingMode', modo.valor)}
              />
              <span className="settings-radio-text">
                <strong>{modo.titulo}</strong>
                <span className="settings-radio-desc">{modo.descripcion}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Cambio de juego</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.gameSwitchEnabled}
              onChange={(e) => set('gameSwitchEnabled', e.target.checked)}
            />
            Activar hotkey de cambio de juego
          </label>
          <label>
            Hotkey de cambio de juego
            <input
              type="text"
              value={settings.gameSwitchHotkey}
              disabled={!settings.gameSwitchEnabled}
              onChange={(e) => set('gameSwitchHotkey', e.target.value)}
            />
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.autoGameSwitching}
              onChange={(e) => set('autoGameSwitching', e.target.checked)}
            />
            Al enfocar otro juego ~20 s, cambiar solo
          </label>
        </fieldset>

        <fieldset>
          <legend>Capturas de pantalla</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.screenshotsEnabled}
              onChange={(e) => set('screenshotsEnabled', e.target.checked)}
            />
            Activar capturas de pantalla
          </label>
          <label>
            Hotkey de captura
            <input
              type="text"
              value={settings.screenshotHotkey}
              disabled={!settings.screenshotsEnabled}
              onChange={(e) => set('screenshotHotkey', e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Detección de juegos</legend>
          <p className="settings-hint">¿Un juego que no detectamos? Añádelo aquí.</p>
          <div className="audio-app-add">
            <label>
              Proceso en ejecución
              <select
                value={procesoSeleccionado}
                onChange={(e) => setProcesoSeleccionado(e.target.value)}
                disabled={limiteAlcanzado}
              >
                <option value="">Elegir…</option>
                {procesosDisponibles.map((p) => (
                  <option key={p.executable} value={p.executable}>
                    {p.executable} — {p.windowTitle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Escribe el ejecutable
              <input
                type="text"
                placeholder="MiJuego.exe"
                value={juegoLibre}
                disabled={limiteAlcanzado}
                onChange={(e) => setJuegoLibre(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={agregarJuego}
              disabled={(!procesoSeleccionado && !juegoLibre.trim()) || limiteAlcanzado}
            >
              Añadir juego
            </button>
          </div>
          {limiteAlcanzado && (
            <p className="settings-hint">Máximo {CUSTOM_GAMES_MAX} juegos añadidos a mano.</p>
          )}
          {customGames.length > 0 && (
            <ul className="audio-app-list">
              {customGames.map((exe) => (
                <li key={exe} className="audio-app-row">
                  <span className="audio-app-name">{exe}</span>
                  <button
                    type="button"
                    className="audio-app-trash"
                    aria-label={`Quitar ${exe}`}
                    title={`Quitar ${exe}`}
                    onClick={() => quitarJuego(exe)}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset>
          <legend>Grabación de escritorio</legend>
          <button
            type="button"
            disabled={settings.recordingMode === 'off'}
            onClick={() => setMostrarModal(true)}
          >
            Grabar escritorio…
          </button>
          {settings.recordingMode === 'off' && (
            <p className="settings-hint">La grabación está apagada (modo de grabación).</p>
          )}
          {avisoEscritorio && <p className="settings-warning">{avisoEscritorio}</p>}
          <label>
            Monitor
            <select
              value={settings.screenMonitorIndex}
              onChange={(e) => set('screenMonitorIndex', Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.index} value={d.index}>
                  {d.label}
                  {d.primary ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.desktopAutoSwitchToGame}
              onChange={(e) => set('desktopAutoSwitchToGame', e.target.checked)}
            />
            Cambiar automáticamente a captura de juego al lanzarse un juego
          </label>
        </fieldset>
      </SeccionForm>

      {mostrarModal && (
        <DisplayPicker
          displays={displays}
          selectedIndex={settings.screenMonitorIndex}
          onClose={() => setMostrarModal(false)}
          onConfirm={(index) => void grabarEscritorio(index)}
        />
      )}
    </>
  );
}
