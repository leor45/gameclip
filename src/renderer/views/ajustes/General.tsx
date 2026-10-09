import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { REPLAY_SECONDS_MAX, REPLAY_SECONDS_MIN } from '@shared/capture';
import { HotkeyInfo } from './HotkeyInfo';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

/** Id estable del campo de la duración del buffer (destino del enlace de la barra superior). */
const REPLAY_SECONDS_INPUT_ID = 'ajustes-replay-seconds';

/** Cuánto dura la marca amarilla del campo al llegar desde la barra superior. */
const MARCA_LLEGADA_MS = 1500;

/** Estado de navegación con el que la barra superior pide el foco en un campo de General. */
interface LlegadaState {
  focus?: 'replaySeconds';
}

export default function AjustesGeneral() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const bufferRef = useRef<HTMLInputElement>(null);
  /** Clave de la navegación ya atendida: el foco se da una vez por navegación, no por render. */
  const atendida = useRef<string | null>(null);
  const [marcado, setMarcado] = useState(false);

  const pideFoco = (location.state as LlegadaState | null)?.focus === 'replaySeconds';
  const cargado = settings !== null;

  // Llegada desde «Ajustes → General ›» de la barra superior: foco en la duración del buffer y marca
  // amarilla un momento. Espera a que los ajustes carguen (el campo no existe antes) y limpia el
  // state para que recargar o volver atrás no lo repita.
  useEffect(() => {
    if (!pideFoco || !cargado || atendida.current === location.key) return;
    const campo = bufferRef.current;
    if (!campo) return;
    atendida.current = location.key;
    campo.focus();
    setMarcado(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [pideFoco, cargado, location.key, location.pathname, navigate]);

  useEffect(() => {
    if (!marcado) return;
    const timer = setTimeout(() => setMarcado(false), MARCA_LLEGADA_MS);
    return () => clearTimeout(timer);
  }, [marcado]);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  return (
    <SeccionForm titulo="General" saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend className="gc-label">Clip retroactivo</legend>
        <div className="settings-fields">
          <label
            className={marcado ? 'settings-arrive is-marked' : 'settings-arrive'}
            htmlFor={REPLAY_SECONDS_INPUT_ID}
          >
            Duración del buffer (segundos)
            <input
              ref={bufferRef}
              id={REPLAY_SECONDS_INPUT_ID}
              className="gc-field"
              type="number"
              min={REPLAY_SECONDS_MIN}
              max={REPLAY_SECONDS_MAX}
              value={settings.replaySeconds}
              onChange={(e) => set('replaySeconds', Number(e.target.value))}
            />
          </label>
          <HotkeyInfo label="Atajo para guardar clip" accel={settings.replayHotkey} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="gc-label">Comportamiento</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.bufferMode === 'game'}
            onChange={(e) => set('bufferMode', e.target.checked ? 'game' : 'always')}
          />
          Iniciar el buffer solo al detectar un juego
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.overlayEnabled}
            onChange={(e) => set('overlayEnabled', e.target.checked)}
          />
          Mostrar overlay al grabar (indicador y confirmación de clip)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.autoLaunch}
            onChange={(e) => set('autoLaunch', e.target.checked)}
          />
          Iniciar GameClip con Windows (en la bandeja)
        </label>
      </fieldset>
    </SeccionForm>
  );
}
