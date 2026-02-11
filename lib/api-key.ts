import crypto from 'crypto';

// Server-side secret for HMAC hashing of API keys
// MUST be set in .env.local
export function hashApiKey(apiKey: string): string {
  const secret = process.env.API_KEY_HASH_SECRET;
  if (!secret) {
    throw new Error('Missing API_KEY_HASH_SECRET environment variable');
  }

  return crypto
    .createHmac('sha256', secret)
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
