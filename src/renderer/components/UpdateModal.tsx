import { useUpdates } from '../updates/UpdateContext';
import Modal from './Modal';

/**
 * Aviso modal de versión nueva, solo al arrancar (una vez por lanzamiento). El aviso pasivo del
 * sidebar cubre el resto de la sesión. Abrir el release va al navegador vía `window.open`, que el
 * `setWindowOpenHandler` del main redirige a `shell.openExternal`. Esc o clic fuera = «Ahora no».
 */
export default function UpdateModal() {
  const { result, mostrarModalArranque, descartarModal } = useUpdates();
  if (!mostrarModalArranque || !result?.updateAvailable) return null;

  const verRelease = () => {
    window.open(result.url);
    descartarModal();
  };

  return (
    <Modal
      title="Hay una versión nueva"
      className="update-modal"
      onDismiss={descartarModal}
      actions={
        <>
          <button type="button" className="gc-btn ghost" onClick={descartarModal}>
            Ahora no
          </button>
          <button type="button" className="gc-btn" data-autofocus onClick={verRelease}>
            Ver release
          </button>
        </>
      }
    >
      <p>
        GameClip <strong>v{result.latest}</strong> ya está disponible. Tienes la v{result.current}.
      </p>
    </Modal>
  );
}
