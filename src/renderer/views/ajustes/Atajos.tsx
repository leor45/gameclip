import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import type { HotkeyKey } from '@shared/hotkeys';
import { HOTKEY_ACTIONS, accelFromKeyPress, hotkeyCollisions, isPttReserved } from '@shared/hotkeys';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesAtajos() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  /** Acción cuyo atajo se está capturando ahora mismo (el botón está "a la escucha"). */
  const [capturando, setCapturando] = useState<HotkeyKey | null>(null);
  /** Motivo del último rechazo al capturar (tecla reservada por el PTT, p. ej.). */
  const [rechazo, setRechazo] = useState<string | null>(null);

  const pttHotkey = settings?.pttHotkey ?? '';

  const alPulsar = useCallback(
    (e: KeyboardEvent) => {
      if (!capturando) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturando(null);
        setRechazo(null);
        return;
      }
      const accel = accelFromKeyPress(e);
      if (!accel) return; // solo modificadores (o tecla no soportada): seguimos escuchando
      if (isPttReserved(accel, pttHotkey)) {
        setRechazo(`${accel} está reservada para el push to talk. Elige otra tecla.`);
        return; // seguimos a la escucha
      }
      set(capturando, accel);
      setCapturando(null);
      setRechazo(null);
    },
    [capturando, pttHotkey, set],
  );

  useEffect(() => {
    if (!capturando) return;
    // `capture: true`: la pulsación es nuestra antes de que ningún control del formulario la vea.
    window.addEventListener('keydown', alPulsar, true);
    return () => window.removeEventListener('keydown', alPulsar, true);
  }, [capturando, alPulsar]);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  const colisiones = hotkeyCollisions(settings);
  const enColision = new Set<HotkeyKey>(colisiones.flat());
  const bloqueo = colisiones.length
    ? 'Hay atajos repetidos: dos acciones no pueden compartir la misma tecla.'
    : null;

  function restablecer() {
    for (const action of HOTKEY_ACTIONS) {
      set(action.key, DEFAULT_CAPTURE_SETTINGS[action.key]);
    }
    setCapturando(null);
    setRechazo(null);
  }

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()} bloqueo={bloqueo}>
      <fieldset>
        <legend>Atajos de teclado</legend>
        <p className="settings-hint">
          Pulsa «Editar atajo» y teclea la combinación que quieras (Esc cancela). Funcionan también
          dentro del juego.
        </p>
        <ul className="hotkey-list">
          {HOTKEY_ACTIONS.map((action) => {
            const chocando = enColision.has(action.key);
            const escuchando = capturando === action.key;
            return (
              <li
                key={action.key}
                className={`hotkey-row${chocando ? ' hotkey-row-conflicto' : ''}`}
              >
                <div className="hotkey-info">
                  <span className="hotkey-label" id={`hotkey-${action.key}`}>
                    {action.label}
                  </span>
                  <span className="hotkey-desc">{action.description}</span>
                </div>
                <div className="hotkey-control">
                  <span className={`hotkey-key${escuchando ? ' hotkey-key-escuchando' : ''}`}>
                    {escuchando ? 'Pulsa una combinación…' : settings[action.key]}
                  </span>
                  <button
                    type="button"
                    aria-describedby={`hotkey-${action.key}`}
                    onClick={() => {
                      setRechazo(null);
                      setCapturando(escuchando ? null : action.key);
                    }}
                  >
                    {escuchando ? 'Cancelar' : 'Editar atajo…'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {rechazo && <p className="settings-warning">{rechazo}</p>}
        <p className="settings-hint">
          La tecla del push to talk ({pttHotkey}) está reservada y no se puede usar como atajo.
          Se cambia en <Link to="/ajustes/audio">Audio</Link>.
        </p>
        <div className="hotkey-actions">
          <button type="button" onClick={restablecer}>
            Restablecer atajos por defecto
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Botón de captura del mando</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.controllerCaptureEnabled}
            onChange={(e) => set('controllerCaptureEnabled', e.target.checked)}
          />
          Habilitar botón de captura de mandos
        </label>
        <p className="settings-hint">
          Guarda un clip con el botón dedicado del mando, igual que «{settings.replayHotkey}»: el
          botón <strong>Create/Share</strong> del DualSense (PS5) o el botón <strong>Compartir</strong>{' '}
          del mando de Xbox. Funciona con el mando conectado por USB o por Bluetooth.
        </p>
        <p className="settings-hint">
          <strong>Si el botón Compartir del mando de Xbox por USB no funciona:</strong> necesita el
          componente <em>GameInput</em> de Windows. Viene incluido en Windows 11 actualizado; si no lo
          tienes, instala la app <em>Accesorios de Xbox</em> desde Microsoft Store (trae el runtime de
          GameInput) y reinicia GameClip. El DualSense y el mando de Xbox por Bluetooth no necesitan
          nada extra. Nota: si en Windows dejaste el botón Compartir asignado a la Xbox Game Bar,
          puede que se dispare también su propia captura.
        </p>
      </fieldset>
    </SeccionForm>
  );
}
