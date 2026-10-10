import { Fragment, useEffect, useState } from 'react';
import type { GameIndex } from '@shared/games';
import { IconoPerezoso } from './IconoPerezoso';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesDesarrollo() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [index, setIndex] = useState<GameIndex>({});
  /** El desplegable del índice está abierto (los iconos se piden solo entonces). */
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    void window.gameclip.games.getIndex().then((idx) => {
      if (vivo) setIndex(idx);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  // Ordenado por nombre de juego (y ejecutable) para que la tabla sea fácil de escanear a ojo.
  const entradas = Object.entries(index).sort(
    (a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]),
  );
  // Una fila por juego con todos sus ejecutables (mismo mapa, agrupado; conserva el orden de arriba).
  const porJuego = new Map<string, string[]>();
  for (const [exe, juego] of entradas) {
    const exes = porJuego.get(juego);
    if (exes) exes.push(exe);
    else porJuego.set(juego, [exe]);
  }
  const numJuegos = porJuego.size;

  return (
    <SeccionForm titulo="Desarrollo" saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend className="gc-label">Modo desarrollo</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            className="gc-switch"
            checked={settings.hardwareAcceleration}
            onChange={(e) => set('hardwareAcceleration', e.target.checked)}
          />
          Aceleración por hardware
        </label>
        <p className="settings-warning is-error">
          Desactivarla puede hacer inutilizable el editor y causar problemas de rendimiento al
          navegar la app. Solo desactivala para depurar problemas de compatibilidad; no afecta al
          grabador de juegos (eso se configura en Calidad).
        </p>
        <p className="settings-hint">Los cambios se aplican al reiniciar GameClip.</p>
      </fieldset>

      <fieldset>
        <legend className="gc-label">Detección de juegos</legend>
        <details className="deteccion-detalle" onToggle={(e) => setAbierto(e.currentTarget.open)}>
          <summary>
            Índice de detección — {numJuegos} juegos · {entradas.length} ejecutables
          </summary>
          {entradas.length === 0 ? (
            <p className="settings-hint">
              El índice está vacío (aún no se ha detectado ningún juego instalado).
            </p>
          ) : (
            <div className="deteccion-tabla-scroll">
              <table className="deteccion-tabla">
                <thead>
                  <tr>
                    <th>
                      <span className="settings-sr">Icono</span>
                    </th>
                    <th>Juego</th>
                    <th>Ejecutables</th>
                  </tr>
                </thead>
                <tbody>
                  {[...porJuego].map(([juego, exes]) => (
                    <tr key={juego}>
                      {/* El icono solo se pide con la tabla abierta: el índice puede tener cientos
                          de juegos y la tabla arranca plegada. */}
                      <td className="deteccion-icono">
                        {abierto && <IconoPerezoso game={juego} />}
                      </td>
                      <td>{juego}</td>
                      <td className="deteccion-exes">
                        {exes.map((exe, i) => (
                          <Fragment key={exe}>
                            {i > 0 && ', '}
                            <code>{exe}.exe</code>
                          </Fragment>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
        <p className="settings-hint">
          Cada juego aporta varios ejecutables al índice; es el mapa que usa la detección para saber
          qué proceso es qué juego.
        </p>
      </fieldset>
    </SeccionForm>
  );
}
