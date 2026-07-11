import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesDesarrollo() {
  const { settings, set, save, saving, saved } = useCaptureSettings();

  if (!settings) return <p className="placeholder">Cargando…</p>;

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Modo desarrollo</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.hardwareAcceleration}
            onChange={(e) => set('hardwareAcceleration', e.target.checked)}
          />
          Aceleración por hardware
        </label>
        <p className="settings-warning">
          Desactivarla puede hacer inutilizable el editor y causar problemas de rendimiento al
          navegar la app. Solo desactivala para depurar problemas de compatibilidad; no afecta
          al grabador de juegos (eso se configura en Calidad).
        </p>
        <p className="settings-hint">Los cambios se aplican al reiniciar GameClip.</p>
      </fieldset>
    </SeccionForm>
  );
}
