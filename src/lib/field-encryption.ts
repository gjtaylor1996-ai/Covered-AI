import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set — it encrypts right-to-work data at rest. See .env.example."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** AES-256-GCM. Output: enc:v1:<iv>:<authTag>:<ciphertext>, each base64. */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Values without the prefix are legacy plaintext from before encryption was added. */
export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(":");
  if (!iv || !tag || ciphertext === undefined) {
    throw new Error("Malformed encrypted field.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : encryptField(value);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : decryptField(value);
}
