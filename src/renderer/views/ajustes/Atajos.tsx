import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_CAPTURE_SETTINGS } from '@shared/capture';
import type { HotkeyKey } from '@shared/hotkeys';
import {
  HOTKEY_ACTIONS,
  accelFromKeyPress,
  accelFromMousePress,
  hotkeyCollisions,
  isPttReserved,
} from '@shared/hotkeys';
import { ESCUCHANDO, RECHAZO_BOTON_RATON, evitarMenu } from './captura-atajo';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesAtajos() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  /** Acción cuyo atajo se está capturando ahora mismo (el botón está "a la escucha"). */
  const [capturando, setCapturando] = useState<HotkeyKey | null>(null);
  /** Motivo del último rechazo al capturar (tecla reservada por el PTT, p. ej.). */
  const [rechazo, setRechazo] = useState<string | null>(null);

  const pttHotkey = settings?.pttHotkey ?? '';

  /** Asigna el acelerador capturado (tecla o botón del ratón) si no choca con el PTT. */
  const asignar = useCallback(
    (accel: string) => {
      if (!capturando) return;
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
      asignar(accel);
    },
    [capturando, asignar],
  );

  const alPulsarRaton = useCallback(
    (e: MouseEvent) => {
      if (!capturando) return;
      // El izquierdo sigue siendo para usar la página (p. ej. el botón «Cancelar»).
      if (e.button === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const accel = accelFromMousePress(e);
      if (!accel) {
        setRechazo(RECHAZO_BOTON_RATON);
        return;
      }
      asignar(accel);
    },
    [capturando, asignar],
  );

  useEffect(() => {
    if (!capturando) return;
    // `capture: true`: la pulsación es nuestra antes de que ningún control del formulario la vea.
    window.addEventListener('keydown', alPulsar, true);
    window.addEventListener('mousedown', alPulsarRaton, true);
    window.addEventListener('contextmenu', evitarMenu, true);
    return () => {
      window.removeEventListener('keydown', alPulsar, true);
      window.removeEventListener('mousedown', alPulsarRaton, true);
      window.removeEventListener('contextmenu', evitarMenu, true);
    };
  }, [capturando, alPulsar, alPulsarRaton]);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  const colisiones = hotkeyCollisions(settings);
  const enColision = new Set<HotkeyKey>(colisiones.flat());
  const bloqueo = colisiones.length
    ? 'Hay atajos repetidos: dos acciones no pueden compartir la misma tecla.'
    : null;

  function restablecer() {
    // Un default que coincide con la tecla del PTT no se restablece (sería el mismo choque que la
    // captura ya rechaza): se deja el atajo actual y se explica.
    const saltados: string[] = [];
    for (const action of HOTKEY_ACTIONS) {
      const porDefecto = DEFAULT_CAPTURE_SETTINGS[action.key];
      if (isPttReserved(porDefecto, pttHotkey)) {
        saltados.push(`«${action.label}» (${porDefecto})`);
        continue;
      }
      set(action.key, porDefecto);
    }
    setCapturando(null);
    setRechazo(
      saltados.length
        ? `No se restableció ${saltados.join(', ')}: es la tecla del push to talk.`
        : null,
    );
  }

  return (
    <SeccionForm
      titulo="Atajos"
      saving={saving}
      saved={saved}
      onGuardar={() => void save()}
      bloqueo={bloqueo}
    >
      <fieldset>
        <legend className="gc-label">Atajos de teclado y ratón</legend>
        <p className="settings-hint">
          Pulsa «Editar atajo» y teclea la combinación que quieras, o pulsa un botón lateral del
          ratón (Esc cancela). Funcionan también dentro del juego.
        </p>
        <ul className="hotkey-list">
          {HOTKEY_ACTIONS.map((action) => {
            const chocando = enColision.has(action.key);
            const escuchando = capturando === action.key;
            return (
              <li
                key={action.key}
                className={`hotkey-row${chocando ? ' is-clash' : ''}${escuchando ? ' is-listening' : ''}`}
              >
                <div className="hotkey-info">
                  <span className="hotkey-label" id={`hotkey-${action.key}`}>
                    {action.label}
                  </span>
                  {escuchando ? (
                    <span className="hotkey-listening" role="status">
                      {ESCUCHANDO}
                    </span>
                  ) : (
                    <span className="hotkey-desc">{action.description}</span>
                  )}
                </div>
                <span className="gc-kbd hotkey-kbd">{settings[action.key]}</span>
                <button
                  type="button"
                  className="gc-btn ghost sm"
                  aria-describedby={`hotkey-${action.key}`}
                  onClick={() => {
                    setRechazo(null);
                    setCapturando(escuchando ? null : action.key);
                  }}
                >
                  {escuchando ? 'Cancelar' : 'Editar atajo…'}
                </button>
              </li>
            );
          })}
        </ul>
        {rechazo && <p className="settings-warning is-error">{rechazo}</p>}
        <p className="settings-hint">
          La tecla del push to talk ({pttHotkey}) está reservada y no se puede usar como atajo.
          Mouse4 y Mouse5 son los botones laterales del ratón (atrás y adelante). Se cambia en{' '}
          <Link to="/ajustes/audio" className="settings-link">
            Audio
          </Link>
          .
        </p>
        <div className="settings-row">
          <button type="button" className="gc-btn ghost sm" onClick={restablecer}>
            Restablecer atajos por defecto
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="gc-label">Botón de captura del mando</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.controllerCaptureEnabled}
            onChange={(e) => set('controllerCaptureEnabled', e.target.checked)}
          />
          Habilitar botón de captura de mandos
        </label>
        <p className="settings-hint">
          Guarda un clip con el botón dedicado del mando, igual que «{settings.replayHotkey}»: el
          botón <strong>Create/Share</strong> del DualSense (PS5) o el botón{' '}
          <strong>Compartir</strong> del mando de Xbox. Funciona con el mando conectado por USB o
          por Bluetooth.
        </p>
        <p className="settings-warning">
          <strong>Si el botón Compartir del mando de Xbox por USB no funciona:</strong> necesita el
          componente <em>GameInput</em> de Windows. Viene incluido en Windows 11 actualizado; si no
          lo tienes, instala la app <em>Accesorios de Xbox</em> desde Microsoft Store (trae el
          runtime de GameInput) y reinicia GameClip. El DualSense y el mando de Xbox por Bluetooth
          no necesitan nada extra. Nota: si en Windows dejaste el botón Compartir asignado a la Xbox
          Game Bar, puede que se dispare también su propia captura.
        </p>
      </fieldset>
    </SeccionForm>
  );
}
