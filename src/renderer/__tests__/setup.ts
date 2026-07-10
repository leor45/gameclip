import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Sin globals de Vitest, Testing Library no registra su auto-cleanup.
afterEach(() => {
  cleanup();
  window.location.hash = '';
  localStorage.clear();
});

// El preload no existe en jsdom: se simula la API expuesta en window.gameclip.
Object.defineProperty(window, 'gameclip', {
  writable: true,
  value: {
    getAppVersion: vi.fn().mockResolvedValue({ version: '0.0.0-test', electron: '29.3.1' }),
  },
});
