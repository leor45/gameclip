import { Link } from 'react-router-dom';

interface HotkeyInfoProps {
  /** Qué hace el atajo, en la voz de la sección donde se muestra ("Atajo para guardar clip"). */
  label: string;
  /** Tecla configurada ahora mismo. */
  accel: string;
}

/**
 * Atajo en modo solo lectura. Los atajos se editan en una única sección (Atajos): tenerlos también
 * editables aquí llevaba a escribirlos a mano, sin validación ni aviso de colisiones.
 */
export function HotkeyInfo({ label, accel }: HotkeyInfoProps) {
  return (
    <div className="hotkey-info-inline">
      <span className="hotkey-info-label">{label}</span>
      <span className="hotkey-key">{accel}</span>
      <Link to="/ajustes/atajos">Editar en Atajos</Link>
    </div>
  );
}
