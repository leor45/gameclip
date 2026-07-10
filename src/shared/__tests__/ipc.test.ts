import { describe, expect, it } from 'vitest';
import { IpcChannel } from '../ipc';

describe('contrato IPC', () => {
  it('los nombres de canal son únicos', () => {
    const names = Object.values(IpcChannel);
    expect(new Set(names).size).toBe(names.length);
  });

  it('los canales siguen el formato dominio:acción', () => {
    for (const name of Object.values(IpcChannel)) {
      expect(name).toMatch(/^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$/);
    }
  });
});
