import crypto from "node:crypto";

interface EncryptedValue {
  iv: string;
  tag: string;
  value: string;
}

function getKey() {
  const secret = process.env.APP_MASTER_KEY ?? "change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64")
  } satisfies EncryptedValue);
}

export function decryptSecret(payload?: string) {
  if (!payload) return undefined;
  const parsed = JSON.parse(payload) as EncryptedValue;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.value, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
