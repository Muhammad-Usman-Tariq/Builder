import { contextBridge, ipcRenderer } from "electron";

export interface BuilderDesktopBridge {
  isDesktop: true;
  platform: string;
  openExternal: (url: string) => Promise<void>;
  getInfo: () => Promise<{ isDesktop: boolean; platform: string; version: string }>;
  onDeepLink: (callback: (siteId: string) => void) => () => void;
  saveToken: (token: string) => Promise<boolean>;
  getToken: () => Promise<string | null>;
  clearToken: () => Promise<void>;
}

const desktopApi: BuilderDesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
  getInfo: () => ipcRenderer.invoke("desktop:get-info"),
  saveToken: (token: string) => ipcRenderer.invoke("desktop:save-token", token),
  getToken: () => ipcRenderer.invoke("desktop:get-token"),
  clearToken: () => ipcRenderer.invoke("desktop:clear-token"),
  onDeepLink: (callback: (siteId: string) => void) => {
    const handler = (_event: unknown, siteId: string) => callback(siteId);
    ipcRenderer.on("desktop:navigate-site", handler);
    return () => {
      ipcRenderer.removeListener("desktop:navigate-site", handler);
    };
  },
};

try {
  contextBridge.exposeInMainWorld("builderDesktop", desktopApi);
} catch {
  // In non-sandboxed or direct test environments
  (window as unknown as { builderDesktop: BuilderDesktopBridge }).builderDesktop = desktopApi;
}
