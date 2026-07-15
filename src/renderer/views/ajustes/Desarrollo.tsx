import { useEffect, useState } from 'react';
import type { GameIndex } from '@shared/games';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

export default function AjustesDesarrollo() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [index, setIndex] = useState<GameIndex>({});

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
  const numJuegos = new Set(Object.values(index)).size;

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Modo desarrollo</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.hardwareAcceleration}
            onChange={(e) => set('hardwareAcceleration', e.target.checked)}
          />
          Aceleración por hardware
        </label>
        <p className="settings-warning">
          Desactivarla puede hacer inutilizable el editor y causar problemas de rendimiento al
          navegar la app. Solo desactivala para depurar problemas de compatibilidad; no afecta
          al grabador de juegos (eso se configura en Calidad).
        </p>
        <p className="settings-hint">Los cambios se aplican al reiniciar GameClip.</p>
      </fieldset>

      <fieldset>
        <legend>Detección de juegos</legend>
        <details className="deteccion-detalle">
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
                    <th>Ejecutable</th>
                    <th>Juego</th>
                  </tr>
                </thead>
                <tbody>
                  {entradas.map(([exe, juego]) => (
                    <tr key={exe}>
                      <td>{exe}.exe</td>
                      <td>{juego}</td>
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
