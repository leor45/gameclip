import { useEffect, useState } from 'react';
import {
  AUDIO_APPS_MAX,
  AUDIO_APPS_TRACK_MAX,
  DEFAULT_AUDIO_APPS,
  PTT_HOTKEY_OPTIONS,
  orderedActiveAudioApps,
  type AudioAppCapture,
  type AudioAppInfo,
  type AudioDeviceInfo,
} from '@shared/capture';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

interface FilaAudioProps {
  etiqueta: string;
  checked: boolean;
  onCheck: (value: boolean) => void;
  volumen: number;
  onVolumen: (value: number) => void;
  /** Deshabilita el checkbox (p. ej. al alcanzar el tope de apps con audio). */
  checkDisabled?: boolean;
  /** Botón de basurero rojo; ausente en las filas fijas. */
  onQuitar?: () => void;
}

/** Fila de la lista de audio: checkbox a la izquierda, slider y basurero opcional. */
function FilaAudio({
  etiqueta,
  checked,
  onCheck,
  volumen,
  onVolumen,
  checkDisabled,
  onQuitar,
}: FilaAudioProps) {
  return (
    <li className="audio-app-row">
      <label className="settings-check audio-app-name">
        <input
          type="checkbox"
          checked={checked}
          disabled={checkDisabled}
          onChange={(e) => onCheck(e.target.checked)}
        />
        {etiqueta}
      </label>
      <label className="audio-app-volume">
        Volumen de {etiqueta} ({volumen} %)
        <input
          type="range"
          min={0}
          max={100}
          value={volumen}
          disabled={!checked}
          onChange={(e) => onVolumen(Number(e.target.value))}
        />
      </label>
      {onQuitar && (
        <button
          type="button"
          className="audio-app-trash"
          aria-label={`Quitar ${etiqueta}`}
          title={`Quitar ${etiqueta}`}
          onClick={onQuitar}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
            />
          </svg>
        </button>
      )}
    </li>
  );
}

export default function AjustesAudio() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [dispositivos, setDispositivos] = useState<AudioDeviceInfo[]>([]);
  const [appsDisponibles, setAppsDisponibles] = useState<AudioAppInfo[]>([]);
  const [appSeleccionada, setAppSeleccionada] = useState('');
  const [pttDisponible, setPttDisponible] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      window.gameclip.capture.getAudioDevices(),
      window.gameclip.capture.getAudioApps(),
      window.gameclip.capture.getPttAvailable().catch(() => false),
    ]).then(([devices, apps, ptt]) => {
      if (!vivo) return;
      setDispositivos(devices);
      setAppsDisponibles(apps);
      setPttDisponible(ptt);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  // Capturada tras el guard: TS no estrecha `settings` dentro de las funciones anidadas.
  const audioApps = settings.audioApps;
  const esDefault = (exe: string) =>
    DEFAULT_AUDIO_APPS.some((d) => d.toLowerCase() === exe.toLowerCase());
  const entradaDe = (exe: string): AudioAppCapture | undefined =>
    audioApps.find((a) => a.executable.toLowerCase() === exe.toLowerCase());
  // Las fijas (Discord) siempre se muestran; sin entrada guardada = desactivada.
  const appsFijas = DEFAULT_AUDIO_APPS.map(
    (exe) => entradaDe(exe) ?? { executable: exe, volume: 100, enabled: false },
  );
  const appsUsuario = audioApps.filter((a) => !esDefault(a.executable));

  const yaAgregadas = new Set(audioApps.map((a) => a.executable.toLowerCase()));
  const disponiblesParaAgregar = appsDisponibles.filter(
    (a) => !yaAgregadas.has(a.executable.toLowerCase()) && !esDefault(a.executable),
  );
  const limiteAlcanzado = audioApps.length >= AUDIO_APPS_MAX;
  // Cada app activa ocupa una pista propia (T4+); solo hay 3 pistas de app.
  const appsConAudio = orderedActiveAudioApps(audioApps).length;
  const topeAudioAlcanzado = appsConAudio >= AUDIO_APPS_TRACK_MAX;

  /** Inserta o reemplaza la entrada de un ejecutable (las fijas se materializan al tocarlas). */
  function upsertApp(entrada: AudioAppCapture) {
    const resto = audioApps.filter(
      (a) => a.executable.toLowerCase() !== entrada.executable.toLowerCase(),
    );
    set('audioApps', [...resto, entrada]);
  }

  function agregarApp() {
    if (!appSeleccionada || limiteAlcanzado) return;
    const app = appsDisponibles.find((a) => a.executable === appSeleccionada);
    if (!app) return;
    set('audioApps', [...audioApps, { executable: app.executable, volume: 100, enabled: true }]);
    setAppSeleccionada('');
  }

  function quitarApp(executable: string) {
    set(
      'audioApps',
      audioApps.filter((a) => a.executable !== executable),
    );
  }

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Micrófono</legend>
        <label>
          Dispositivo
          <select
            value={settings.micDeviceId}
            onChange={(e) => set('micDeviceId', e.target.value)}
            disabled={!settings.micEnabled}
          >
            <option value="">Por defecto del sistema</option>
            {dispositivos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.pttEnabled}
            disabled={!pttDisponible}
            onChange={(e) => set('pttEnabled', e.target.checked)}
          />
          Push to talk (capturar el micrófono solo con la tecla pulsada)
        </label>
        <label>
          Tecla de push to talk
          <select
            value={settings.pttHotkey}
            disabled={!settings.pttEnabled || !pttDisponible}
            onChange={(e) => set('pttHotkey', e.target.value)}
          >
            {PTT_HOTKEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {!pttDisponible && (
          <p className="settings-warning">
            El hook global de teclado no está disponible en este equipo: push to talk queda
            desactivado.
          </p>
        )}
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.noiseSuppressionEnabled}
            onChange={(e) => set('noiseSuppressionEnabled', e.target.checked)}
          />
          Supresión de ruido (RNNoise)
        </label>
        <p className="settings-hint">
          Reduce el ruido de fondo del micrófono con el filtro RNNoise de libobs.
        </p>
      </fieldset>

      <fieldset>
        <legend>Audio a grabar</legend>
        <label className="settings-check">
          <input
            type="radio"
            name="audioMode"
            checked={settings.audioMode === 'desktop'}
            onChange={() => set('audioMode', 'desktop')}
          />
          Todo el escritorio
        </label>
        <label className="settings-check">
          <input
            type="radio"
            name="audioMode"
            checked={settings.audioMode === 'apps'}
            onChange={() => set('audioMode', 'apps')}
          />
          Apps específicas
        </label>

        {settings.audioMode === 'desktop' && (
          <ul className="audio-app-list">
            <FilaAudio
              etiqueta="Audio del escritorio"
              checked
              onCheck={() => undefined}
              volumen={settings.desktopAudioVolume}
              onVolumen={(v) => set('desktopAudioVolume', v)}
            />
            <FilaAudio
              etiqueta="Micrófono"
              checked={settings.micEnabled}
              onCheck={(v) => set('micEnabled', v)}
              volumen={settings.micVolume}
              onVolumen={(v) => set('micVolume', v)}
            />
          </ul>
        )}

        {settings.audioMode === 'apps' && (
          <>
            <ul className="audio-app-list">
              <FilaAudio
                etiqueta="Audio del juego"
                checked={settings.gameAudioEnabled}
                onCheck={(v) => set('gameAudioEnabled', v)}
                volumen={settings.gameAudioVolume}
                onVolumen={(v) => set('gameAudioVolume', v)}
              />
              <FilaAudio
                etiqueta="Micrófono"
                checked={settings.micEnabled}
                onCheck={(v) => set('micEnabled', v)}
                volumen={settings.micVolume}
                onVolumen={(v) => set('micVolume', v)}
              />
              {appsFijas.map((app) => (
                <FilaAudio
                  key={app.executable}
                  etiqueta={app.executable}
                  checked={app.enabled}
                  checkDisabled={!app.enabled && topeAudioAlcanzado}
                  onCheck={(v) => upsertApp({ ...app, enabled: v })}
                  volumen={app.volume}
                  onVolumen={(v) => upsertApp({ ...app, volume: v })}
                />
              ))}
              {appsUsuario.map((app) => (
                <FilaAudio
                  key={app.executable}
                  etiqueta={app.executable}
                  checked={app.enabled}
                  checkDisabled={!app.enabled && topeAudioAlcanzado}
                  onCheck={(v) => upsertApp({ ...app, enabled: v })}
                  volumen={app.volume}
                  onVolumen={(v) => upsertApp({ ...app, volume: v })}
                  onQuitar={() => quitarApp(app.executable)}
                />
              ))}
            </ul>

            <div className="audio-app-add">
              <label>
                Añadir app
                <select
                  value={appSeleccionada}
                  onChange={(e) => setAppSeleccionada(e.target.value)}
                  disabled={limiteAlcanzado}
                >
                  <option value="">Elegir…</option>
                  {disponiblesParaAgregar.map((a) => (
                    <option key={a.executable} value={a.executable}>
                      {a.executable} — {a.windowTitle}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={agregarApp}
                disabled={!appSeleccionada || limiteAlcanzado}
              >
                Añadir
              </button>
            </div>
            {limiteAlcanzado && <p className="settings-hint">Máximo {AUDIO_APPS_MAX} apps.</p>}
            {topeAudioAlcanzado && (
              <p className="settings-hint">
                Máximo {AUDIO_APPS_TRACK_MAX} apps con audio a la vez (una pista por app).
                Desmarcá una para activar otra.
              </p>
            )}
            <p className="settings-hint">
              Desmarcar una app pausa su captura sin quitarla de la lista.
            </p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Pistas</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.separateAudioTracks}
            onChange={(e) => set('separateAudioTracks', e.target.checked)}
          />
          Pistas de audio separadas
        </label>
        <p className="settings-hint">
          Guarda cada fuente de audio en una pista separada del MP4 para mutear por separado al
          editar.
        </p>
      </fieldset>
    </SeccionForm>
  );
}
