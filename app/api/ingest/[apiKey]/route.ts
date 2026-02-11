import { NextRequest } from 'next/server';
import { errorResponse, processIngestEvent } from '@/lib/ingest-core';

// Note: Using service role key for ingestion to bypass RLS for inserts
// and to query workspaces by hash.
export async function POST(
  req: NextRequest, 
  { params }: { params: Promise<{ apiKey: string }> }
) {
  const { apiKey: pathApiKey } = await params;

  // Support multiple auth methods:
  // 1. URL path: /api/ingest/[apiKey] (for provider webhooks)
  // 2. Header: Authorization: Bearer <key> (team/direct)
  // 3. Header: X-LanceIQ-Api-Key: <key>
  let apiKey = pathApiKey;

  if (!apiKey || apiKey === '_') {
    // Try header auth
    const authHeader = req.headers.get('authorization');
    const apiKeyHeader = req.headers.get('x-lanceiq-api-key');
    const apiKeyHeaderAlt = req.headers.get('x-api-key');

    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    } else if (apiKeyHeaderAlt) {
      apiKey = apiKeyHeaderAlt;
    }
  }

  if (!apiKey || apiKey === '_') {
    return errorResponse('Missing API Key', 400, 'missing_api_key');
  }

  return processIngestEvent(req, apiKey);
}
