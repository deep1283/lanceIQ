import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended for GCM

function getMasterKey(): Buffer {
  const hexKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!hexKey) {
    throw new Error('Server Configuration Error: ENCRYPTION_MASTER_KEY is missing.');
  }
  if (hexKey.length !== 64) { // 32 bytes * 2 hex chars
    throw new Error('Server Configuration Error: ENCRYPTION_MASTER_KEY must be a 32-byte hex string.');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts text using AES-256-GCM.
 * Returns format: "iv:authTag:encryptedContent" (hex encoded parts)
 */
export function encrypt(text: string): string {
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts text using AES-256-GCM.
 * Expects format: "iv:authTag:encryptedContent"
 */
export function decrypt(encryptedText: string): string {
  const masterKey = getMasterKey();
  const parts = encryptedText.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format.');
  }
  
  const [ivHex, authTagHex, contentHex] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(contentHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
