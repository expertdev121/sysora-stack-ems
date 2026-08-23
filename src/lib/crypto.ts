import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for shared tool credentials.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding garbage. The key comes from CREDENTIALS_ENCRYPTION_KEY and is
 * deliberately NOT stored in Postgres — a database dump, a backup, or a stray
 * `select *` in the SQL editor therefore yields ciphertext and nothing more.
 *
 * Format: "v1.<iv>.<authTag>.<ciphertext>", each part base64url.
 * The version prefix exists so the key can be rotated later without guessing
 * how old rows were encrypted.
 *
 * Server-only. Importing this into a client component would ship the key.
 */

const VERSION = "v1";

function encryptionKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  // A proper 32-byte base64 key is used as-is. Anything else is hashed to 32
  // bytes so a passphrase still produces a valid key rather than a crash.
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  if (typeof window !== "undefined") {
    throw new Error("encryptSecret must never run in the browser");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  if (typeof window !== "undefined") {
    throw new Error("decryptSecret must never run in the browser");
  }

  const [version, ivPart, tagPart, dataPart] = payload.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Stored secret is not in a format this build understands");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the key is configured, so the UI can explain itself rather than throw. */
export function encryptionConfigured(): boolean {
  return Boolean(process.env.CREDENTIALS_ENCRYPTION_KEY);
}
