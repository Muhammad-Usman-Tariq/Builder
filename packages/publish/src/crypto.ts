import crypto from "node:crypto";

/**
 * Resolves a 32-byte Buffer encryption key from provided key or process.env.ENCRYPTION_KEY.
 */
function resolveKey(customKey?: string): Buffer {
  const rawKey = customKey || process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY environment variable is missing.");
  }

  // Attempt base64 first
  try {
    const b64 = Buffer.from(rawKey, "base64");
    if (b64.length === 32) return b64;
  } catch {}

  // Attempt hex
  try {
    const hex = Buffer.from(rawKey, "hex");
    if (hex.length === 32) return hex;
  } catch {}

  // Attempt utf-8 padded/hashed
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts plaintext using AES-256-GCM with authentication tag and random IV.
 * Produces format: `${ivHex}:${authTagHex}:${cipherHex}`.
 */
export function encryptSecret(plaintext: string, customKey?: string): string {
  const key = resolveKey(customKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts ciphertext encrypted with AES-256-GCM.
 * Validates integrity via the GCM authentication tag.
 */
export function decryptSecret(ciphertext: string, customKey?: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format. Expected iv:authTag:encryptedHex");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid ciphertext parts.");
  }

  const key = resolveKey(customKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
