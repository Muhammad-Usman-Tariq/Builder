import { app, BrowserWindow, Menu, shell, ipcMain } from "electron";
import * as path from "node:path";
import { parseDeepLink, findDeepLinkInArgv, buildEditorUrl } from "./deep-link";
import { isSafeExternalUrl, isAllowedAppUrl } from "./security";
import { resolveAppUrl } from "./url-resolver";
import { renderFallbackHtml, renderMissingUrlHtml } from "./fallback";
import { createApplicationMenuTemplate } from "./menu";

// Base URL of the Builder web app
const { appUrl: baseAppUrl, error: appUrlError } = resolveAppUrl({
  isPackaged: app.isPackaged,
});

let mainWindow: BrowserWindow | null = null;
let pendingDeepLinkUrl: string | null = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Protocol registration: builder://
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("builder", process.execPath, [path.resolve(process.argv[1] || "")]);
    }
  } else {
    app.setAsDefaultProtocolClient("builder");
  }

  // Handle second-instance launch (Windows/Linux deep link invocation)
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }

    const deepLink = findDeepLinkInArgv(commandLine);
    if (deepLink) {
      navigateDeepLink(deepLink);
    }
  });

  // Handle macOS deep link invocation
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow && mainWindow.isDestroyed() === false) {
      navigateDeepLink(url);
    } else {
      pendingDeepLinkUrl = url;
    }
  });

  app.whenReady().then(() => {
    if (process.env.SENTRY_DSN) {
      console.log(`[Sentry] Initialized desktop error monitoring (env: ${process.env.NODE_ENV || "development"})`);
    }

    setupIpcHandlers();
    createWindow();

    // Check startup argv for deep link
    const initialDeepLink = findDeepLinkInArgv(process.argv) || pendingDeepLinkUrl;
    if (initialDeepLink) {
      navigateDeepLink(initialDeepLink);
      pendingDeepLinkUrl = null;
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Builder",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Set native application menu
  const menuTemplate = createApplicationMenuTemplate(app, shell, baseAppUrl || "");
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // Deny window opening (target="_blank"), route safe links to external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  // Intercept in-page navigations to external origins
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (baseAppUrl && !isAllowedAppUrl(url, baseAppUrl)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        shell.openExternal(url).catch(() => {});
      }
    }
  });

  // Handle network failure or offline state
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    // Error code -3 is ABORTED (e.g. redirected or cancelled), don't show fallback for that
    if (errorCode !== -3 && mainWindow && !mainWindow.isDestroyed()) {
      if (errorDescription === "ERR_INVALID_URL" || !baseAppUrl) {
        const missingHtml = renderMissingUrlHtml(appUrlError || "Builder address is not configured — set APP_URL");
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(missingHtml)}`);
      } else {
        const fallbackHtml = renderFallbackHtml(validatedURL || baseAppUrl, errorDescription);
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (!baseAppUrl) {
    const missingHtml = renderMissingUrlHtml(appUrlError || "Builder address is not configured — set APP_URL");
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(missingHtml)}`);
  } else {
    mainWindow.loadURL(baseAppUrl).catch(() => {
      // Caught by did-fail-load
    });
  }
}

function navigateDeepLink(rawUrl: string): void {
  if (!baseAppUrl) return;
  const result = parseDeepLink(rawUrl);
  if (!result || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const editorUrl = buildEditorUrl(baseAppUrl, result.siteId);
  mainWindow.loadURL(editorUrl).catch(() => {});
}

function setupIpcHandlers(): void {
  ipcMain.handle("desktop:get-info", () => ({
    isDesktop: true,
    platform: process.platform,
    version: app.getVersion(),
  }));

  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      throw new Error(`Refusing to open unsafe URL: ${url}`);
    }
    await shell.openExternal(url);
  });

  ipcMain.handle("desktop:save-token", async (_event, token: string) => {
    const { saveToken } = await import("./auth-storage");
    return saveToken(token);
  });

  ipcMain.handle("desktop:get-token", async () => {
    const { getToken } = await import("./auth-storage");
    return getToken();
  });

  ipcMain.handle("desktop:clear-token", async () => {
    const { clearToken } = await import("./auth-storage");
    clearToken();
  });
}
