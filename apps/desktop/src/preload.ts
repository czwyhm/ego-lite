import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopFinding, DesktopHostConnection, DesktopReport, DesktopTarget, DesktopTrafficEvent } from './backend.js';

const api = {
  listTargets: (): Promise<readonly DesktopTarget[]> => ipcRenderer.invoke('desktop:targets:list'),
  listTraffic: (): Promise<readonly DesktopTrafficEvent[]> => ipcRenderer.invoke('desktop:traffic:list'),
  listFindings: (): Promise<readonly DesktopFinding[]> => ipcRenderer.invoke('desktop:findings:list'),
  listReports: (): Promise<readonly DesktopReport[]> => ipcRenderer.invoke('desktop:reports:list'),
  listHostConnections: (): Promise<readonly DesktopHostConnection[]> => ipcRenderer.invoke('desktop:host-connections:list'),
};

contextBridge.exposeInMainWorld('egoDesktop', api);

export type EgoDesktopApi = typeof api;
