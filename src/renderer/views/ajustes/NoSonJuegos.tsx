import { useCallback, useEffect, useState } from 'react';
import type { ExcludedGame, InstalledGameInfo } from '@shared/games';
import GameIcon from '../../components/GameIcon';
import { BotonQuitar } from './BotonQuitar';

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
    try {
      setLista(await window.gameclip.games.setExcluded(next));
    } catch (err) {
      // Falló el guardado: la lista optimista miente. Se vuelve a lo que de verdad hay guardado, y el
      // rechazo no queda suelto (los handlers llaman a esto con `void`).
      console.error('[no-son-juegos] no se pudo guardar la lista:', err);
      try {
        setLista((await window.gameclip.capture.getSettings()).excludedGames);
      } catch (err2) {
        console.error('[no-son-juegos] tampoco se pudo recargar la lista:', err2);
      }
    }
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
      <legend className="gc-label">No son juegos</legend>
      <p className="settings-hint">
        Apps que los launchers instalan pero no son juegos: no se detectan ni se graban como juego.
        «Sincronizar» añade solas las conocidas (<em>auto</em>); lo que pongas a mano (
        <em>manual</em>) se respeta siempre.
      </p>
      <div className="settings-addrow is-two">
        <label>
          Instalado
          <select className="gc-field" value={elegido} onChange={(e) => setElegido(e.target.value)}>
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
            className="gc-field"
            placeholder="Wallpaper Engine"
            value={libre}
            onChange={(e) => setLibre(e.target.value)}
          />
        </label>
        <button type="button" className="gc-btn" onClick={anadir} disabled={!nombreNuevo}>
          Añadir
        </button>
      </div>
      {actual.length > 0 && (
        <ul className="settings-list">
          {actual.map((e) => (
            <li
              key={e.name}
              className={e.enabled ? 'settings-excl-row' : 'settings-excl-row is-off'}
            >
              <label className="settings-excl-main">
                <input
                  type="checkbox"
                  className="gc-check"
                  checked={e.enabled}
                  aria-label={`Excluir ${e.name}`}
                  onChange={() => alternar(e.name)}
                />
                <GameIcon game={e.name} />
                <span className="settings-excl-name">{e.name}</span>
              </label>
              <span
                className={e.source === 'manual' ? 'settings-origen is-manual' : 'settings-origen'}
              >
                {e.source}
              </span>
              {e.source === 'manual' ? (
                <BotonQuitar nombre={e.name} onClick={() => quitar(e.name)} />
              ) : (
                <span className="settings-remove-slot" aria-hidden="true" />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="settings-listfoot">
        <p className="settings-hint">
          Desmarcar una <em>auto</em> la vuelve a tratar como juego; la sincronización no la
          reactiva.
        </p>
        <button
          type="button"
          className="gc-btn ghost sm"
          onClick={() => void sincronizar()}
          disabled={sincronizando}
        >
          {sincronizando ? 'Sincronizando…' : 'Sincronizar'}
        </button>
      </div>
    </fieldset>
  );
}
