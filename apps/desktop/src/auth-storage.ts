import * as electronModule from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

function getElectronModule(): any {
  return typeof electronModule === "object" ? electronModule : null;
}

function getStoragePath(): string {
  try {
    const app = getElectronModule()?.app;
    if (app && typeof app.getPath === "function") {
      return path.join(app.getPath("userData"), "auth.enc");
    }
  } catch {}
  return path.join(process.cwd(), ".auth.enc");
}

/**
 * Stores the user's login session token in the OS keychain using Electron safeStorage.
 * Architecture Section 12.2 and Milestone M11.
 */
export function saveToken(token: string): boolean {
  try {
    const safeStorage = getElectronModule()?.safeStorage;
    if (!safeStorage || !safeStorage.isEncryptionAvailable || !safeStorage.isEncryptionAvailable()) {
      console.warn("[safeStorage] OS keychain encryption is unavailable");
      return false;
    }
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(getStoragePath(), encrypted);
    return true;
  } catch (err) {
    console.error("[safeStorage] Failed to encrypt and store auth token:", err);
    return false;
  }
}

/**
 * Retrieves and decrypts the user's login session token from the OS keychain.
 */
export function getToken(): string | null {
  try {
    const filePath = getStoragePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const safeStorage = getElectronModule()?.safeStorage;
    if (!safeStorage || !safeStorage.isEncryptionAvailable || !safeStorage.isEncryptionAvailable()) {
      console.warn("[safeStorage] OS keychain encryption is unavailable");
      return null;
    }
    const encrypted = fs.readFileSync(filePath);
    return safeStorage.decryptString(encrypted);
  } catch (err) {
    console.error("[safeStorage] Failed to decrypt auth token:", err);
    return null;
  }
}

/**
 * Removes the stored authentication token upon sign-out.
 */
export function clearToken(): void {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("[safeStorage] Failed to clear auth token file:", err);
  }
}

/**
 * Checks whether OS keychain encryption is supported on the current host.
 */
export function isEncryptionAvailable(): boolean {
  try {
    const safeStorage = getElectronModule()?.safeStorage;
    return !!safeStorage && typeof safeStorage.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}
