import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { UpdateCheckResult } from '@shared/ipc';

interface UpdateContextValue {
  /** Último resultado conocido (del chequeo de arranque o del manual). null hasta el primero. */
  result: UpdateCheckResult | null;
  /** Hay una comprobación manual en curso. */
  comprobando: boolean;
  /** true tras un chequeo manual terminado, para poder decir "estás al día". */
  comprobadoManual: boolean;
  /** El modal de arranque solo sale una vez por lanzamiento; esto controla su visibilidad. */
  mostrarModalArranque: boolean;
  comprobar(): Promise<void>;
  descartarModal(): void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [comprobadoManual, setComprobadoManual] = useState(false);
  const [mostrarModalArranque, setMostrarModalArranque] = useState(false);
  const chequeoArranque = useRef(false);

  // Chequeo silencioso al arrancar, una sola vez. Si hay update, dispara el modal; si falla, calla.
  useEffect(() => {
    if (chequeoArranque.current) return;
    chequeoArranque.current = true;
    void window.gameclip
      .checkForUpdate()
      .then((r) => {
        setResult(r);
        if (r.updateAvailable) setMostrarModalArranque(true);
      })
      .catch(() => undefined);
  }, []);

  // Comprobación manual (botón): re-consulta y deja feedback, pero NO reabre el modal de arranque.
  const comprobar = useCallback(async () => {
    setComprobando(true);
    try {
      const r = await window.gameclip.checkForUpdate();
      setResult(r);
      setComprobadoManual(true);
    } catch {
      // checkForUpdate no rechaza; este catch es por si el IPC mismo falla. Sin feedback ruidoso.
    } finally {
      setComprobando(false);
    }
  }, []);

  const descartarModal = useCallback(() => setMostrarModalArranque(false), []);

  return (
    <UpdateContext.Provider
      value={{
        result,
        comprobando,
        comprobadoManual,
        mostrarModalArranque,
        comprobar,
        descartarModal,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdates(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdates debe usarse dentro de <UpdateProvider>');
  return ctx;
}
