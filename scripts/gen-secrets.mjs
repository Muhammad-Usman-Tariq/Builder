import { randomBytes } from "node:crypto";

const authSecret = randomBytes(32).toString("base64");
const encryptionKey = randomBytes(32).toString("base64");

console.log("=== Builder Secret Generator ===");
console.log("Copy and paste these into your .env file:\n");
console.log(`AUTH_SECRET="${authSecret}"`);
console.log(`ENCRYPTION_KEY="${encryptionKey}"`);
console.log("\n================================");
