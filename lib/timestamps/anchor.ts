import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildRfc3161Request } from '@/lib/timestamps/rfc3161';

type AnchorResult = {
  transactionId: string;
  proofData: string;
};

function parseAuthHeader(value?: string) {
  if (!value) return null;
  const idx = value.indexOf(':');
  if (idx === -1) return null;
  const name = value.slice(0, idx).trim();
  const headerValue = value.slice(idx + 1).trim();
  if (!name || !headerValue) return null;
  return { name, value: headerValue };
}

function getTsaTimeoutMs() {
  const raw = process.env.TSA_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return 8000;
}

async function requestTimestampReceipt(hashedHex: string): Promise<AnchorResult> {
  const tsaUrl = process.env.TSA_URL;
  if (!tsaUrl) {
    throw new Error('Missing TSA_URL');
  }

  const { request, nonceHex } = buildRfc3161Request(hashedHex);
  const headers: Record<string, string> = {
    'Content-Type': 'application/timestamp-query',
  };

  const authHeader = parseAuthHeader(process.env.TSA_AUTH_HEADER);
  if (authHeader) {
    headers[authHeader.name] = authHeader.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTsaTimeoutMs());
  try {
    const response = await fetch(tsaUrl, {
      method: 'POST',
      headers,
      body: request,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TSA response ${response.status}: ${text}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const proofData = buffer.toString('base64');

    return {
      transactionId: nonceHex,
      proofData,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function anchorIngestedEvent(params: {
  workspaceId: string;
  ingestedEventId: string;
  rawBodySha256: string;
}) {
  try {
    const tsaUrl = process.env.TSA_URL;
    if (!tsaUrl) return;

    if (!params.rawBodySha256) return;

    const admin = createAdminClient();
    if (!admin) {
      console.error('Timestamp receipt skipped: missing Supabase admin credentials.');
      return;
    }

    const { data: existing, error: existingError } = await admin
      .from('timestamp_receipts')
      .select('id')
      .eq('resource_type', 'ingested_event')
      .eq('resource_id', params.ingestedEventId)
      .maybeSingle();

    if (!existingError && existing?.id) {
      return;
    }

    const { transactionId, proofData } = await requestTimestampReceipt(params.rawBodySha256);

    const { error } = await admin
      .from('timestamp_receipts')
      .insert({
        workspace_id: params.workspaceId,
        resource_type: 'ingested_event',
        resource_id: params.ingestedEventId,
        anchored_hash: params.rawBodySha256,
        transaction_id: transactionId,
        proof_data: proofData,
        tsa_url: process.env.TSA_URL,
        chain_name: null,
        block_height: null,
      });

    if (error) {
      console.error('Failed to insert timestamp receipt:', error);
    }
  } catch (err) {
    console.error('Timestamp receipt failed:', err);
  }
}
