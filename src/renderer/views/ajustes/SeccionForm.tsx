import type { FormEvent, ReactNode } from 'react';

interface SeccionFormProps {
  /** Titular de la sección (Grabación, General…). */
  titulo: string;
  saving: boolean;
  saved: boolean;
  onGuardar: () => void;
  /** Motivo por el que no se puede guardar (p. ej. una colisión de atajos); null = se puede. */
  bloqueo?: string | null;
  children: ReactNode;
}

/**
 * Envoltorio común a toda sección de Ajustes: los campos van en un área con scroll propio y el pie
 * con «Guardar ajustes» queda fijo abajo, siempre visible (también el motivo de un bloqueo y la
 * confirmación de guardado, que así no se pierden por debajo del scroll).
 */
export function SeccionForm({
  titulo,
  saving,
  saved,
  onGuardar,
  bloqueo,
  children,
}: SeccionFormProps) {
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (bloqueo) return;
    onGuardar();
  }

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      <div className="settings-scroll">
        <div className="settings-body">
          <h2 className="settings-title gc-display">{titulo}</h2>
          {children}
        </div>
      </div>
      <div className="settings-savebar">
        {bloqueo && (
          <span className="settings-savebar-msg is-error" role="alert">
            {bloqueo}
          </span>
        )}
        {saved && !bloqueo && (
          <span className="settings-savebar-msg settings-saved" role="status">
            Ajustes guardados ✓
          </span>
        )}
        <button type="submit" className="gc-btn" disabled={saving || Boolean(bloqueo)}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>
    </form>
  );
}
