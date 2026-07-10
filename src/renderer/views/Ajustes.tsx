import { useEffect, useState, type FormEvent } from 'react';
import {
  REPLAY_SECONDS_MAX,
  REPLAY_SECONDS_MIN,
  type CaptureSettings,
  type EncoderInfo,
} from '@shared/capture';

export default function Ajustes() {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [encoders, setEncoders] = useState<EncoderInfo[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      window.gameclip.capture.getSettings(),
      window.gameclip.capture.getEncoders(),
    ]).then(([s, e]) => {
      if (!vivo) return;
      setSettings(s);
      setEncoders(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!settings) {
    return (
      <section>
        <h1>Ajustes</h1>
        <p className="placeholder">Cargando…</p>
      </section>
    );
  }

  function set<K extends keyof CaptureSettings>(key: K, value: CaptureSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setGuardado(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setGuardando(true);
    try {
      const applied = await window.gameclip.capture.setSettings(settings);
      setSettings(applied);
      setGuardado(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <h1>Ajustes</h1>
      <form className="settings-form" onSubmit={onSubmit}>
        <fieldset>
          <legend>Calidad de grabación</legend>
          <label>
            Resolución
            <select
              value={settings.resolution}
              onChange={(e) => set('resolution', e.target.value as CaptureSettings['resolution'])}
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
              onChange={(e) => set('fps', Number(e.target.value) as CaptureSettings['fps'])}
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
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
          <label>
            Encoder
            <select
              value={settings.encoderId}
              onChange={(e) => set('encoderId', e.target.value)}
            >
              <option value="">Automático</option>
              {encoders.map((enc) => (
                <option key={enc.id} value={enc.id}>
                  {enc.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Clip retroactivo</legend>
          <label>
            Duración del buffer (segundos)
            <input
              type="number"
              min={REPLAY_SECONDS_MIN}
              max={REPLAY_SECONDS_MAX}
              value={settings.replaySeconds}
              onChange={(e) => set('replaySeconds', Number(e.target.value))}
            />
          </label>
          <label>
            Hotkey para guardar clip
            <input
              type="text"
              value={settings.replayHotkey}
              onChange={(e) => set('replayHotkey', e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>Audio</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.micEnabled}
              onChange={(e) => set('micEnabled', e.target.checked)}
            />
            Capturar micrófono
          </label>
        </fieldset>

        <div className="settings-actions">
          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar ajustes'}
          </button>
          {guardado && <span className="settings-saved">Ajustes guardados ✓</span>}
        </div>
      </form>
    </section>
  );
}
