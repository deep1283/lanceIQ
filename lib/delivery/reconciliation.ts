import { decrypt } from '@/lib/encryption';

const SUPPORTED_RECONCILIATION_PROVIDERS = ['stripe', 'razorpay', 'lemon_squeezy'] as const;
type SupportedProvider = (typeof SUPPORTED_RECONCILIATION_PROVIDERS)[number];

type ProviderIntegrationRow = {
  id: string;
  workspace_id: string;
  provider_type: string;
  config: Record<string, unknown> | null;
  credentials_encrypted: string | null;
  is_active: boolean | null;
  health_status: string | null;
  last_synced_at: string | null;
};

type ProviderObject = {
  externalId: string;
  objectType: string;
  summary: string | null;
  metadata: Record<string, unknown>;
};

type ProviderPullResult = {
  provider: SupportedProvider;
  integrationId: string;
  pulledCount: number;
  pulledIds: Set<string>;
  objects: ProviderObject[];
  ok: boolean;
  errorCode: string | null;
  error: string | null;
};

type EventRow = {
  id: string;
  provider_event_id: string | null;
  detected_provider: string | null;
  signature_status: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;

function normalizeProvider(value: string | null | undefined): SupportedProvider | null {
  if (!value) return null;
  if (value === 'stripe' || value === 'razorpay' || value === 'lemon_squeezy') {
    return value;
  }
  return null;
}

function timeoutMs() {
  const parsed = Number(process.env.RECONCILIATION_PROVIDER_TIMEOUT_MS || '');
  if (Number.isFinite(parsed) && parsed >= 1000) return Math.floor(parsed);
  return DEFAULT_TIMEOUT_MS;
}

function maybeDecrypt(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function parseCredentialBlob(value: string | null | undefined) {
  const decrypted = maybeDecrypt(value);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted) as Record<string, unknown>;
  } catch {
    return decrypted;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractStringCandidate(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function extractFirstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = extractStringCandidate(source[key]);
    if (value) return value;
  }
  return null;
}

function parseResponseArray(json: unknown): Array<Record<string, unknown>> {
  const root = asRecord(json);
  if (Array.isArray(root.data)) {
    return root.data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (Array.isArray(root.items)) {
    return root.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  if (Array.isArray(json)) {
    return json.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  }
  return [];
}

function toProviderObjects(items: Array<Record<string, unknown>>, fallbackType: string) {
  const objects: ProviderObject[] = [];
  for (const item of items) {
    const externalId = extractStringCandidate(item.id) || extractStringCandidate(item.external_id);
    if (!externalId) continue;

    const objectType =
      extractStringCandidate(item.object) ||
      extractStringCandidate(item.type) ||
      extractStringCandidate(item.event) ||
      fallbackType;

    const summary =
      extractStringCandidate(item.type) ||
      extractStringCandidate(item.event) ||
      extractStringCandidate(item.name) ||
      null;

    objects.push({
      externalId,
      objectType,
      summary,
      metadata: asRecord(item),
    });
  }
  return objects;
}

async function fetchProviderJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false as const,
        errorCode: `provider_http_${response.status}`,
        error: text.slice(0, 256) || `HTTP ${response.status}`,
        json: null,
      };
    }

    const json = text ? safeJsonParse(text) : null;
    if (!json) {
      return {
        ok: false as const,
        errorCode: 'provider_invalid_json',
        error: 'Provider response is not valid JSON.',
        json: null,
      };
    }

    return {
      ok: true as const,
      json,
      errorCode: null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false as const,
      errorCode: err instanceof Error && err.name === 'AbortError' ? 'provider_timeout' : 'provider_request_failed',
      error: err instanceof Error ? err.message.slice(0, 256) : 'Provider request failed.',
      json: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function pullStripe(integration: ProviderIntegrationRow, credentials: unknown): Promise<ProviderPullResult> {
  const config = asRecord(integration.config);
  const credentialRecord = asRecord(credentials);
  const token =
    (typeof credentials === 'string' ? credentials : null) ||
    extractFirstString(credentialRecord, ['apiKey', 'api_key', 'secret', 'token', 'bearerToken']) ||
    extractFirstString(config, ['apiKey', 'api_key', 'secret', 'token']);

  if (!token) {
    return {
      provider: 'stripe',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: 'provider_credentials_missing',
      error: 'Missing Stripe API token.',
    };
  }

  const url =
    extractFirstString(config, ['reconciliation_pull_url', 'pull_url', 'events_url']) ||
    'https://api.stripe.com/v1/events?limit=100';

  const response = await fetchProviderJson(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return {
      provider: 'stripe',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: response.errorCode,
      error: response.error,
    };
  }

  const objects = toProviderObjects(parseResponseArray(response.json), 'event');
  return {
    provider: 'stripe',
    integrationId: integration.id,
    pulledCount: objects.length,
    pulledIds: new Set(objects.map((item) => item.externalId)),
    objects,
    ok: true,
    errorCode: null,
    error: null,
  };
}

async function pullRazorpay(integration: ProviderIntegrationRow, credentials: unknown): Promise<ProviderPullResult> {
  const config = asRecord(integration.config);
  const credentialRecord = asRecord(credentials);
  const keyId =
    extractFirstString(credentialRecord, ['key_id', 'keyId', 'username', 'apiKey']) ||
    extractFirstString(config, ['key_id', 'keyId', 'username']);
  const keySecret =
    extractFirstString(credentialRecord, ['key_secret', 'keySecret', 'password', 'secret']) ||
    extractFirstString(config, ['key_secret', 'keySecret', 'password']);

  if (!keyId || !keySecret) {
    return {
      provider: 'razorpay',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: 'provider_credentials_missing',
      error: 'Missing Razorpay key credentials.',
    };
  }

  const url =
    extractFirstString(config, ['reconciliation_pull_url', 'pull_url', 'events_url']) ||
    'https://api.razorpay.com/v1/events?count=100';

  const basic = Buffer.from(`${keyId}:${keySecret}`, 'utf8').toString('base64');
  const response = await fetchProviderJson(url, {
    method: 'GET',
    headers: {
      authorization: `Basic ${basic}`,
    },
  });

  if (!response.ok) {
    return {
      provider: 'razorpay',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: response.errorCode,
      error: response.error,
    };
  }

  const objects = toProviderObjects(parseResponseArray(response.json), 'event');
  return {
    provider: 'razorpay',
    integrationId: integration.id,
    pulledCount: objects.length,
    pulledIds: new Set(objects.map((item) => item.externalId)),
    objects,
    ok: true,
    errorCode: null,
    error: null,
  };
}

async function pullLemonSqueezy(integration: ProviderIntegrationRow, credentials: unknown): Promise<ProviderPullResult> {
  const config = asRecord(integration.config);
  const credentialRecord = asRecord(credentials);
  const token =
    (typeof credentials === 'string' ? credentials : null) ||
    extractFirstString(credentialRecord, ['apiKey', 'api_key', 'token', 'bearerToken']) ||
    extractFirstString(config, ['apiKey', 'api_key', 'token']);

  if (!token) {
    return {
      provider: 'lemon_squeezy',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: 'provider_credentials_missing',
      error: 'Missing Lemon Squeezy API token.',
    };
  }

  const url =
    extractFirstString(config, ['reconciliation_pull_url', 'pull_url', 'orders_url']) ||
    'https://api.lemonsqueezy.com/v1/orders?page[size]=100';

  const response = await fetchProviderJson(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return {
      provider: 'lemon_squeezy',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: response.errorCode,
      error: response.error,
    };
  }

  const objects = toProviderObjects(parseResponseArray(response.json), 'order');
  return {
    provider: 'lemon_squeezy',
    integrationId: integration.id,
    pulledCount: objects.length,
    pulledIds: new Set(objects.map((item) => item.externalId)),
    objects,
    ok: true,
    errorCode: null,
    error: null,
  };
}

async function pullProvider(integration: ProviderIntegrationRow): Promise<ProviderPullResult> {
  const provider = normalizeProvider(integration.provider_type);
  if (!provider) {
    return {
      provider: 'stripe',
      integrationId: integration.id,
      pulledCount: 0,
      pulledIds: new Set(),
      objects: [],
      ok: false,
      errorCode: 'provider_not_supported',
      error: `Unsupported provider: ${integration.provider_type}`,
    };
  }

  const credentials = parseCredentialBlob(integration.credentials_encrypted);
  if (provider === 'stripe') return pullStripe(integration, credentials);
  if (provider === 'razorpay') return pullRazorpay(integration, credentials);
  return pullLemonSqueezy(integration, credentials);
}

async function persistProviderObjects(admin: any, integrationId: string, objects: ProviderObject[]) {
  if (!objects.length) return null;
  const nowIso = new Date().toISOString();
  const payload = objects.map((item) => ({
    integration_id: integrationId,
    external_id: item.externalId,
    object_type: item.objectType,
    summary: item.summary,
    metadata: item.metadata,
    last_seen_at: nowIso,
  }));

  const { error } = await admin
    .from('provider_objects')
    .upsert(payload, { onConflict: 'integration_id,external_id,object_type' });

  if (error) return 'provider_object_upsert_failed';
  return null;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function runProviderReconciliation(params: {
  admin: any;
  workspaceId: string;
  batchId?: string | null;
}) {
  const { admin, workspaceId, batchId } = params;

  const { data: integrations, error: integrationError } = await admin
    .from('provider_integrations')
    .select('id, workspace_id, provider_type, config, credentials_encrypted, is_active, health_status, last_synced_at')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .in('provider_type', [...SUPPORTED_RECONCILIATION_PROVIDERS]);

  if (integrationError) {
    return { error: 'provider_integrations_fetch_failed' as const };
  }

  let eventsQuery = admin
    .from('ingested_events')
    .select('id, provider_event_id, detected_provider, signature_status')
    .eq('workspace_id', workspaceId)
    .not('provider_event_id', 'is', null)
    .in('detected_provider', [...SUPPORTED_RECONCILIATION_PROVIDERS])
    .order('received_at', { ascending: false })
    .limit(5000);

  if (batchId) {
    eventsQuery = eventsQuery.eq('batch_id', batchId);
  }

  const { data: events, error: eventsError } = await eventsQuery;
  if (eventsError) {
    return { error: 'ingested_events_fetch_failed' as const };
  }

  const eventRows = (events || []) as EventRow[];
  const eventIds = eventRows.map((event) => event.id);

  const deliveryJobByEventId = new Set<string>();
  if (eventIds.length) {
    const { data: jobs } = await admin
      .from('delivery_jobs')
      .select('ingested_event_id')
      .eq('workspace_id', workspaceId)
      .in('ingested_event_id', eventIds);

    for (const row of jobs || []) {
      if (row.ingested_event_id) {
        deliveryJobByEventId.add(row.ingested_event_id);
      }
    }
  }

  const pullResults: ProviderPullResult[] = [];
  for (const integration of (integrations || []) as ProviderIntegrationRow[]) {
    const result = await pullProvider(integration);
    pullResults.push(result);
    if (result.ok) {
      const objectError = await persistProviderObjects(admin, integration.id, result.objects);
      if (objectError) {
        result.ok = false;
        result.errorCode = objectError;
        result.error = 'Failed to persist provider objects.';
      }
    }

    await admin
      .from('provider_integrations')
      .update({
        health_status: result.ok ? 'healthy' : 'degraded',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', integration.id);
  }

  const eventsByProvider = new Map<SupportedProvider, Map<string, EventRow>>();
  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    eventsByProvider.set(provider, new Map());
  }

  for (const event of eventRows) {
    const provider = normalizeProvider(event.detected_provider);
    if (!provider || !event.provider_event_id) continue;
    eventsByProvider.get(provider)?.set(event.provider_event_id, event);
  }

  const pulledByProvider = new Map<SupportedProvider, Set<string>>();
  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    pulledByProvider.set(provider, new Set());
  }
  for (const pull of pullResults) {
    if (!pull.ok) continue;
    pulledByProvider.set(pull.provider, pull.pulledIds);
  }

  let missingReceipts = 0;
  let missingDeliveries = 0;
  let failedVerifications = 0;
  let providerMismatches = 0;

  const perProvider: Array<Record<string, unknown>> = [];

  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    const providerEvents = eventsByProvider.get(provider) || new Map();
    const pulledIds = pulledByProvider.get(provider) || new Set();

    let providerMissingReceipts = 0;
    let providerMissingDeliveries = 0;

    for (const event of providerEvents.values()) {
      if (event.signature_status === 'failed') {
        failedVerifications += 1;
      }
      if (!pulledIds.size) continue;
      if (event.provider_event_id && !pulledIds.has(event.provider_event_id)) {
        providerMissingReceipts += 1;
      }
    }

    for (const pulledId of pulledIds) {
      const matchedEvent = providerEvents.get(pulledId);
      if (!matchedEvent) {
        providerMissingDeliveries += 1;
        continue;
      }
      if (!deliveryJobByEventId.has(matchedEvent.id)) {
        providerMissingDeliveries += 1;
      }
    }

    missingReceipts += providerMissingReceipts;
    missingDeliveries += providerMissingDeliveries;

    const pull = pullResults.find((item) => item.provider === provider);
    perProvider.push({
      provider,
      pull_ok: pull?.ok ?? false,
      pull_error_code: pull?.errorCode ?? null,
      pull_error: pull?.error ?? null,
      pulled_count: pulledIds.size,
      missing_receipts: providerMissingReceipts,
      missing_deliveries: providerMissingDeliveries,
      event_count: providerEvents.size,
    });
  }

  for (const event of eventRows) {
    const provider = normalizeProvider(event.detected_provider);
    if (!provider || !event.provider_event_id) continue;

    const foundIn = SUPPORTED_RECONCILIATION_PROVIDERS.filter((candidate) =>
      pulledByProvider.get(candidate)?.has(event.provider_event_id as string)
    );

    if (foundIn.length > 0 && !foundIn.includes(provider)) {
      providerMismatches += 1;
    }
  }

  const providerPullFailures = pullResults.filter((item) => !item.ok).length;
  const pulledTotal = pullResults.reduce((sum, item) => sum + item.pulledCount, 0);
  const discrepanciesFound =
    missingReceipts + missingDeliveries + failedVerifications + providerMismatches + providerPullFailures;

  return {
    error: null,
    itemsProcessed: eventRows.length + pulledTotal,
    discrepanciesFound,
    reportJson: {
      generated_at: new Date().toISOString(),
      counters: {
        events_considered: eventRows.length,
        provider_objects_pulled: pulledTotal,
      },
      discrepancy_counters: {
        missing_receipts: missingReceipts,
        missing_deliveries: missingDeliveries,
        failed_verifications: failedVerifications,
        provider_mismatches: providerMismatches,
        provider_pull_failures: providerPullFailures,
      },
      providers: perProvider,
      notes:
        discrepanciesFound > 0
          ? 'Discrepancies detected between provider pulls, LanceIQ receipts, and delivery records.'
          : 'No discrepancies detected.',
    },
  };
}

export const reconciliationTestUtils = {
  parseCredentialBlob,
  parseResponseArray,
  toProviderObjects,
};
