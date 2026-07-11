import { useCallback, useEffect, useState } from 'react';
import type { CaptureSettings } from '@shared/capture';

/**
 * Carga y guarda los ajustes de captura. Cada sección de Ajustes monta su propia instancia
 * del hook: cada una carga su copia de `settings` y guarda de forma independiente.
 */
export function useCaptureSettings() {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getSettings().then((s) => {
      if (vivo) setSettings(s);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const set = useCallback(<K extends keyof CaptureSettings>(key: K, value: CaptureSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const applied = await window.gameclip.capture.setSettings(settings);
      setSettings(applied);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return { settings, set, save, saving, saved };
}
