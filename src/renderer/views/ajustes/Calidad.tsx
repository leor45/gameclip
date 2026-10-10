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
import Select from '../../components/Select';

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
    <SeccionForm titulo="Calidad" saving={saving} saved={saved} onGuardar={() => void save()}>
      <fieldset>
        <legend className="gc-label">Preset de calidad</legend>
        <div className="settings-cards is-four">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={activo === preset.id ? 'settings-card active' : 'settings-card'}
              aria-pressed={activo === preset.id}
              onClick={() => aplicarPreset(preset)}
            >
              <strong>{preset.nombre}</strong>
              <span className="settings-card-desc">{preset.descripcion}</span>
            </button>
          ))}
          <button
            type="button"
            className={activo === 'personalizada' ? 'settings-card active' : 'settings-card'}
            aria-pressed={activo === 'personalizada'}
            disabled
          >
            <strong>Personalizada</strong>
            <span className="settings-card-desc">Ajusta cada valor manualmente</span>
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="gc-label">Ajustes detallados</legend>
        <div className="settings-fields is-three">
          <label>
            Resolución
            <Select<OutputResolution>
              value={settings.resolution}
              onChange={(v) => set('resolution', v)}
              options={[
                { value: 'native', label: 'Nativa del monitor' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
              ]}
            />
          </label>
          <label>
            FPS
            <Select<CaptureFps>
              value={settings.fps}
              onChange={(v) => set('fps', v)}
              options={CAPTURE_FPS_VALUES.map((fps) => ({ value: fps, label: String(fps) }))}
            />
          </label>
          <label>
            Bitrate
            <Select
              value={settings.bitrateMbps}
              onChange={(v) => set('bitrateMbps', v)}
              options={[
                { value: 0, label: 'Automático (por calidad)' },
                ...BITRATE_OPCIONES_MBPS.map((mbps) => ({ value: mbps, label: `${mbps} Mbps` })),
              ]}
            />
          </label>
          {settings.bitrateMbps === 0 && (
            <label>
              Calidad
              <Select<CaptureSettings['quality']>
                value={settings.quality}
                onChange={(v) => set('quality', v)}
                options={[
                  { value: 'high', label: 'Alta' },
                  { value: 'higher', label: 'Muy alta' },
                  { value: 'lossless', label: 'Sin pérdida' },
                ]}
              />
            </label>
          )}
          <label>
            Encoder
            <Select
              value={settings.encoderId}
              onChange={(v) => set('encoderId', v)}
              options={[
                { value: '', label: 'Automático' },
                ...encoders.map((enc) => ({ value: enc.id, label: enc.name })),
              ]}
            />
          </label>
        </div>
      </fieldset>
    </SeccionForm>
  );
}
