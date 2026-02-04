import crypto from 'crypto';

// Server-side secret for HMAC hashing of API keys
// MUST be set in .env.local
const API_KEY_HASH_SECRET = process.env.API_KEY_HASH_SECRET;

/**
 * Computes a secure HMAC-SHA256 hash of the API key.
 * This ensures that even if the database is leaked, keys cannot be easily brute-forced.
 */
export function hashApiKey(apiKey: string): string {
  if (!API_KEY_HASH_SECRET) {
    throw new Error('Missing API_KEY_HASH_SECRET environment variable');
  }

  return crypto
    .createHmac('sha256', API_KEY_HASH_SECRET)
    .update(apiKey)
    .digest('hex');
}

/**
 * Generates a new random API key and its hash.
 * 
 * Format: liq_[24_bytes_hex] (e.g., liq_a1b2c3...)
 * Returns:
 * - key: The full key to show ONCE to the user
 * - hash: The HMAC hash to store in the DB
 * - last4: The last 4 characters for display/reference
 */
export function generateApiKey(): { key: string; hash: string; last4: string } {
  // Generate 24 bytes of random data (48 hex chars)
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const key = `liq_${randomBytes}`;
  
  return {
    key,
    hash: hashApiKey(key),
    last4: key.slice(-4),
  };
}
