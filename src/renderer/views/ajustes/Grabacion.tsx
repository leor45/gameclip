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
import GameIcon from '../../components/GameIcon';
import { BotonQuitar } from './BotonQuitar';
import { HotkeyInfo } from './HotkeyInfo';
import { NoSonJuegos } from './NoSonJuegos';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';
import Select from '../../components/Select';

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

  /**
   * Lo que se ve en el listado: el nombre del juego y, debajo, su ejecutable para no perderlo. Si el
   * nombre es el propio ejecutable, solo se ve el ejecutable.
   */
  function etiqueta(juego: CustomGame): { nombre: string; exe: string | null } {
    const nombre = resolveGameName(juego.executable, { customGames, index });
    const exe = juego.executable.trim().replace(/\.exe$/i, '');
    return nombre.toLowerCase() === exe.toLowerCase()
      ? { nombre: juego.executable, exe: null }
      : { nombre, exe: `${exe}.exe` };
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
      <SeccionForm titulo="Grabación" saving={saving} saved={saved} onGuardar={() => void save()}>
        <fieldset>
          <legend className="gc-label">Modo de grabación</legend>
          <div className="settings-cards">
            {MODOS.map((modo) => (
              <label key={modo.valor} className="settings-card">
                <input
                  type="radio"
                  className="settings-card-input"
                  name="recordingMode"
                  checked={settings.recordingMode === modo.valor}
                  onChange={() => set('recordingMode', modo.valor)}
                />
                <strong>{modo.titulo}</strong>
                <span className="settings-card-desc">{modo.descripcion}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="gc-label">Cambio de juego</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              className="gc-switch"
              checked={settings.gameSwitchEnabled}
              onChange={(e) => set('gameSwitchEnabled', e.target.checked)}
            />
            Activar hotkey de cambio de juego
          </label>
          <HotkeyInfo label="Atajo de cambio de juego" accel={settings.gameSwitchHotkey} />
          <label className="settings-check">
            <input
              type="checkbox"
              className="gc-switch"
              checked={settings.autoGameSwitching}
              onChange={(e) => set('autoGameSwitching', e.target.checked)}
            />
            Al enfocar otro juego ~20 s, cambiar solo
          </label>
        </fieldset>

        <fieldset>
          <legend className="gc-label">Capturas de pantalla</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              className="gc-switch"
              checked={settings.screenshotsEnabled}
              onChange={(e) => set('screenshotsEnabled', e.target.checked)}
            />
            Activar capturas de pantalla
          </label>
          <HotkeyInfo label="Atajo de captura" accel={settings.screenshotHotkey} />
          <div className="settings-fields">
            <label>
              Monitor de las capturas
              {/* A propósito NO depende de la grabación de escritorio: las capturas pueden estar
                  activas con la grabación apagada, y son ajustes distintos. */}
              <Select
                value={settings.screenshotMonitorIndex}
                disabled={!settings.screenshotsEnabled}
                onChange={(v) => set('screenshotMonitorIndex', v)}
                options={[
                  { value: SCREENSHOT_MONITOR_PRIMARY, label: 'Seguir al monitor principal' },
                  ...displays.map((d) => ({
                    value: d.index,
                    label: `${d.label}${d.primary ? ' (principal)' : ''}`,
                  })),
                ]}
              />
            </label>
          </div>
          <p className="settings-hint">
            La captura es del monitor completo. Es un ajuste aparte del monitor de grabación de
            escritorio.
          </p>
        </fieldset>

        <fieldset>
          <legend className="gc-label">Juegos añadidos a mano</legend>
          <p className="settings-hint">
            Los juegos instalados (Steam, Epic…) se detectan solos:{' '}
            {new Set(Object.values(index)).size} juegos reconocidos. ¿Falta alguno? Añádelo aquí.
          </p>
          <div className="settings-addrow">
            <label>
              Proceso en ejecución
              <Select
                value={procesoSeleccionado}
                onChange={setProcesoSeleccionado}
                disabled={limiteAlcanzado}
                placeholder="Elegir un proceso…"
                options={procesosDisponibles.map((p) => ({
                  value: p.executable,
                  label: p.executable,
                  detail: p.windowTitle,
                  icon: <GameIcon exe={p.executable} size="md" />,
                }))}
              />
            </label>
            <label>
              Escribe el ejecutable
              <input
                type="text"
                className="gc-field"
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
                className="gc-field"
                placeholder="El del ejecutable"
                value={nombreNuevo}
                disabled={limiteAlcanzado || !exeElegido}
                onChange={(e) => setNombreNuevo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="gc-btn"
              onClick={agregarJuego}
              disabled={!exeElegido || limiteAlcanzado}
            >
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
            <ul className="settings-list">
              {customGames.map((juego) => {
                const { nombre, exe } = etiqueta(juego);
                return (
                  <li key={juego.executable} className="settings-game-row">
                    <GameIcon exe={juego.executable} size="md" />
                    <span className="settings-game-name">
                      <b>{nombre}</b>
                      {exe && <small>{exe}</small>}
                    </span>
                    <input
                      type="text"
                      className="gc-field settings-game-rename"
                      placeholder="Renombrar…"
                      aria-label={`Nombre de ${juego.executable}`}
                      defaultValue={juego.name ?? ''}
                      onBlur={(e) => renombrarJuego(juego.executable, e.target.value)}
                      onKeyDown={(e) => {
                        // Enter confirma el nombre, no envía el formulario: el envío llegaba antes
                        // que el blur y se guardaba sin el nombre nuevo.
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        renombrarJuego(juego.executable, e.currentTarget.value);
                      }}
                    />
                    <BotonQuitar
                      nombre={juego.executable}
                      onClick={() => quitarJuego(juego.executable)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="settings-row">
            <button
              type="button"
              className="gc-btn ghost sm"
              onClick={() => void reescanear()}
              disabled={rescaneando}
            >
              {rescaneando ? 'Escaneando…' : 'Volver a escanear los juegos instalados'}
            </button>
          </div>
        </fieldset>

        <NoSonJuegos />

        <fieldset>
          <legend className="gc-label">Grabación de escritorio</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              className="gc-switch"
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
          <div className="settings-row">
            <button
              type="button"
              className="gc-btn ghost sm"
              disabled={settings.recordingMode === 'off' || !escritorio}
              onClick={() => setMostrarModal(true)}
            >
              Grabar escritorio…
            </button>
          </div>
          {settings.recordingMode === 'off' && (
            <p className="settings-hint">La grabación está apagada (modo de grabación).</p>
          )}
          {avisoEscritorio && <p className="settings-warning is-error">{avisoEscritorio}</p>}
          <div className="settings-fields">
            <label>
              Monitor
              <Select
                value={settings.screenMonitorIndex}
                disabled={!escritorio}
                onChange={(v) => set('screenMonitorIndex', v)}
                options={displays.map((d) => ({
                  value: d.index,
                  label: `${d.label}${d.primary ? ' (principal)' : ''}`,
                }))}
              />
            </label>
            <label>
              Audio del clip de escritorio
              <Select<DesktopAudioTracks>
                value={settings.desktopAudioTracks}
                disabled={!escritorio}
                onChange={(v) => set('desktopAudioTracks', v)}
                options={[
                  { value: 'mixed', label: 'Todo junto en una pista' },
                  { value: 'separate', label: 'PC y micrófono en pistas separadas' },
                ]}
              />
            </label>
          </div>
          <label className="settings-check">
            <input
              type="checkbox"
              className="gc-switch"
              checked={settings.desktopAutoSwitchToGame}
              disabled={!escritorio}
              onChange={(e) => set('desktopAutoSwitchToGame', e.target.checked)}
            />
            Cambiar automáticamente a captura de juego al lanzarse un juego
          </label>
          <p className="settings-hint">
            Sin esto, se sigue grabando el escritorio aunque haya un juego corriendo.
          </p>
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
