import { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * Pregunta del main al cambiar la compatibilidad HDR de las capturas: reiniciar ya o al próximo
 * arranque. Sustituye al diálogo nativo (que el main sigue usando si la ventana no está a la vista).
 * Mismo texto y mismas opciones; «Reiniciar ahora» tiene el foco, como el botón por defecto de antes,
 * y Esc o clic fuera equivalen a «Al próximo arranque» (el cancelar del nativo).
 */
export default function HdrRestartPrompt() {
  const [pregunta, setPregunta] = useState<string | null>(null);

  useEffect(() => window.gameclip.ui.onAskHdrRestart(({ id }) => setPregunta(id)), []);

  if (!pregunta) return null;

  const responder = (answer: 'now' | 'later') => {
    setPregunta(null);
    void window.gameclip.ui.answerHdrRestart(pregunta, answer);
  };

  return (
    <ConfirmDialog
      title="Compatibilidad HDR en capturas"
      confirmLabel="Reiniciar ahora"
      cancelLabel="Al próximo arranque"
      focus="confirm"
      onConfirm={() => responder('now')}
      onCancel={() => responder('later')}
    >
      <p>
        <strong>Hay que reiniciar GameClip para aplicar este ajuste.</strong>
      </p>
      <p>
        Es una opción del capturador de pantalla y solo puede cambiarse al arrancar. Al reiniciar se
        pierde el búfer de repetición de los últimos segundos.
      </p>
    </ConfirmDialog>
  );
}
