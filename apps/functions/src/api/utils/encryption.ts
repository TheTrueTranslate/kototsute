import crypto from "node:crypto";

type EncryptedPayload = {
  cipherText: string;
  iv: string;
  tag: string;
  version: number;
};

const getKey = () => {
  const raw = process.env.ASSET_LOCK_ENCRYPTION_KEY;
  if (!raw) throw new Error("ASSET_LOCK_ENCRYPTION_KEY is missing");
  return Buffer.from(raw, "base64");
};

export const encryptPayload = (plain: string): EncryptedPayload => {
  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    version: 1
  };
};

export const decryptPayload = (payload: EncryptedPayload): string => {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
};

export type { EncryptedPayload };
