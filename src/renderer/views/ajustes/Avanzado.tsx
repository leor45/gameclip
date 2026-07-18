import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CaptureSettings } from '@shared/capture';
import { HOTKEY_ACTIONS, accelFromKeyPress, hotkeyCollisions, isPttReserved } from '@shared/hotkeys';
import type { PerfMetricKey, PerfOverlayConfig } from '@shared/perf';
import {
  PERF_METRIC_KEYS,
  PERF_PRESETS,
  PERF_PRESET_LABELS,
  clampPerfPosition,
  positionForPreset,
  presetFor,
} from '@shared/perf';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

const METRIC_LABELS: Record<PerfMetricKey, string> = {
  fps: 'FPS',
  gpuUsage: 'Uso de GPU (%)',
  gpuTemp: 'Temperatura de GPU',
  gpuFan: 'Velocidad de fans de la GPU (RPM)',
  gpuVoltage: 'Voltaje de la GPU',
  vram: 'VRAM usada / total',
  cpuUsage: 'Uso de CPU (%)',
  cpuTemp: 'Temperatura de CPU',
  ram: 'RAM usada',
};

export default function AjustesAvanzado() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  /** El botón del atajo está "a la escucha" de una pulsación. */
  const [capturando, setCapturando] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);

  const perf = settings?.perfOverlay ?? null;
  const perfEnabled = settings?.perfOverlayEnabled ?? false;

  const setPerf = useCallback(
    (patch: Partial<PerfOverlayConfig>) => {
      if (!settings) return;
      set('perfOverlay', { ...settings.perfOverlay, ...patch });
    },
    [settings, set],
  );

  // Preview en vivo (estilo NVIDIA App): cada cambio de config se aplica al overlay real al
  // instante, sin persistir; guardar sigue siendo lo que persiste. Debounce corto para que
  // arrastrar un slider no dispare un IPC por píxel.
  useEffect(() => {
    if (!perf || !perfEnabled) return;
    const timer = setTimeout(() => void window.gameclip.perf.preview(perf), 30);
    return () => clearTimeout(timer);
  }, [perf, perfEnabled]);

  // Al salir de la sección sin guardar, el overlay vuelve a la config persistida.
  useEffect(() => {
    return () => {
      void window.gameclip.capture.getSettings().then((s) => {
        if (s.perfOverlayEnabled) void window.gameclip.perf.preview(s.perfOverlay);
      });
    };
  }, []);

  // Captura del atajo: misma validación que la sección Atajos — tecla del PTT reservada y sin
  // duplicar un atajo ya asignado a otra acción (grabar, clip, captura, cambio de juego).
  const alPulsar = useCallback(
    (e: KeyboardEvent) => {
      if (!capturando || !settings) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturando(false);
        setRechazo(null);
        return;
      }
      const accel = accelFromKeyPress(e);
      if (!accel) return; // solo modificadores: seguimos escuchando
      if (isPttReserved(accel, settings.pttHotkey)) {
        setRechazo(`${accel} está reservada para el push to talk. Elige otra tecla.`);
        return;
      }
      const ocupado = HOTKEY_ACTIONS.find(
        (action) =>
          action.key !== 'perfOverlayHotkey' &&
          settings[action.key].trim().toLowerCase() === accel.toLowerCase(),
      );
      if (ocupado) {
        setRechazo(`${accel} ya está asignada a «${ocupado.label}». Elige otra tecla.`);
        return;
      }
      set('perfOverlayHotkey', accel);
      setCapturando(false);
      setRechazo(null);
    },
    [capturando, settings, set],
  );

  useEffect(() => {
    if (!capturando) return;
    window.addEventListener('keydown', alPulsar, true);
    return () => window.removeEventListener('keydown', alPulsar, true);
  }, [capturando, alPulsar]);

  if (!settings || !perf) return <p className="placeholder">Cargando…</p>;

  // Cinturón extra al guardar: si un ajuste editado a mano trae duplicados, se bloquea igual que
  // en la sección Atajos.
  const colisiones = hotkeyCollisions(settings);
  const bloqueo =
    colisiones.length && colisiones.flat().includes('perfOverlayHotkey')
      ? 'El atajo del overlay choca con otro atajo. Cámbialo antes de guardar.'
      : null;

  const preset = presetFor(perf.posX, perf.posY);
  const presetIndex = PERF_PRESETS.indexOf(preset);

  function moverPreset(delta: number) {
    const siguiente =
      PERF_PRESETS[(presetIndex + delta + PERF_PRESETS.length) % PERF_PRESETS.length];
    setPerf(positionForPreset(siguiente));
  }

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()} bloqueo={bloqueo}>
      <p className="settings-warning">
        Cuidado, dragones: estos ajustes son para casos avanzados y pueden afectar el rendimiento o
        la compatibilidad de la captura.
      </p>

      <fieldset>
        <legend>Captura</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.advancedWindowCapture}
            onChange={(e) => set('advancedWindowCapture', e.target.checked)}
          />
          Captura de ventana avanzada (Windows Graphics Capture)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.experimentalCapture}
            onChange={(e) => set('experimentalCapture', e.target.checked)}
          />
          Captura experimental (incluye overlays de terceros)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.hdrCompatibility}
            onChange={(e) => set('hdrCompatibility', e.target.checked)}
          />
          Compatibilidad HDR (convertir a SDR)
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.forceWindowCapture}
            onChange={(e) => set('forceWindowCapture', e.target.checked)}
          />
          Forzar captura en modo ventana
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.showMouseCursor}
            onChange={(e) => set('showMouseCursor', e.target.checked)}
          />
          Mostrar cursor del mouse
        </label>
      </fieldset>

      <fieldset>
        <legend>Overlay de rendimiento</legend>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.perfOverlayEnabled}
            onChange={(e) => set('perfOverlayEnabled', e.target.checked)}
          />
          Mostrar overlay de rendimiento
        </label>
        <p className="settings-hint">
          Métricas en vivo sobre el juego. No aparece en clips ni grabaciones aunque esté visible, y
          los avisos de GameClip (REC, clip guardado) siempre quedan por encima.
        </p>

        <div className="hotkey-control">
          <span className={`hotkey-key${capturando ? ' hotkey-key-escuchando' : ''}`}>
            {capturando ? 'Pulsa una combinación…' : settings.perfOverlayHotkey}
          </span>
          <button
            type="button"
            onClick={() => {
              setRechazo(null);
              setCapturando(!capturando);
            }}
          >
            {capturando ? 'Cancelar' : 'Editar atajo…'}
          </button>
          <span className="settings-hint">Muestra u oculta el overlay sin cambiar qué se ve.</span>
        </div>
        {rechazo && <p className="settings-warning">{rechazo}</p>}

        <p className="settings-subtitle">Qué mostrar</p>
        {PERF_METRIC_KEYS.map((key) => (
          <label className="settings-check" key={key}>
            <input
              type="checkbox"
              checked={perf.metrics[key]}
              onChange={(e) => setPerf({ metrics: { ...perf.metrics, [key]: e.target.checked } })}
            />
            {METRIC_LABELS[key]}
          </label>
        ))}

        <p className="settings-subtitle">Posición</p>
        <div className="perf-preset">
          <button type="button" aria-label="Posición anterior" onClick={() => moverPreset(-1)}>
            ‹
          </button>
          <span className="perf-preset-nombre" data-testid="perf-preset">
            {PERF_PRESET_LABELS[preset]}
          </span>
          <button type="button" aria-label="Posición siguiente" onClick={() => moverPreset(1)}>
            ›
          </button>
        </div>
        <label>
          Posición horizontal ({perf.posX})
          <input
            className="perf-slider"
            type="range"
            min={0}
            max={100}
            value={perf.posX}
            onChange={(e) => setPerf(clampPerfPosition(Number(e.target.value), perf.posY))}
          />
        </label>
        <label>
          Posición vertical ({perf.posY})
          <input
            className="perf-slider"
            type="range"
            min={0}
            max={100}
            value={perf.posY}
            onChange={(e) => setPerf(clampPerfPosition(perf.posX, Number(e.target.value)))}
          />
        </label>
        <p className="settings-hint">
          Con el overlay activo, los cambios se ven en pantalla al instante (el centro de la
          pantalla queda reservado al juego, como en NVIDIA App).
        </p>

        <label>
          Disposición
          <select
            value={perf.layout}
            onChange={(e) => setPerf({ layout: e.target.value as PerfOverlayConfig['layout'] })}
          >
            <option value="vertical">Desglosada (lista)</option>
            <option value="horizontal">Lineal (una línea)</option>
          </select>
        </label>
        <label>
          Tamaño de fuente
          <select
            value={perf.fontSize}
            onChange={(e) => setPerf({ fontSize: e.target.value as PerfOverlayConfig['fontSize'] })}
          >
            <option value="small">Pequeño</option>
            <option value="standard">Estándar</option>
            <option value="large">Grande</option>
          </select>
        </label>
        <label>
          Opacidad del fondo ({perf.bgOpacity})
          <input
            className="perf-slider"
            type="range"
            min={0}
            max={100}
            value={perf.bgOpacity}
            onChange={(e) => setPerf({ bgOpacity: Number(e.target.value) })}
          />
        </label>
        <div className="perf-color-row">
          <label htmlFor="perf-color">Color del texto</label>
          <input
            id="perf-color"
            type="color"
            value={perf.textColor}
            onChange={(e) => setPerf({ textColor: e.target.value.toUpperCase() })}
          />
        </div>

        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.autoLaunchElevated}
            onChange={(e) => set('autoLaunchElevated', e.target.checked)}
          />
          Iniciar con Windows como administrador
        </label>
        <p className="settings-hint">
          Los FPS y la temperatura de CPU necesitan permisos de administrador (es una restricción de
          Windows); sin ellos se muestran como «—». Esta opción crea una tarea programada elevada
          (pide confirmación UAC una sola vez) y requiere tener activo «Iniciar con Windows» en{' '}
          <Link to="/ajustes/general">General</Link>.
        </p>
      </fieldset>

      <fieldset>
        <legend>Buffer y formato de salida</legend>
        <label>
          Buffer de repetición
          <select
            value={settings.recordingBuffer}
            onChange={(e) =>
              set('recordingBuffer', e.target.value as CaptureSettings['recordingBuffer'])
            }
          >
            <option value="memory">Memoria (recomendado)</option>
            <option value="disk">Disco</option>
          </select>
        </label>
        <p className="settings-hint">
          Hoy el buffer siempre reside en RAM; la opción a disco queda preparada a futuro.
        </p>
        <label>
          Relación de aspecto
          <select
            value={settings.aspectRatio}
            onChange={(e) => set('aspectRatio', e.target.value as CaptureSettings['aspectRatio'])}
          >
            <option value="game">Aspecto del juego</option>
            <option value="stretch169">Estirar a 16:9</option>
            <option value="bars169">16:9 con barras negras</option>
            <option value="crop169">Recortar a 16:9</option>
          </select>
        </label>
      </fieldset>
    </SeccionForm>
  );
}
