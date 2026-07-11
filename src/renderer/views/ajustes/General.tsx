import { REPLAY_SECONDS_MAX, REPLAY_SECONDS_MIN } from '@shared/capture';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesGeneral() {
  const { settings, set, save, saving, saved } = useCaptureSettings();

  if (!settings) return <p className="placeholder">Cargando…</p>;

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Clip retroactivo</legend>
        <label>
          Duración del buffer (segundos)
          <input
            type="number"
            min={REPLAY_SECONDS_MIN}
            max={REPLAY_SECONDS_MAX}
            value={settings.replaySeconds}
            onChange={(e) => set('replaySeconds', Number(e.target.value))}
          />
        </label>
        <label>
          Hotkey para guardar clip
          <input
            type="text"
            value={settings.replayHotkey}
            onChange={(e) => set('replayHotkey', e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Comportamiento</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.bufferMode === 'game'}
            onChange={(e) => set('bufferMode', e.target.checked ? 'game' : 'always')}
          />
          Iniciar el buffer solo al detectar un juego
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.overlayEnabled}
            onChange={(e) => set('overlayEnabled', e.target.checked)}
          />
          Mostrar overlay al grabar (indicador y confirmación de clip)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.autoLaunch}
            onChange={(e) => set('autoLaunch', e.target.checked)}
          />
          Iniciar GameClip con Windows (en la bandeja)
        </label>
      </fieldset>
    </SeccionForm>
  );
}
