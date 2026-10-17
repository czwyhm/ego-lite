import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesktopBackend } from './backend.js';

const backend = createDesktopBackend();
const currentDirectory = dirname(fileURLToPath(import.meta.url));

function registerReadOnlyHandlers(): void {
  ipcMain.handle('desktop:targets:list', () => backend.listTargets());
  ipcMain.handle('desktop:traffic:list', () => backend.listTraffic());
  ipcMain.handle('desktop:findings:list', () => backend.listFindings());
  ipcMain.handle('desktop:reports:list', () => backend.listReports());
  ipcMain.handle('desktop:host-connections:list', () => backend.listHostConnections());
}

function devServerUrl(): string | undefined {
  const value = process.env.EGO_DESKTOP_DEV_SERVER_URL;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      // Keep all Node and Electron capabilities behind the small preload API.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(currentDirectory, 'preload.cjs'),
    },
  });
  window.once('ready-to-show', () => window.show());
  const url = devServerUrl();
  if (url) void window.loadURL(url);
  else void window.loadFile(join(currentDirectory, 'renderer', 'index.html'));
  return window;
}

app.whenReady().then(() => {
  registerReadOnlyHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
