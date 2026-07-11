import type { CaptureSettings } from '@shared/capture';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesAvanzado() {
  const { settings, set, save, saving, saved } = useCaptureSettings();

  if (!settings) return <p className="placeholder">Cargando…</p>;

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <p className="settings-warning">
        Cuidado, dragones: estos ajustes son para casos avanzados y pueden afectar el rendimiento o
        la compatibilidad de la captura.
      </p>

      <fieldset>
        <legend>Captura</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.advancedWindowCapture}
            onChange={(e) => set('advancedWindowCapture', e.target.checked)}
          />
          Captura de ventana avanzada (Windows Graphics Capture)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.experimentalCapture}
            onChange={(e) => set('experimentalCapture', e.target.checked)}
          />
          Captura experimental (incluye overlays de terceros)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.hdrCompatibility}
            onChange={(e) => set('hdrCompatibility', e.target.checked)}
          />
          Compatibilidad HDR (convertir a SDR)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.forceWindowCapture}
            onChange={(e) => set('forceWindowCapture', e.target.checked)}
          />
          Forzar captura en modo ventana
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.showMouseCursor}
            onChange={(e) => set('showMouseCursor', e.target.checked)}
          />
          Mostrar cursor del mouse
        </label>
      </fieldset>

      <fieldset>
        <legend>Buffer y formato de salida</legend>
        <label>
          Buffer de repetición
          <select
            value={settings.recordingBuffer}
            onChange={(e) =>
              set('recordingBuffer', e.target.value as CaptureSettings['recordingBuffer'])
            }
          >
            <option value="memory">Memoria (recomendado)</option>
            <option value="disk">Disco</option>
          </select>
        </label>
        <p className="settings-hint">
          Hoy el buffer siempre reside en RAM; la opción a disco queda preparada a futuro.
        </p>
        <label>
          Relación de aspecto
          <select
            value={settings.aspectRatio}
            onChange={(e) => set('aspectRatio', e.target.value as CaptureSettings['aspectRatio'])}
          >
            <option value="game">Aspecto del juego</option>
            <option value="stretch169">Estirar a 16:9</option>
            <option value="bars169">16:9 con barras negras</option>
            <option value="crop169">Recortar a 16:9</option>
          </select>
        </label>
      </fieldset>
    </SeccionForm>
  );
}
