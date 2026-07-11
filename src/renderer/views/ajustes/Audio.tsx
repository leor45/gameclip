import { useEffect, useState } from 'react';
import { AUDIO_APPS_MAX, type AudioAppInfo, type AudioDeviceInfo } from '@shared/capture';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesAudio() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [dispositivos, setDispositivos] = useState<AudioDeviceInfo[]>([]);
  const [appsDisponibles, setAppsDisponibles] = useState<AudioAppInfo[]>([]);
  const [appSeleccionada, setAppSeleccionada] = useState('');

  useEffect(() => {
    let vivo = true;
    Promise.all([
      window.gameclip.capture.getAudioDevices(),
      window.gameclip.capture.getAudioApps(),
    ]).then(([devices, apps]) => {
      if (!vivo) return;
      setDispositivos(devices);
      setAppsDisponibles(apps);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  // Capturada tras el guard: TS no estrecha `settings` dentro de las funciones anidadas.
  const audioApps = settings.audioApps;
  const yaAgregadas = new Set(audioApps.map((a) => a.executable.toLowerCase()));
  const disponiblesParaAgregar = appsDisponibles.filter(
    (a) => !yaAgregadas.has(a.executable.toLowerCase()),
  );
  const limiteAlcanzado = audioApps.length >= AUDIO_APPS_MAX;

  function agregarApp() {
    if (!appSeleccionada || limiteAlcanzado) return;
    const app = appsDisponibles.find((a) => a.executable === appSeleccionada);
    if (!app) return;
    set('audioApps', [...audioApps, { executable: app.executable, volume: 100 }]);
    setAppSeleccionada('');
  }

  function quitarApp(executable: string) {
    set(
      'audioApps',
      audioApps.filter((a) => a.executable !== executable),
    );
  }

  function cambiarVolumenApp(executable: string, volume: number) {
    set(
      'audioApps',
      audioApps.map((a) => (a.executable === executable ? { ...a, volume } : a)),
    );
  }

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Micrófono</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.micEnabled}
            onChange={(e) => set('micEnabled', e.target.checked)}
          />
          Capturar micrófono
        </label>
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
        <label>
          Volumen del micrófono ({settings.micVolume} %)
          <input
            type="range"
            min={0}
            max={100}
            value={settings.micVolume}
            disabled={!settings.micEnabled}
            onChange={(e) => set('micVolume', Number(e.target.value))}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Modo de audio</legend>
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
          <label>
            Volumen del escritorio ({settings.desktopAudioVolume} %)
            <input
              type="range"
              min={0}
              max={100}
              value={settings.desktopAudioVolume}
              onChange={(e) => set('desktopAudioVolume', Number(e.target.value))}
            />
          </label>
        )}

        {settings.audioMode === 'apps' && (
          <>
            <div className="audio-app-row">
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={settings.gameAudioEnabled}
                  onChange={(e) => set('gameAudioEnabled', e.target.checked)}
                />
                Audio del juego
              </label>
              <label>
                Volumen del juego ({settings.gameAudioVolume} %)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.gameAudioVolume}
                  disabled={!settings.gameAudioEnabled}
                  onChange={(e) => set('gameAudioVolume', Number(e.target.value))}
                />
              </label>
            </div>

            <ul className="audio-app-list">
              {settings.audioApps.map((app) => (
                <li key={app.executable} className="audio-app-row">
                  <span className="audio-app-name">{app.executable}</span>
                  <label>
                    Volumen de {app.executable} ({app.volume} %)
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={app.volume}
                      onChange={(e) => cambiarVolumenApp(app.executable, Number(e.target.value))}
                    />
                  </label>
                  <button type="button" onClick={() => quitarApp(app.executable)}>
                    Quitar
                  </button>
                </li>
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
            {limiteAlcanzado && (
              <p className="settings-hint">Máximo {AUDIO_APPS_MAX} apps.</p>
            )}
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
