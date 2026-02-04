import crypto from 'crypto';
import DodoPayments from 'dodopayments';

const DODO_API_URL = process.env.DODO_PAYMENTS_MODE === 'live' 
  ? 'https://api.dodopayments.com' 
  : 'https://test-api.dodopayments.com';

const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY!;
const DODO_WEBHOOK_SECRET = process.env.DODO_PAYMENTS_WEBHOOK_SECRET!;
const DODO_PRODUCT_ID = process.env.DODO_PRODUCT_ID!;

if (!DODO_API_KEY || !DODO_WEBHOOK_SECRET || !DODO_PRODUCT_ID) {
  console.warn('⚠️ Missing Dodo Payments environment variables');
}

let _dodo: DodoPayments | null = null;

export function getDodo(): DodoPayments {
  if (!_dodo) {
    _dodo = new DodoPayments({
      bearerToken: DODO_API_KEY,
      environment: process.env.DODO_PAYMENTS_MODE === 'live' ? 'live_mode' : 'test_mode',
    });
  }
  return _dodo;
}

// Backwards compatibility for existing routes
export const dodo = {
  get checkoutSessions() { return getDodo().checkoutSessions; },
  get customers() { return getDodo().customers; },
  get payments() { return getDodo().payments; },
  get webhooks() { return getDodo().webhooks; },
};

export interface CheckoutSessionParams {
  workspaceId: string;
  userId: string;
  email: string;
  returnUrl: string;
}

export async function createCheckoutSession(params: CheckoutSessionParams) {
  const { workspaceId, userId, email, returnUrl } = params;

  try {
    const response = await fetch(`${DODO_API_URL}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DODO_API_KEY}`
      },
      body: JSON.stringify({
        product_id: DODO_PRODUCT_ID,
        quantity: 1,
        payment_link: true, // Generate a payment link
        customer: {
          email: email,
          name: workspaceId // Storing workspace ID as name for reference, or passed in metadata
        },
        metadata: {
          workspace_id: workspaceId,
          user_id: userId
        },
        redirect_url: returnUrl
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dodo API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.payment_link || data.checkout_url || data.url;
  } catch (error) {
    console.error('Create Checkout Session Failed:', error);
    throw error;
  }
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  if (!DODO_WEBHOOK_SECRET) return false;
  if (!signature) return false;

  const normalized = normalizeSignature(signature);
  if (!normalized) return false;

  const hmac = crypto.createHmac('sha256', DODO_WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest('hex');
  
  if (normalized.length !== digest.length) return false;
  if (!isHex(normalized)) return false;

  return crypto.timingSafeEqual(Buffer.from(normalized, 'hex'), Buffer.from(digest, 'hex'));
}

function normalizeSignature(signature: string): string | null {
  const trimmed = signature.trim();
  if (!trimmed) return null;

  if (trimmed.includes('v1=')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    const v1 = parts.find((p) => p.startsWith('v1='));
    if (!v1) return null;
    return v1.slice(3);
  }

  return trimmed;
}

function isHex(input: string): boolean {
  return /^[0-9a-fA-F]+$/.test(input);
}
