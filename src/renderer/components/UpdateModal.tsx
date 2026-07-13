import { useUpdates } from '../updates/UpdateContext';

/**
 * Aviso modal de versión nueva, solo al arrancar (una vez por lanzamiento). El aviso pasivo del
 * sidebar cubre el resto de la sesión. Abrir el release va al navegador vía `window.open`, que el
 * `setWindowOpenHandler` del main redirige a `shell.openExternal`.
 */
export default function UpdateModal() {
  const { result, mostrarModalArranque, descartarModal } = useUpdates();
  if (!mostrarModalArranque || !result?.updateAvailable) return null;

  const verRelease = () => {
    window.open(result.url);
    descartarModal();
  };

  return (
    <div className="update-modal-backdrop" onClick={descartarModal}>
      <div
        className="update-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="update-modal-title">Hay una versión nueva</h2>
        <p>
          GameClip <strong>v{result.latest}</strong> ya está disponible. Tienes la v{result.current}.
        </p>
        <div className="update-modal-actions">
          <button type="button" className="secondary" onClick={descartarModal}>
            Ahora no
          </button>
          <button type="button" onClick={verRelease}>
            Ver release
          </button>
        </div>
      </div>
    </div>
  );
}
