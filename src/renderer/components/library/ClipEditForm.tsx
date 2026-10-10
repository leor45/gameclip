import { useState, type FormEvent } from 'react';
import type { Clip } from '@shared/library';

interface Props {
  clip: Clip;
  ocupado: boolean;
  onGuardar: (titulo: string, tags: string) => Promise<unknown>;
  onCancelar: () => void;
}

/**
 * Renombrar y etiquetar en línea (tarjeta y panel). El borrador se toma del clip al ABRIR el
 * formulario y no se realinea mientras está abierto: la Biblioteca recarga la lista en cada cambio
 * del catálogo (miniaturas, replays) y realinear pisaría lo que el usuario está escribiendo.
 */
export default function ClipEditForm({ clip, ocupado, onGuardar, onCancelar }: Props) {
  const [titulo, setTitulo] = useState(clip.title);
  const [tags, setTags] = useState(clip.tags.join(', '));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await onGuardar(titulo, tags);
    onCancelar();
  }

  return (
    <form className="clip-edit" onSubmit={(e) => void enviar(e)}>
      <input
        className="gc-field"
        aria-label="Título"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        maxLength={120}
      />
      <input
        className="gc-field"
        aria-label="Etiquetas (separadas por coma)"
        placeholder="etiquetas, separadas, por coma"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <div className="clip-edit-actions">
        <button type="submit" className="gc-btn sm" disabled={ocupado || !titulo.trim()}>
          Guardar
        </button>
        <button type="button" className="gc-btn ghost sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
