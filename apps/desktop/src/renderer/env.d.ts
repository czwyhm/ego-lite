import type { EgoDesktopApi } from '../preload.js';

declare global {
  interface Window {
    egoDesktop: EgoDesktopApi;
  }
}

export {};
