/* ============================================================
   VoltAIMart — encryption at rest for stored API keys.
   Provider API keys and the web-search key are encrypted with
   AES-256-GCM before being written to server/data/db.json, using
   a key derived from process.env.ENCRYPTION_KEY. Set that env
   var to a long random string in production — the fallback here
   is fine for local demoing only (same pattern as JWT_SECRET in
   server/middleware/auth.js).

   Encrypted values are stored as { enc: true, iv, tag, data }
   (base64). decryptSecret() also accepts a plain string so
   values saved before encryption existed keep working — they get
   re-encrypted automatically the next time they're saved.
   ============================================================ */
const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "voltaimart-dev-encryption-key-change-me";
const KEY = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest(); // 32 bytes for AES-256

function encryptSecret(plain){
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: true,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptSecret(value){
  if (!value) return "";
  if (typeof value === "string") return value; // legacy plaintext, pre-encryption
  try {
    const iv = Buffer.from(value.iv, "base64");
    const tag = Buffer.from(value.tag, "base64");
    const data = Buffer.from(value.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch (e){
    console.error("Failed to decrypt a stored secret — it may have been saved with a different ENCRYPTION_KEY.", e.message);
    return "";
  }
}

module.exports = { encryptSecret, decryptSecret };
