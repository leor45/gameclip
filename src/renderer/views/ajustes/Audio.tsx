import { useEffect, useState, type ReactNode } from 'react';
import {
  AUDIO_APPS_MAX,
  AUDIO_APPS_TRACK_MAX,
  DEFAULT_AUDIO_APPS,
  PTT_HOTKEY_OPTIONS,
  orderedActiveAudioApps,
  resolveMicDevice,
  type AudioAppCapture,
  type AudioAppInfo,
  type AudioDeviceInfo,
} from '@shared/capture';
import { hotkeyReservedByPtt } from '@shared/hotkeys';
import GameIcon from '../../components/GameIcon';
import { BotonQuitar } from './BotonQuitar';
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
  /** Botón de quitar; ausente en las filas fijas. */
  onQuitar?: () => void;
  /**
   * Icono de la fila. «Audio del juego», «Micrófono» y «Audio del escritorio» llevan iconos fijos
   * (mando, micrófono, monitor), nunca el del juego detectado; las apps, el de su ejecutable.
   */
  icono: ReactNode;
}

/** Fila de la mezcla: casilla, icono, nombre, volumen con su %, y quitar opcional. */
function FilaAudio({
  etiqueta,
  checked,
  onCheck,
  volumen,
  onVolumen,
  checkDisabled,
  onQuitar,
  icono,
}: FilaAudioProps) {
  return (
    <li className={checked ? 'settings-mix-row' : 'settings-mix-row is-off'}>
      <label className="settings-mix-main">
        <input
          type="checkbox"
          className="gc-check"
          checked={checked}
          disabled={checkDisabled}
          onChange={(e) => onCheck(e.target.checked)}
        />
        {icono}
        <span className="settings-mix-name">{etiqueta}</span>
      </label>
      <label className="settings-mix-volume">
        <span className="settings-sr">
          Volumen de {etiqueta} ({volumen} %)
        </span>
        <input
          type="range"
          className="gc-range"
          min={0}
          max={100}
          value={volumen}
          disabled={!checked}
          onChange={(e) => onVolumen(Number(e.target.value))}
        />
      </label>
      <span className="settings-mix-val" aria-hidden="true">
        {volumen} %
      </span>
      {onQuitar ? (
        <BotonQuitar nombre={etiqueta} onClick={onQuitar} />
      ) : (
        <span className="settings-remove-slot" aria-hidden="true" />
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
  // El micro guardado puede ya no existir (auricular desconectado): sin esto el <select> pintaba
  // «Por defecto del sistema» mientras el ajuste seguía apuntando a un dispositivo fantasma y la
  // pista de micrófono salía muda en todos los clips.
  const micDesconectado = resolveMicDevice(settings.micDeviceId, dispositivos).missing;
  // Cada app activa ocupa una pista propia (T4+); solo hay 3 pistas de app.
  const appsConAudio = orderedActiveAudioApps(audioApps).length;
  const topeAudioAlcanzado = appsConAudio >= AUDIO_APPS_TRACK_MAX;
  // La tecla del PTT no puede ser también un atajo: cada vez que hablaras se dispararía la acción.
  // Un choque ya guardado (versiones anteriores) bloquea el guardado mientras el PTT esté activo.
  const pttOcupadaPor = hotkeyReservedByPtt(settings);
  const bloqueo =
    settings.pttEnabled && pttOcupadaPor
      ? `La tecla del push to talk (${settings.pttHotkey}) es también el atajo de «${pttOcupadaPor.label}». Elige otra tecla o cambia el atajo en Atajos.`
      : null;

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
    <SeccionForm
      titulo="Audio"
      saving={saving}
      saved={saved}
      onGuardar={() => void save()}
      bloqueo={bloqueo}
    >
      <fieldset>
        <legend className="gc-label">Micrófono</legend>
        <div className="settings-fields">
          <label>
            Dispositivo
            <select
              className="gc-field"
              value={settings.micDeviceId}
              onChange={(e) => set('micDeviceId', e.target.value)}
              disabled={!settings.micEnabled}
            >
              <option value="">Por defecto del sistema</option>
              {micDesconectado && (
                <option value={settings.micDeviceId} disabled>
                  Micrófono guardado (no conectado)
                </option>
              )}
              {dispositivos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tecla de push to talk
            <select
              className="gc-field"
              value={settings.pttHotkey}
              disabled={!settings.pttEnabled || !pttDisponible}
              onChange={(e) => set('pttHotkey', e.target.value)}
            >
              {PTT_HOTKEY_OPTIONS.map((k) => {
                const ocupada = hotkeyReservedByPtt(settings, k);
                return (
                  <option key={k} value={k} disabled={ocupada !== null}>
                    {ocupada ? `${k} — atajo de «${ocupada.label}»` : k}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        {micDesconectado && (
          <p className="settings-warning" data-testid="aviso-mic-desconectado">
            El micrófono guardado ya no está conectado: mientras tanto se graba con el
            predeterminado del sistema. Elige otro dispositivo y guarda para quitar este aviso.
          </p>
        )}
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.pttEnabled}
            disabled={!pttDisponible}
            onChange={(e) => set('pttEnabled', e.target.checked)}
          />
          Push to talk (capturar el micrófono solo con la tecla pulsada)
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
            className="gc-switch"
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
        <legend className="gc-label">Audio a grabar</legend>
        <p className="settings-hint">
          Solo aplica a las capturas de juego. Grabando el escritorio siempre se captura todo el
          audio del PC (sus pistas se eligen en Grabación → Grabación de escritorio).
        </p>
        <div className="settings-seg" role="radiogroup" aria-label="Audio a grabar">
          <label className="settings-seg-option">
            <input
              type="radio"
              className="settings-card-input"
              name="audioMode"
              checked={settings.audioMode === 'desktop'}
              onChange={() => set('audioMode', 'desktop')}
            />
            Todo el escritorio
          </label>
          <label className="settings-seg-option">
            <input
              type="radio"
              className="settings-card-input"
              name="audioMode"
              checked={settings.audioMode === 'apps'}
              onChange={() => set('audioMode', 'apps')}
            />
            Apps específicas
          </label>
        </div>

        {settings.audioMode === 'desktop' && (
          <ul className="settings-list">
            <FilaAudio
              etiqueta="Audio del escritorio"
              icono={<GameIcon fixed="desktop" size="md" />}
              checked
              // Siempre se graba y la casilla no guarda nada: se muestra marcada y no editable.
              checkDisabled
              onCheck={() => undefined}
              volumen={settings.desktopAudioVolume}
              onVolumen={(v) => set('desktopAudioVolume', v)}
            />
            <FilaAudio
              etiqueta="Micrófono"
              icono={<GameIcon fixed="mic" size="md" />}
              checked={settings.micEnabled}
              onCheck={(v) => set('micEnabled', v)}
              volumen={settings.micVolume}
              onVolumen={(v) => set('micVolume', v)}
            />
          </ul>
        )}

        {settings.audioMode === 'apps' && (
          <>
            <ul className="settings-list">
              <FilaAudio
                etiqueta="Audio del juego"
                icono={<GameIcon fixed="pad" size="md" />}
                checked={settings.gameAudioEnabled}
                onCheck={(v) => set('gameAudioEnabled', v)}
                volumen={settings.gameAudioVolume}
                onVolumen={(v) => set('gameAudioVolume', v)}
              />
              <FilaAudio
                etiqueta="Micrófono"
                icono={<GameIcon fixed="mic" size="md" />}
                checked={settings.micEnabled}
                onCheck={(v) => set('micEnabled', v)}
                volumen={settings.micVolume}
                onVolumen={(v) => set('micVolume', v)}
              />
              {appsFijas.map((app) => (
                <FilaAudio
                  key={app.executable}
                  etiqueta={app.executable}
                  icono={<GameIcon exe={app.executable} size="md" />}
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
                  icono={<GameIcon exe={app.executable} size="md" />}
                  checked={app.enabled}
                  checkDisabled={!app.enabled && topeAudioAlcanzado}
                  onCheck={(v) => upsertApp({ ...app, enabled: v })}
                  volumen={app.volume}
                  onVolumen={(v) => upsertApp({ ...app, volume: v })}
                  onQuitar={() => quitarApp(app.executable)}
                />
              ))}
            </ul>

            <div className="settings-addrow is-one">
              <label>
                Añadir app
                <select
                  className="gc-field"
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
                className="gc-btn"
                onClick={agregarApp}
                disabled={!appSeleccionada || limiteAlcanzado}
              >
                Añadir
              </button>
            </div>
            {limiteAlcanzado && <p className="settings-hint">Máximo {AUDIO_APPS_MAX} apps.</p>}
            {topeAudioAlcanzado && (
              <p className="settings-hint">
                Máximo {AUDIO_APPS_TRACK_MAX} apps con audio a la vez (una pista por app). Desmarcá
                una para activar otra.
              </p>
            )}
            <p className="settings-hint">
              Desmarcar una app pausa su captura sin quitarla de la lista.
            </p>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend className="gc-label">Pistas</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
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

      <fieldset>
        <legend className="gc-label">Mando</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.hapticMuteEnabled}
            onChange={(e) => set('hapticMuteEnabled', e.target.checked)}
          />
          Silenciar el háptico del mando en la grabación
        </label>
        <p className="settings-hint">
          El DualSense transporta la vibración háptica como audio, y en modo Apps específicas se
          cuela en el clip. Con esto, GameClip silencia esa señal en cada grabación sin tocar el
          audio del juego ni la vibración del mando.
        </p>
        <p className="settings-hint">
          Detecta los mandos <strong>DualSense</strong> automáticamente —incluso si conectas otro en
          plena partida—; solo tienes que activarlo.
        </p>
      </fieldset>
    </SeccionForm>
  );
}
