import type { FormEvent, ReactNode } from 'react';

interface SeccionFormProps {
  saving: boolean;
  saved: boolean;
  onGuardar: () => void;
  children: ReactNode;
}

/** Envoltorio común a toda sección de Ajustes: agrupa los campos y el botón "Guardar ajustes". */
export function SeccionForm({ saving, saved, onGuardar, children }: SeccionFormProps) {
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onGuardar();
  }

  return (
    <form className="settings-form" onSubmit={onSubmit}>
      {children}
      <div className="settings-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar ajustes'}
        </button>
        {saved && <span className="settings-saved">Ajustes guardados ✓</span>}
      </div>
    </form>
  );
}
