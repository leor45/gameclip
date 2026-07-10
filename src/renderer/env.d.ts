/// <reference types="vite/client" />

import type { GameclipApi } from '@shared/ipc';

declare global {
  interface Window {
    gameclip: GameclipApi;
  }
}

export {};
