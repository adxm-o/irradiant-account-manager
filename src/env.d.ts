/// <reference types="vite/client" />

import type { IrradiantApi } from '../electron/preload';

declare global {
  interface Window {
    irradiant: IrradiantApi;
  }
}

export {};
