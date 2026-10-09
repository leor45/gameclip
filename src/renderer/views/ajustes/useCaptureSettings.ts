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
  /**
   * Claves editadas en la sección y aún no guardadas, con un contador de ediciones: al volver de un
   * guardado solo se dan por guardadas las que no se tocaron mientras tanto.
   */
  const editadas = useRef(new Map<keyof CaptureSettings, number>());

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
        for (const clave of editadas.current.keys()) {
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
    editadas.current.set(key, (editadas.current.get(key) ?? 0) + 1);
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!settings) return;
    // Foto de lo que se manda: clave → nº de ediciones en ese momento.
    const enviadas = new Map(editadas.current);
    if (enviadas.size === 0) {
      setSaved(true);
      return;
    }
    const parcial: Partial<CaptureSettings> = {};
    for (const clave of enviadas.keys()) (parcial as Record<string, unknown>)[clave] = settings[clave];
    setSaving(true);
    try {
      const applied = await window.gameclip.capture.setSettings(parcial);
      // Guardar una clave de pipeline espera al rebuild (segundos) y los campos siguen editables: lo
      // que se tocó durante la espera sigue pendiente y conserva su valor local, igual que con
      // settings:changed. Antes se reemplazaba todo por `applied` y esas ediciones se perdían.
      for (const [clave, version] of enviadas) {
        if (editadas.current.get(clave) === version) editadas.current.delete(clave);
      }
      setSettings((prev) => {
        if (!prev) return applied;
        const next = { ...applied };
        for (const clave of editadas.current.keys()) {
          (next as Record<string, unknown>)[clave] = prev[clave];
        }
        return next;
      });
      setSaved(editadas.current.size === 0);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return { settings, set, save, saving, saved };
}
