import type { ReactNode } from 'react';
import Modal from './Modal';

interface ConfirmDialogProps {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Acción destructiva: botón rojo y marca «!»; el foco empieza en Cancelar. */
  danger?: boolean;
  /** Qué botón tiene el foco al abrir. Por defecto Cancelar si es destructivo; si no, confirmar. */
  focus?: 'confirm' | 'cancel';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación de la app (sustituye a `window.confirm`). Esc y clic fuera cancelan. */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  focus,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const foco = focus ?? (danger ? 'cancel' : 'confirm');
  return (
    <Modal
      title={title}
      role="alertdialog"
      mark={danger ? <span className="gc-modal-mark">!</span> : undefined}
      onDismiss={busy ? undefined : onCancel}
      actions={
        <>
          <button
            type="button"
            className="gc-btn ghost"
            onClick={onCancel}
            disabled={busy}
            data-autofocus={foco === 'cancel' ? '' : undefined}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'gc-btn danger' : 'gc-btn'}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus={foco === 'confirm' ? '' : undefined}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
