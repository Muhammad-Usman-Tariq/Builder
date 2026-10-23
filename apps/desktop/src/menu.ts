import type { App, Shell, MenuItemConstructorOptions } from "electron";
import { isSafeExternalUrl } from "./security";

export function createApplicationMenuTemplate(
  app: App,
  shell: Shell,
  baseAppUrl: string
): MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name || "Builder",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+D",
          click: (_menuItem, browserWindow) => {
            if (browserWindow && typeof (browserWindow as any).loadURL === "function") {
              (browserWindow as any).loadURL(baseAppUrl);
            }
          },
        },
        { type: "separator" as const },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
    {
      role: "help" as const,
      submenu: [
        {
          label: "Builder Docs",
          click: async () => {
            const docsUrl = `${baseAppUrl}/docs`;
            if (isSafeExternalUrl(docsUrl)) {
              await shell.openExternal(docsUrl);
            }
          },
        },
        {
          label: "GitHub Repository",
          click: async () => {
            const repoUrl = "https://github.com";
            if (isSafeExternalUrl(repoUrl)) {
              await shell.openExternal(repoUrl);
            }
          },
        },
      ],
    },
  ];

  return template;
}
