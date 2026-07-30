import { useEffect, useState } from 'react';
import {
  CUSTOM_GAMES_MAX,
  SCREENSHOT_MONITOR_PRIMARY,
  type AudioAppInfo,
  type DesktopAudioTracks,
  type DisplayInfo,
  type RecordingMode,
} from '@shared/capture';
import { exeKey, resolveGameName, type CustomGame, type GameIndex } from '@shared/games';
import DisplayPicker from '../../components/DisplayPicker';
import { HotkeyInfo } from './HotkeyInfo';
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

export default function AjustesGrabacion() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [procesos, setProcesos] = useState<AudioAppInfo[]>([]);
  const [procesoSeleccionado, setProcesoSeleccionado] = useState('');
  const [juegoLibre, setJuegoLibre] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [index, setIndex] = useState<GameIndex>({});
  const [rescaneando, setRescaneando] = useState(false);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [avisoEscritorio, setAvisoEscritorio] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      window.gameclip.capture.getAudioApps(),
      window.gameclip.capture.getDisplays(),
      window.gameclip.games.getIndex(),
    ]).then(([apps, disp, idx]) => {
      if (!vivo) return;
      setProcesos(apps);
      setDisplays(disp);
      setIndex(idx);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // El ejecutable elegido manda: al cambiarlo, se propone el nombre que la app deduzca (del índice
  // de launchers, de la lista curada o de los metadatos del .exe). El owner puede pisarlo o vaciarlo.
  const exeElegido = (procesoSeleccionado || juegoLibre).trim();
  useEffect(() => {
    if (!exeElegido) return setNombreNuevo('');
    let vivo = true;
    void window.gameclip.games.suggestName(exeElegido).then((nombre) => {
      if (vivo) setNombreNuevo(nombre ?? '');
    });
    return () => {
      vivo = false;
    };
  }, [exeElegido]);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  // Capturado tras el guard: TS no estrecha `settings` dentro de las funciones anidadas.
  const customGames = settings.customGames;
  // Interruptor maestro de la sección: sin grabación de escritorio, sus opciones no pintan nada.
  const escritorio = settings.desktopRecordingEnabled;
  const limiteAlcanzado = customGames.length >= CUSTOM_GAMES_MAX;
  const agregados = new Set(customGames.map((g) => exeKey(g.executable)));
  const procesosDisponibles = procesos.filter((p) => !agregados.has(exeKey(p.executable)));

  function agregarJuego() {
    const executable = exeElegido;
    if (!executable || limiteAlcanzado) return;
    if (agregados.has(exeKey(executable))) return;
    const name = nombreNuevo.trim();
    set('customGames', [...customGames, name ? { executable, name } : { executable }]);
    setProcesoSeleccionado('');
    setJuegoLibre('');
    setNombreNuevo('');
  }

  function renombrarJuego(executable: string, name: string) {
    const limpio = name.trim();
    set(
      'customGames',
      customGames.map((g) =>
        g.executable === executable
          ? limpio
            ? { executable, name: limpio }
            : { executable } // vaciar el nombre = volver al que deduzca la app
          : g,
      ),
    );
  }

  function quitarJuego(executable: string) {
    set(
      'customGames',
      customGames.filter((g) => g.executable !== executable),
    );
  }

  async function reescanear() {
    setRescaneando(true);
    try {
      setIndex(await window.gameclip.games.rescan());
    } finally {
      setRescaneando(false);
    }
  }

  /** Lo que se ve en el listado: el nombre del juego, con su ejecutable al lado para no perderlo. */
  function etiqueta(juego: CustomGame): string {
    const nombre = resolveGameName(juego.executable, { customGames, index });
    const exe = juego.executable.trim().replace(/\.exe$/i, '');
    return nombre.toLowerCase() === exe.toLowerCase() ? juego.executable : `${nombre} (${exe}.exe)`;
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
          <HotkeyInfo label="Atajo de cambio de juego" accel={settings.gameSwitchHotkey} />
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
          <HotkeyInfo label="Atajo de captura" accel={settings.screenshotHotkey} />
          <label>
            Monitor de las capturas
            {/* A propósito NO depende de la grabación de escritorio: las capturas pueden estar
                activas con la grabación apagada, y son ajustes distintos. */}
            <select
              value={settings.screenshotMonitorIndex}
              disabled={!settings.screenshotsEnabled}
              onChange={(e) => set('screenshotMonitorIndex', Number(e.target.value))}
            >
              <option value={SCREENSHOT_MONITOR_PRIMARY}>Seguir al monitor principal</option>
              {displays.map((d) => (
                <option key={d.index} value={d.index}>
                  {d.label}
                  {d.primary ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">
            La captura es del monitor completo. Es un ajuste aparte del monitor de grabación de
            escritorio.
          </p>
        </fieldset>

        <fieldset>
          <legend>Detección de juegos</legend>
          <p className="settings-hint">
            Los juegos instalados (Steam, Epic…) se detectan solos:{' '}
            {new Set(Object.values(index)).size} juegos reconocidos. ¿Falta alguno? Añádelo aquí.
          </p>
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
            <label>
              Nombre (opcional)
              <input
                type="text"
                placeholder="El del ejecutable"
                value={nombreNuevo}
                disabled={limiteAlcanzado || !exeElegido}
                onChange={(e) => setNombreNuevo(e.target.value)}
              />
            </label>
            <button type="button" onClick={agregarJuego} disabled={!exeElegido || limiteAlcanzado}>
              Añadir juego
            </button>
          </div>
          <p className="settings-hint">
            El nombre es solo para verlo: por dentro el juego sigue siendo su ejecutable.
          </p>
          {limiteAlcanzado && (
            <p className="settings-hint">Máximo {CUSTOM_GAMES_MAX} juegos añadidos a mano.</p>
          )}
          {customGames.length > 0 && (
            <ul className="audio-app-list">
              {customGames.map((juego) => (
                <li key={juego.executable} className="audio-app-row">
                  <span className="audio-app-name">{etiqueta(juego)}</span>
                  <input
                    type="text"
                    className="audio-app-rename"
                    placeholder="Renombrar…"
                    aria-label={`Nombre de ${juego.executable}`}
                    defaultValue={juego.name ?? ''}
                    onBlur={(e) => renombrarJuego(juego.executable, e.target.value)}
                  />
                  <button
                    type="button"
                    className="audio-app-trash"
                    aria-label={`Quitar ${juego.executable}`}
                    title={`Quitar ${juego.executable}`}
                    onClick={() => quitarJuego(juego.executable)}
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
          <button type="button" onClick={() => void reescanear()} disabled={rescaneando}>
            {rescaneando ? 'Escaneando…' : 'Volver a escanear los juegos instalados'}
          </button>
        </fieldset>

        <fieldset>
          <legend>Grabación de escritorio</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.desktopRecordingEnabled}
              onChange={(e) => set('desktopRecordingEnabled', e.target.checked)}
            />
            Grabar el escritorio cuando no hay ningún juego
          </label>
          {!escritorio && (
            <p className="settings-hint">
              Solo se capturan juegos: sin un juego detectado no se graba nada.
            </p>
          )}
          <button
            type="button"
            disabled={settings.recordingMode === 'off' || !escritorio}
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
              disabled={!escritorio}
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
              disabled={!escritorio}
              onChange={(e) => set('desktopAutoSwitchToGame', e.target.checked)}
            />
            Cambiar automáticamente a captura de juego al lanzarse un juego
          </label>
          <p className="settings-hint">
            Sin esto, se sigue grabando el escritorio aunque haya un juego corriendo.
          </p>
          <label>
            Audio del clip de escritorio
            <select
              value={settings.desktopAudioTracks}
              disabled={!escritorio}
              onChange={(e) => set('desktopAudioTracks', e.target.value as DesktopAudioTracks)}
            >
              <option value="mixed">Todo junto en una pista</option>
              <option value="separate">PC y micrófono en pistas separadas</option>
            </select>
          </label>
          <p className="settings-hint">
            Grabando el escritorio se captura todo el audio del PC. El audio por aplicación y las
            pistas por rol (sección Audio) solo se aplican a las capturas de juego.
          </p>
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
