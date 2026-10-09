import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Modales abiertos a la vez: el fondo vuelve a ser interactivo solo cuando se cierra el último.
let abiertos = 0;

interface ModalProps {
  /** Título visible; también da nombre accesible al diálogo. */
  title: string;
  /** Marca a la izquierda del título (p. ej. «!» en rojo para algo destructivo). */
  mark?: ReactNode;
  children?: ReactNode;
  /** Botones; el que lleve `data-autofocus` recibe el foco al abrir. */
  actions: ReactNode;
  /** Esc, clic fuera o el botón de cerrar. Sin él el modal no se puede descartar (p. ej. en curso). */
  onDismiss?: () => void;
  /** `alertdialog` para confirmaciones y errores (los lectores lo anuncian de inmediato). */
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

/**
 * Modal propio de la app: sustituye a los `confirm`/`alert` nativos. Bloquea el fondo (inert), atrapa
 * el foco dentro, cierra con Esc o clic fuera (si hay `onDismiss`) y al cerrar devuelve el foco a
 * donde estaba.
 */
export default function Modal({
  title,
  mark,
  children,
  actions,
  onDismiss,
  role = 'dialog',
  className,
}: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const raiz = document.getElementById('root');
    abiertos++;
    raiz?.setAttribute('inert', '');
    const panel = ref.current;
    const inicial =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    inicial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissRef.current) {
        e.preventDefault();
        e.stopPropagation();
        dismissRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea'),
      ];
      if (focusables.length === 0) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    // En captura: el Esc del modal no debe llegar a otros atajos de la vista (p. ej. cerrar el panel).
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      abiertos--;
      if (abiertos === 0) raiz?.removeAttribute('inert');
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return createPortal(
    <div
      className="gc-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissRef.current?.();
      }}
    >
      <div
        ref={ref}
        className={['gc-modal', className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
      >
        <div className="gc-modal-head">
          {mark}
          <h2 id={titleId} className="gc-modal-title gc-display">
            {title}
          </h2>
        </div>
        {children && (
          <div id={bodyId} className="gc-modal-body">
            {children}
          </div>
        )}
        <div className="gc-modal-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
