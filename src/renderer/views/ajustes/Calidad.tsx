import { useEffect, useState } from 'react';
import {
  CAPTURE_FPS_VALUES,
  type CaptureFps,
  type CaptureSettings,
  type EncoderInfo,
  type OutputResolution,
} from '@shared/capture';
import { SeccionForm } from './SeccionForm';
import { useCaptureSettings } from './useCaptureSettings';

interface Preset {
  id: string;
  nombre: string;
  descripcion: string;
  resolution: OutputResolution;
  fps: CaptureFps;
  bitrateMbps: number;
}

const PRESETS: Preset[] = [
  {
    id: 'baja',
    nombre: 'Baja',
    descripcion: '720p · 30 FPS · 5 Mbps',
    resolution: '720p',
    fps: 30,
    bitrateMbps: 5,
  },
  {
    id: 'estandar',
    nombre: 'Estándar',
    descripcion: '720p · 60 FPS · 10 Mbps',
    resolution: '720p',
    fps: 60,
    bitrateMbps: 10,
  },
  {
    id: 'alta',
    nombre: 'Alta',
    descripcion: '1080p · 60 FPS · 15 Mbps',
    resolution: '1080p',
    fps: 60,
    bitrateMbps: 15,
  },
];

const BITRATE_OPCIONES_MBPS = [3, 5, 7, 10, 15, 20, 25, 30, 50, 70, 100];

function presetActivo(settings: CaptureSettings): string {
  const match = PRESETS.find(
    (p) =>
      p.resolution === settings.resolution &&
      p.fps === settings.fps &&
      p.bitrateMbps === settings.bitrateMbps,
  );
  return match?.id ?? 'personalizada';
}

export default function AjustesCalidad() {
  const { settings, set, save, saving, saved } = useCaptureSettings();
  const [encoders, setEncoders] = useState<EncoderInfo[]>([]);

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getEncoders().then((e) => {
      if (vivo) setEncoders(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) return <p className="placeholder">Cargando…</p>;

  const activo = presetActivo(settings);

  function aplicarPreset(preset: Preset) {
    set('resolution', preset.resolution);
    set('fps', preset.fps);
    set('bitrateMbps', preset.bitrateMbps);
  }

  return (
    <SeccionForm saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend>Preset de calidad</legend>
        <div className="quality-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={activo === preset.id ? 'quality-preset active' : 'quality-preset'}
              onClick={() => aplicarPreset(preset)}
            >
              <strong>{preset.nombre}</strong>
              <span>{preset.descripcion}</span>
            </button>
          ))}
          <button
            type="button"
            className={activo === 'personalizada' ? 'quality-preset active' : 'quality-preset'}
            disabled
          >
            <strong>Personalizada</strong>
            <span>Ajusta cada valor manualmente</span>
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Ajustes detallados</legend>
        <label>
          Resolución
          <select
            value={settings.resolution}
            onChange={(e) => set('resolution', e.target.value as OutputResolution)}
          >
            <option value="native">Nativa del monitor</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
          </select>
        </label>
        <label>
          FPS
          <select
            value={settings.fps}
            onChange={(e) => set('fps', Number(e.target.value) as CaptureFps)}
          >
            {CAPTURE_FPS_VALUES.map((fps) => (
              <option key={fps} value={fps}>
                {fps}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bitrate
          <select
            value={settings.bitrateMbps}
            onChange={(e) => set('bitrateMbps', Number(e.target.value))}
          >
            <option value={0}>Automático (por calidad)</option>
            {BITRATE_OPCIONES_MBPS.map((mbps) => (
              <option key={mbps} value={mbps}>
                {mbps} Mbps
              </option>
            ))}
          </select>
        </label>
        {settings.bitrateMbps === 0 && (
          <label>
            Calidad
            <select
              value={settings.quality}
              onChange={(e) => set('quality', e.target.value as CaptureSettings['quality'])}
            >
              <option value="high">Alta</option>
              <option value="higher">Muy alta</option>
              <option value="lossless">Sin pérdida</option>
            </select>
          </label>
        )}
        <label>
          Encoder
          <select value={settings.encoderId} onChange={(e) => set('encoderId', e.target.value)}>
            <option value="">Automático</option>
            {encoders.map((enc) => (
              <option key={enc.id} value={enc.id}>
                {enc.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </SeccionForm>
  );
}
