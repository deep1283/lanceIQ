import { NextRequest } from 'next/server';
import { errorResponse, processIngestEvent } from '@/lib/ingest-core';

// Header-based ingestion endpoint.
// Use this for environments where putting secrets in the URL path is undesirable.
// Note: Most webhook providers (Stripe/Razorpay) cannot send custom auth headers, so
// `/api/ingest/[apiKey]` remains the primary provider-facing endpoint.

export async function POST(req: NextRequest) {
  const apiKey = getApiKeyFromHeaders(req);
  if (!apiKey) {
    return errorResponse('Missing API key', 401, 'missing_api_key');
  }
  return processIngestEvent(req, apiKey);
}

function getApiKeyFromHeaders(req: NextRequest): string | null {
  const headerKey = req.headers.get('x-lanceiq-api-key') || req.headers.get('x-api-key');
  if (headerKey) return headerKey;

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}
