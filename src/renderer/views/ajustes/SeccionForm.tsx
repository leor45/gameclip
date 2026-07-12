import type { FormEvent, ReactNode } from 'react';

interface SeccionFormProps {
  saving: boolean;
  saved: boolean;
  onGuardar: () => void;
  /** Motivo por el que no se puede guardar (p. ej. una colisión de atajos); null = se puede. */
  bloqueo?: string | null;
  children: ReactNode;
}

/** Envoltorio común a toda sección de Ajustes: agrupa los campos y el botón "Guardar ajustes". */
export function SeccionForm({ saving, saved, onGuardar, bloqueo, children }: SeccionFormProps) {
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (bloqueo) return;
    onGuardar();
  }

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      {children}
      <div className="settings-actions">
        <button type="submit" disabled={saving || Boolean(bloqueo)}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
        {bloqueo && <span className="settings-warning">{bloqueo}</span>}
        {saved && !bloqueo && <span className="settings-saved">Ajustes guardados ✓</span>}
      </div>
    </form>
  );
}
