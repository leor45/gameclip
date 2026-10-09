import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureSettings } from '@shared/capture';

/**
 * Carga y guarda los ajustes de captura. Cada sección de Ajustes monta su propia instancia
 * del hook: cada una carga su copia de `settings` y guarda de forma independiente.
 *
 * Guardar manda **solo los campos editados en la sección**, y la copia se mantiene al día con
 * `settings:changed` en los campos que no se han tocado. Antes se mandaba la copia entera cargada al
 * montar y pisaba lo cambiado mientras tanto por otras vías (la duración desde la barra superior, el
 * atajo del overlay, la reversión del auto-inicio elevado al cancelar el UAC).
 */
export function useCaptureSettings() {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** Claves editadas en la sección y aún no guardadas. */
  const editadas = useRef(new Set<keyof CaptureSettings>());

  useEffect(() => {
    let vivo = true;
    window.gameclip.capture.getSettings().then((s) => {
      if (vivo) setSettings(s);
    });
    // Lo que no se ha tocado aquí sigue al main; lo editado se respeta hasta guardar.
    const off = window.gameclip.capture.onSettingsChanged((remotos) => {
      setSettings((prev) => {
        if (!prev) return remotos;
        const next = { ...remotos };
        for (const clave of editadas.current) {
          (next as Record<string, unknown>)[clave] = prev[clave];
        }
        return next;
      });
    });
    return () => {
      vivo = false;
      off();
    };
  }, []);

  const set = useCallback(<K extends keyof CaptureSettings>(key: K, value: CaptureSettings[K]) => {
    editadas.current.add(key);
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!settings) return;
    const claves = [...editadas.current];
    if (claves.length === 0) {
      setSaved(true);
      return;
    }
    const parcial: Partial<CaptureSettings> = {};
    for (const clave of claves) (parcial as Record<string, unknown>)[clave] = settings[clave];
    setSaving(true);
    try {
      const applied = await window.gameclip.capture.setSettings(parcial);
      for (const clave of claves) editadas.current.delete(clave);
      setSettings(applied);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return { settings, set, save, saving, saved };
}
