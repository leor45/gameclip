import { useCallback, useEffect, useState } from 'react';
import type { ExcludedGame, InstalledGameInfo } from '@shared/games';

/**
 * Lista «no son juegos»: lo que los launchers instalan pero no es un juego (Wallpaper Engine, Lossless
 * Scaling…). Dos vías que conviven: «Sincronizar» añade solas las apps conocidas (*auto*) y el owner
 * añade a mano (*manual*); si una ya está en la lista, la sincronización la salta.
 *
 * Va por su propio IPC y se aplica **al momento**: no espera a «Guardar ajustes» ni reconstruye la
 * captura (no vacía el búfer de repetición).
 */
export function NoSonJuegos() {
  const [lista, setLista] = useState<ExcludedGame[] | null>(null);
  const [instalados, setInstalados] = useState<InstalledGameInfo[]>([]);
  const [elegido, setElegido] = useState('');
  const [libre, setLibre] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  const cargarInstalados = useCallback(async () => {
    setInstalados(await window.gameclip.games.listInstalled());
  }, []);

  useEffect(() => {
    let vivo = true;
    void window.gameclip.capture.getSettings().then((s) => {
      if (vivo) setLista(s.excludedGames);
    });
    void window.gameclip.games.listInstalled().then((i) => {
      if (vivo) setInstalados(i);
    });
    // La sincronización corre también en segundo plano (al arrancar, al instalar algo).
    const off = window.gameclip.capture.onSettingsChanged((s) => setLista(s.excludedGames));
    return () => {
      vivo = false;
      off();
    };
  }, []);

  if (!lista) return null;
  const actual = lista;

  const enLista = new Set(actual.map((e) => e.name.trim().toLowerCase()));
  const candidatos = instalados.filter((j) => !enLista.has(j.name.trim().toLowerCase()));
  const nombreNuevo = (elegido || libre).trim();

  async function guardar(next: ExcludedGame[]) {
    setLista(next);
    setLista(await window.gameclip.games.setExcluded(next));
  }

  function anadir() {
    if (!nombreNuevo || enLista.has(nombreNuevo.toLowerCase())) return;
    void guardar([...actual, { name: nombreNuevo, source: 'manual', enabled: true }]);
    setElegido('');
    setLibre('');
  }

  function alternar(name: string) {
    void guardar(actual.map((e) => (e.name === name ? { ...e, enabled: !e.enabled } : e)));
  }

  function quitar(name: string) {
    void guardar(actual.filter((e) => e.name !== name));
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      // Para sincronizar la lista basta releer los launchers: si cambia, cambia la huella y re-indexa.
      // Forzar re-escanearía las carpetas de todos los juegos en cada clic.
      await window.gameclip.games.rescan({ force: false });
      await cargarInstalados();
      setLista((await window.gameclip.capture.getSettings()).excludedGames);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <fieldset>
      <legend>No son juegos</legend>
      <p className="settings-hint">
        Apps que los launchers instalan pero no son juegos: no se detectan ni se graban como juego.
        «Sincronizar» añade solas las conocidas (<em>auto</em>); lo que pongas a mano (
        <em>manual</em>) se respeta siempre.
      </p>
      <div className="audio-app-add">
        <label>
          Instalado
          <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Elegir…</option>
            {candidatos.map((j) => (
              <option key={j.name} value={j.name}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          O escribe el nombre
          <input
            type="text"
            placeholder="Wallpaper Engine"
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
          />
        </label>
        <button type="button" onClick={anadir} disabled={!nombreNuevo}>
          Añadir
        </button>
      </div>
      {actual.length > 0 && (
        <ul className="audio-app-list">
          {actual.map((e) => (
            <li key={e.name} className="audio-app-row">
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={e.enabled}
                  aria-label={`Excluir ${e.name}`}
                  onChange={() => alternar(e.name)}
                />
                <span className="audio-app-name">{e.name}</span>
              </label>
              <span className="capture-tag">{e.source}</span>
              {e.source === 'manual' && (
                <button
                  type="button"
                  className="audio-app-trash"
                  aria-label={`Quitar ${e.name}`}
                  title={`Quitar ${e.name}`}
                  onClick={() => quitar(e.name)}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M6 1h4l.5 1H14v2H2V2h3.5L6 1zm-2.5 4h9L12 15H4L3.5 5zm3 2v6h1V7h-1zm2.5 0v6h1V7h-1z"
                    />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="settings-hint">
        Desmarcar una <em>auto</em> la vuelve a tratar como juego; la sincronización no la reactiva.
      </p>
      <button type="button" onClick={() => void sincronizar()} disabled={sincronizando}>
        {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
      </button>
    </fieldset>
  );
}
