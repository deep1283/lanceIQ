import { decrypt } from '@/lib/encryption';

const SUPPORTED_RECONCILIATION_PROVIDERS = ['stripe', 'razorpay', 'lemon_squeezy'] as const;
const DOWNSTREAM_GRACE_MS = 15 * 60 * 1000;

export const DOWNSTREAM_UNCONFIGURED_MESSAGE = 'Downstream activation status not configured.';

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
  providerPaymentId: string;
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

type ReceiptRow = {
  id: string;
  provider_payment_id: string | null;
  provider_event_id: string | null;
  detected_provider: string | null;
  signature_status: string | null;
  received_at: string | null;
};

type SnapshotRow = {
  id: string;
  provider: string;
  provider_payment_id: string;
  downstream_state: 'activated' | 'not_activated' | 'error';
  reason_code: string | null;
  observed_at: string;
};

type DeliveryStatus = {
  hasAny: boolean;
  hasCompleted: boolean;
  latestStatus: string | null;
};

type ReconciliationReasonCode =
  | 'provider_no_receipt'
  | 'delivery_failure'
  | 'failed_verification'
  | 'provider_mismatch'
  | 'confirmed_missing_activation'
  | 'downstream_error';

type CaseCandidate = {
  provider: SupportedProvider;
  providerPaymentId: string;
  reasonCode: ReconciliationReasonCode;
  severity: 'critical' | 'high' | 'medium' | 'low';
  graceUntil: string | null;
  maskedCustomerLabel: string | null;
  amountMinor: number | null;
  currency: string | null;
  details: Record<string, unknown>;
};

type ExistingCase = {
  id: string;
  workspace_id: string;
  provider: string;
  provider_payment_id: string;
  status: string;
  reason_code: string | null;
  severity: string | null;
  created_at: string;
};

type DownstreamStatusState =
  | 'healthy'
  | 'downstream_unconfigured'
  | 'pending_activation'
  | 'confirmed_missing_activation'
  | 'downstream_error';

type SignalState = 'healthy' | 'pending' | 'mismatch' | 'unknown';

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

function extractNestedString(source: Record<string, unknown>, path: string[]) {
  let cur: unknown = source;
  for (const segment of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return extractStringCandidate(cur);
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

function extractProviderPaymentId(item: Record<string, unknown>) {
  const dataObject = asRecord(item.data)?.object;
  const dataObjectRecord = asRecord(dataObject);
  return (
    extractFirstString(item, ['provider_payment_id', 'payment_id']) ||
    extractNestedString(item, ['data', 'object', 'payment_intent']) ||
    extractNestedString(item, ['data', 'object', 'payment_intent', 'id']) ||
    (dataObjectRecord?.object === 'payment_intent' ? extractStringCandidate(dataObjectRecord.id) : null) ||
    extractNestedString(item, ['payload', 'payment', 'entity', 'id']) ||
    extractNestedString(item, ['payload', 'payment_link', 'entity', 'payment_id']) ||
    extractNestedString(item, ['payload', 'invoice', 'entity', 'payment_id']) ||
    extractNestedString(item, ['payload', 'refund', 'entity', 'payment_id']) ||
    extractNestedString(item, ['data', 'attributes', 'order_id']) ||
    extractNestedString(item, ['attributes', 'identifier'])
    || extractNestedString(item, ['meta', 'custom_data', 'provider_payment_id'])
    || extractNestedString(item, ['data', 'id'])
    || extractNestedString(item, ['data', 'object', 'id'])
    || extractFirstString(item, ['id', 'external_id'])
  );
}

function toProviderObjects(items: Array<Record<string, unknown>>, fallbackType: string) {
  const objects: ProviderObject[] = [];
  for (const item of items) {
    const externalId = extractStringCandidate(item.id) || extractStringCandidate(item.external_id);
    const providerPaymentId = extractProviderPaymentId(item);
    if (!externalId || !providerPaymentId) continue;

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
      providerPaymentId,
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
    pulledIds: new Set(objects.map((item) => item.providerPaymentId)),
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
    pulledIds: new Set(objects.map((item) => item.providerPaymentId)),
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
    pulledIds: new Set(objects.map((item) => item.providerPaymentId)),
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
    metadata: {
      ...item.metadata,
      provider_payment_id: item.providerPaymentId,
    },
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

function makeJoinKey(provider: SupportedProvider, providerPaymentId: string) {
  return `${provider}:${providerPaymentId}`;
}

function severityForReason(reasonCode: ReconciliationReasonCode): 'critical' | 'high' | 'medium' | 'low' {
  if (reasonCode === 'failed_verification') return 'critical';
  if (reasonCode === 'provider_no_receipt') return 'high';
  if (reasonCode === 'provider_mismatch') return 'high';
  if (reasonCode === 'downstream_error') return 'high';
  if (reasonCode === 'delivery_failure') return 'medium';
  return 'medium';
}

function reasonPriority(reasonCode: ReconciliationReasonCode) {
  switch (reasonCode) {
    case 'failed_verification':
      return 100;
    case 'provider_mismatch':
      return 90;
    case 'provider_no_receipt':
      return 80;
    case 'delivery_failure':
      return 70;
    case 'downstream_error':
      return 60;
    case 'confirmed_missing_activation':
      return 50;
    default:
      return 0;
  }
}

function signalPriority(state: SignalState) {
  switch (state) {
    case 'mismatch':
      return 30;
    case 'pending':
      return 20;
    case 'healthy':
      return 10;
    default:
      return 0;
  }
}

function setSignalState(
  map: Map<string, SignalState>,
  key: string,
  nextState: SignalState
) {
  const current = map.get(key) || 'unknown';
  if (signalPriority(nextState) >= signalPriority(current)) {
    map.set(key, nextState);
  }
}

function parseNumberCandidate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseMaskedCustomerLabel(value: Record<string, unknown>) {
  return (
    extractFirstString(value, ['masked_customer_label', 'customer', 'customer_id', 'email']) ||
    extractNestedString(value, ['customer', 'email']) ||
    null
  );
}

function parseAmountCurrency(value: Record<string, unknown>) {
  const amount =
    parseNumberCandidate(value.amount_minor) ||
    parseNumberCandidate(value.amount) ||
    parseNumberCandidate(extractNestedString(value, ['data', 'object', 'amount']));
  const currency =
    extractFirstString(value, ['currency']) ||
    extractNestedString(value, ['data', 'object', 'currency']) ||
    null;

  return {
    amountMinor: amount !== null ? Math.trunc(amount) : null,
    currency,
  };
}

function evaluateDownstreamStatus(params: {
  downstreamConfigured: boolean;
  snapshotState: 'activated' | 'not_activated' | 'error' | null;
  receiptReceivedAt: string | null;
  nowMs: number;
  graceMs?: number;
}) {
  if (!params.downstreamConfigured) {
    return {
      state: 'downstream_unconfigured' as DownstreamStatusState,
      confirmed: false,
      graceUntil: null,
    };
  }

  const receiptMs = params.receiptReceivedAt ? new Date(params.receiptReceivedAt).getTime() : Number.NaN;
  const referenceMs = Number.isFinite(receiptMs) ? receiptMs : params.nowMs;
  const graceMs = params.graceMs ?? DOWNSTREAM_GRACE_MS;
  const graceUntilMs = referenceMs + graceMs;

  if (params.snapshotState === 'activated') {
    return {
      state: 'healthy' as DownstreamStatusState,
      confirmed: false,
      graceUntil: new Date(graceUntilMs).toISOString(),
    };
  }

  if (params.nowMs < graceUntilMs) {
    return {
      state: 'pending_activation' as DownstreamStatusState,
      confirmed: false,
      graceUntil: new Date(graceUntilMs).toISOString(),
    };
  }

  if (params.snapshotState === 'error') {
    return {
      state: 'downstream_error' as DownstreamStatusState,
      confirmed: true,
      graceUntil: new Date(graceUntilMs).toISOString(),
    };
  }

  return {
    state: 'confirmed_missing_activation' as DownstreamStatusState,
    confirmed: true,
    graceUntil: new Date(graceUntilMs).toISOString(),
  };
}

async function appendCaseEvent(params: {
  admin: any;
  caseId: string;
  eventType: string;
  details: Record<string, unknown>;
  actorId?: string | null;
}) {
  await params.admin.from('payment_reconciliation_case_events').insert({
    case_id: params.caseId,
    event_type: params.eventType,
    details_json: params.details,
    actor_id: params.actorId ?? null,
  });
}

async function upsertReconciliationCases(params: {
  admin: any;
  workspaceId: string;
  candidates: CaseCandidate[];
}) {
  if (!params.candidates.length) {
    return { opened: 0, updated: 0, errors: 0 };
  }

  const paymentIds = Array.from(new Set(params.candidates.map((item) => item.providerPaymentId)));
  const { data: existingRows } = await params.admin
    .from('payment_reconciliation_cases')
    .select('id, workspace_id, provider, provider_payment_id, status, reason_code, severity, created_at')
    .eq('workspace_id', params.workspaceId)
    .in('provider_payment_id', paymentIds)
    .order('created_at', { ascending: false });

  const existingByKey = new Map<string, ExistingCase>();
  for (const row of (existingRows || []) as ExistingCase[]) {
    const provider = normalizeProvider(row.provider);
    if (!provider) continue;
    const key = makeJoinKey(provider, row.provider_payment_id);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, row);
    }
  }

  let opened = 0;
  let updated = 0;
  let errors = 0;
  const nowIso = new Date().toISOString();

  for (const candidate of params.candidates) {
    const key = makeJoinKey(candidate.provider, candidate.providerPaymentId);
    const existing = existingByKey.get(key);

    if (existing && (existing.status === 'open' || existing.status === 'pending')) {
      const { error } = await params.admin
        .from('payment_reconciliation_cases')
        .update({
          status: 'open',
          reason_code: candidate.reasonCode,
          severity: candidate.severity,
          grace_until: candidate.graceUntil,
          last_seen_at: nowIso,
          masked_customer_label: candidate.maskedCustomerLabel,
          amount_minor: candidate.amountMinor,
          currency: candidate.currency,
          updated_at: nowIso,
        })
        .eq('id', existing.id);

      if (error) {
        errors += 1;
        continue;
      }

      if (existing.reason_code !== candidate.reasonCode || existing.severity !== candidate.severity) {
        await appendCaseEvent({
          admin: params.admin,
          caseId: existing.id,
          eventType: 'status_change',
          details: {
            from_reason: existing.reason_code,
            to_reason: candidate.reasonCode,
            from_severity: existing.severity,
            to_severity: candidate.severity,
            source: 'reconciliation_run',
          },
        });
      }

      updated += 1;
      continue;
    }

    const insertPayload = {
      workspace_id: params.workspaceId,
      provider: candidate.provider,
      provider_payment_id: candidate.providerPaymentId,
      status: 'open',
      severity: candidate.severity,
      reason_code: candidate.reasonCode,
      first_detected_at: nowIso,
      last_seen_at: nowIso,
      grace_until: candidate.graceUntil,
      masked_customer_label: candidate.maskedCustomerLabel,
      amount_minor: candidate.amountMinor,
      currency: candidate.currency,
    };

    const { data: inserted, error: insertError } = await params.admin
      .from('payment_reconciliation_cases')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError?.code === '23505') {
      const { data: active } = await params.admin
        .from('payment_reconciliation_cases')
        .select('id')
        .eq('workspace_id', params.workspaceId)
        .eq('provider', candidate.provider)
        .eq('provider_payment_id', candidate.providerPaymentId)
        .in('status', ['open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active?.id) {
        await params.admin
          .from('payment_reconciliation_cases')
          .update({
            status: 'open',
            reason_code: candidate.reasonCode,
            severity: candidate.severity,
            grace_until: candidate.graceUntil,
            last_seen_at: nowIso,
            masked_customer_label: candidate.maskedCustomerLabel,
            amount_minor: candidate.amountMinor,
            currency: candidate.currency,
            updated_at: nowIso,
          })
          .eq('id', active.id);

        updated += 1;
        continue;
      }
    }

    if (insertError || !inserted?.id) {
      errors += 1;
      continue;
    }

    await appendCaseEvent({
      admin: params.admin,
      caseId: inserted.id,
      eventType: 'created',
      details: {
        reason_code: candidate.reasonCode,
        severity: candidate.severity,
        source: 'reconciliation_run',
        ...candidate.details,
      },
    });

    opened += 1;
  }

  return { opened, updated, errors };
}

async function autoResolveReconciliationCases(params: {
  admin: any;
  workspaceId: string;
  actorId?: string | null;
  signalStateByKey: Map<string, SignalState>;
  mismatchKeys: Set<string>;
}) {
  const { data: activeRows, error: activeError } = await params.admin
    .from('payment_reconciliation_cases')
    .select('id, workspace_id, provider, provider_payment_id, status, reason_code, severity, created_at')
    .eq('workspace_id', params.workspaceId)
    .in('status', ['open', 'pending']);

  if (activeError) {
    return { resolved: 0, errors: 1 };
  }

  let resolved = 0;
  let errors = 0;
  const nowIso = new Date().toISOString();
  const resolutionNote = 'Auto-resolved by reconciliation runner after healthy evidence signals.';
  let resolverActorId: string | null | undefined = params.actorId ?? undefined;

  for (const row of (activeRows || []) as ExistingCase[]) {
    const provider = normalizeProvider(row.provider);
    if (!provider) continue;
    const key = makeJoinKey(provider, row.provider_payment_id);
    if (params.mismatchKeys.has(key)) continue;

    const signal = params.signalStateByKey.get(key) || 'unknown';
    if (signal !== 'healthy') continue;

    if (resolverActorId === undefined) {
      const { data: fallbackActor } = await params.admin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', params.workspaceId)
        .in('role', ['owner', 'admin'])
        .order('role', { ascending: true })
        .limit(1)
        .maybeSingle();
      resolverActorId = fallbackActor?.user_id || null;
    }

    const { error: updateError } = await params.admin
      .from('payment_reconciliation_cases')
      .update({
        status: 'resolved',
        resolved_at: nowIso,
        resolved_by: resolverActorId ?? null,
        resolution_note: resolutionNote,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', row.id);

    if (updateError) {
      errors += 1;
      continue;
    }

    await appendCaseEvent({
      admin: params.admin,
      caseId: row.id,
      eventType: 'auto_resolved',
      details: {
        previous_status: row.status,
        previous_reason_code: row.reason_code,
        source: 'reconciliation_run',
      },
      actorId: resolverActorId ?? null,
    });

    resolved += 1;
  }

  return { resolved, errors };
}

function setCaseCandidate(
  map: Map<string, CaseCandidate>,
  key: string,
  candidate: CaseCandidate
) {
  const existing = map.get(key);
  if (!existing || reasonPriority(candidate.reasonCode) > reasonPriority(existing.reasonCode)) {
    map.set(key, candidate);
  }
}

export async function runProviderReconciliation(params: {
  admin: any;
  workspaceId: string;
  batchId?: string | null;
  actorId?: string | null;
}) {
  const { admin, workspaceId, batchId } = params;
  const nowMs = Date.now();

  const { data: settings } = await admin
    .from('workspace_reconciliation_settings')
    .select('downstream_snapshots_enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const downstreamConfigured = Boolean(settings?.downstream_snapshots_enabled);

  const { data: integrations, error: integrationError } = await admin
    .from('provider_integrations')
    .select('id, workspace_id, provider_type, config, credentials_encrypted, is_active, health_status, last_synced_at')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .in('provider_type', [...SUPPORTED_RECONCILIATION_PROVIDERS]);

  if (integrationError) {
    return { error: 'provider_integrations_fetch_failed' as const };
  }

  let receiptsQuery = admin
    .from('ingested_events')
    .select('id, provider_payment_id, provider_event_id, detected_provider, signature_status, received_at')
    .eq('workspace_id', workspaceId)
    .not('provider_payment_id', 'is', null)
    .in('detected_provider', [...SUPPORTED_RECONCILIATION_PROVIDERS])
    .order('received_at', { ascending: false })
    .limit(5000);

  if (batchId) {
    receiptsQuery = receiptsQuery.eq('batch_id', batchId);
  }

  const { data: receipts, error: receiptsError } = await receiptsQuery;
  if (receiptsError) {
    return { error: 'ingested_events_fetch_failed' as const };
  }

  const receiptRows = (receipts || []) as ReceiptRow[];
  const receiptIds = receiptRows.map((event) => event.id);

  const deliveryByReceiptId = new Map<string, DeliveryStatus>();
  if (receiptIds.length) {
    const { data: jobs } = await admin
      .from('delivery_jobs')
      .select('ingested_event_id, status, created_at')
      .eq('workspace_id', workspaceId)
      .in('ingested_event_id', receiptIds)
      .order('created_at', { ascending: false });

    for (const row of jobs || []) {
      const ingestedEventId = row.ingested_event_id as string | null;
      if (!ingestedEventId) continue;
      const current = deliveryByReceiptId.get(ingestedEventId) || {
        hasAny: false,
        hasCompleted: false,
        latestStatus: null,
      };
      current.hasAny = true;
      if (!current.latestStatus) {
        current.latestStatus = row.status || null;
      }
      if (row.status === 'completed') {
        current.hasCompleted = true;
      }
      deliveryByReceiptId.set(ingestedEventId, current);
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

  const pulledByProvider = new Map<SupportedProvider, Set<string>>();
  const metadataByKey = new Map<string, Record<string, unknown>>();
  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    pulledByProvider.set(provider, new Set());
  }
  for (const pull of pullResults) {
    if (!pull.ok) continue;
    const existing = pulledByProvider.get(pull.provider) || new Set<string>();
    for (const id of pull.pulledIds) {
      existing.add(id);
    }
    pulledByProvider.set(pull.provider, existing);

    for (const object of pull.objects) {
      metadataByKey.set(makeJoinKey(pull.provider, object.providerPaymentId), object.metadata);
    }
  }

  const receiptsByKey = new Map<string, ReceiptRow>();
  const receiptsByProvider = new Map<SupportedProvider, Map<string, ReceiptRow>>();
  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    receiptsByProvider.set(provider, new Map());
  }

  for (const receipt of receiptRows) {
    const provider = normalizeProvider(receipt.detected_provider);
    const paymentId = receipt.provider_payment_id;
    if (!provider || !paymentId) continue;
    const key = makeJoinKey(provider, paymentId);
    if (!receiptsByKey.has(key)) {
      receiptsByKey.set(key, receipt);
      receiptsByProvider.get(provider)?.set(paymentId, receipt);
    }
  }

  const latestSnapshotByKey = new Map<string, SnapshotRow>();
  if (downstreamConfigured) {
    const { data: snapshots } = await admin
      .from('destination_state_snapshots')
      .select('id, provider, provider_payment_id, downstream_state, reason_code, observed_at')
      .eq('workspace_id', workspaceId)
      .in('provider', [...SUPPORTED_RECONCILIATION_PROVIDERS])
      .order('observed_at', { ascending: false })
      .limit(5000);

    for (const row of (snapshots || []) as SnapshotRow[]) {
      const provider = normalizeProvider(row.provider);
      if (!provider) continue;
      const key = makeJoinKey(provider, row.provider_payment_id);
      if (!latestSnapshotByKey.has(key)) {
        latestSnapshotByKey.set(key, row);
      }
    }
  }

  let missingReceipts = 0;
  let missingDeliveries = 0;
  let failedVerifications = 0;
  let providerMismatches = 0;
  let downstreamNotActivated = 0;
  let downstreamError = 0;
  let downstreamUnconfigured = 0;
  let pendingActivation = 0;

  const mismatchCandidates = new Map<string, CaseCandidate>();
  const signalStateByKey = new Map<string, SignalState>();
  const perProvider: Array<Record<string, unknown>> = [];

  for (const provider of SUPPORTED_RECONCILIATION_PROVIDERS) {
    const pulledIds = pulledByProvider.get(provider) || new Set<string>();
    const providerReceipts = receiptsByProvider.get(provider) || new Map<string, ReceiptRow>();

    let providerMissingReceipts = 0;
    let providerMissingDeliveries = 0;
    let providerDownstreamNotActivated = 0;
    let providerDownstreamError = 0;
    let providerDownstreamUnconfigured = 0;
    let providerPendingActivation = 0;

    for (const paymentId of pulledIds) {
      const key = makeJoinKey(provider, paymentId);
      const receipt = providerReceipts.get(paymentId);
      if (!receipt) {
        setSignalState(signalStateByKey, key, 'mismatch');
        missingReceipts += 1;
        providerMissingReceipts += 1;

        const metadata = metadataByKey.get(key) || {};
        const amountCurrency = parseAmountCurrency(metadata);
        setCaseCandidate(mismatchCandidates, key, {
          provider,
          providerPaymentId: paymentId,
          reasonCode: 'provider_no_receipt',
          severity: severityForReason('provider_no_receipt'),
          graceUntil: null,
          maskedCustomerLabel: parseMaskedCustomerLabel(metadata),
          amountMinor: amountCurrency.amountMinor,
          currency: amountCurrency.currency,
          details: {
            mismatch_state: 'provider_no_receipt',
          },
        });
        continue;
      }

      const delivery = deliveryByReceiptId.get(receipt.id) || {
        hasAny: false,
        hasCompleted: false,
        latestStatus: null,
      };
      let signalState: SignalState = 'healthy';

      if (receipt.signature_status === 'failed') {
        signalState = 'mismatch';
        failedVerifications += 1;
        setCaseCandidate(mismatchCandidates, key, {
          provider,
          providerPaymentId: paymentId,
          reasonCode: 'failed_verification',
          severity: severityForReason('failed_verification'),
          graceUntil: null,
          maskedCustomerLabel: null,
          amountMinor: null,
          currency: null,
          details: {
            mismatch_state: 'failed_verification',
            receipt_id: receipt.id,
          },
        });
      }

      if (!delivery.hasCompleted) {
        signalState = 'mismatch';
        missingDeliveries += 1;
        providerMissingDeliveries += 1;
        setCaseCandidate(mismatchCandidates, key, {
          provider,
          providerPaymentId: paymentId,
          reasonCode: 'delivery_failure',
          severity: severityForReason('delivery_failure'),
          graceUntil: null,
          maskedCustomerLabel: null,
          amountMinor: null,
          currency: null,
          details: {
            mismatch_state: 'delivery_failure',
            receipt_id: receipt.id,
            latest_delivery_status: delivery.latestStatus,
          },
        });
      }

      const snapshot = latestSnapshotByKey.get(key);
      const downstreamStatus = evaluateDownstreamStatus({
        downstreamConfigured,
        snapshotState: snapshot?.downstream_state || null,
        receiptReceivedAt: receipt.received_at,
        nowMs,
      });

      if (downstreamStatus.state === 'downstream_unconfigured') {
        downstreamUnconfigured += 1;
        providerDownstreamUnconfigured += 1;
      } else if (downstreamStatus.state === 'pending_activation') {
        if (signalState !== 'mismatch') {
          signalState = 'pending';
        }
        pendingActivation += 1;
        providerPendingActivation += 1;
      } else if (downstreamStatus.state === 'confirmed_missing_activation') {
        signalState = 'mismatch';
        downstreamNotActivated += 1;
        providerDownstreamNotActivated += 1;
        setCaseCandidate(mismatchCandidates, key, {
          provider,
          providerPaymentId: paymentId,
          reasonCode: 'confirmed_missing_activation',
          severity: severityForReason('confirmed_missing_activation'),
          graceUntil: downstreamStatus.graceUntil,
          maskedCustomerLabel: null,
          amountMinor: null,
          currency: null,
          details: {
            mismatch_state: 'confirmed_missing_activation',
            receipt_id: receipt.id,
            snapshot_state: snapshot?.downstream_state || null,
            snapshot_reason_code: snapshot?.reason_code || null,
          },
        });
      } else if (downstreamStatus.state === 'downstream_error') {
        signalState = 'mismatch';
        downstreamError += 1;
        providerDownstreamError += 1;
        setCaseCandidate(mismatchCandidates, key, {
          provider,
          providerPaymentId: paymentId,
          reasonCode: 'downstream_error',
          severity: severityForReason('downstream_error'),
          graceUntil: downstreamStatus.graceUntil,
          maskedCustomerLabel: null,
          amountMinor: null,
          currency: null,
          details: {
            mismatch_state: 'downstream_error',
            receipt_id: receipt.id,
            snapshot_state: snapshot?.downstream_state || null,
            snapshot_reason_code: snapshot?.reason_code || null,
          },
        });
      }

      setSignalState(signalStateByKey, key, signalState);
    }

    const pull = pullResults.find((item) => item.provider === provider);
    perProvider.push({
      provider,
      pull_ok: pull?.ok ?? false,
      pull_error_code: pull?.errorCode ?? null,
      pull_error: pull?.error ?? null,
      pulled_count: pulledIds.size,
      missing_receipts: providerMissingReceipts,
      missing_deliveries: providerMissingDeliveries,
      downstream_not_activated: providerDownstreamNotActivated,
      downstream_error: providerDownstreamError,
      downstream_unconfigured: providerDownstreamUnconfigured,
      pending_activation: providerPendingActivation,
      receipt_count: providerReceipts.size,
    });
  }

  for (const [key, receipt] of receiptsByKey.entries()) {
    const provider = normalizeProvider(receipt.detected_provider);
    const paymentId = receipt.provider_payment_id;
    if (!provider || !paymentId) continue;

    const foundIn = SUPPORTED_RECONCILIATION_PROVIDERS.filter((candidate) =>
      pulledByProvider.get(candidate)?.has(paymentId)
    );

    if (foundIn.length > 0 && !foundIn.includes(provider)) {
      setSignalState(signalStateByKey, key, 'mismatch');
      providerMismatches += 1;
      setCaseCandidate(mismatchCandidates, key, {
        provider,
        providerPaymentId: paymentId,
        reasonCode: 'provider_mismatch',
        severity: severityForReason('provider_mismatch'),
        graceUntil: null,
        maskedCustomerLabel: null,
        amountMinor: null,
        currency: null,
        details: {
          mismatch_state: 'provider_mismatch',
          pulled_from: foundIn,
          receipt_provider: provider,
        },
      });
    }
  }

  const providerPullFailures = pullResults.filter((item) => !item.ok).length;
  const pulledTotal = pullResults.reduce((sum, item) => sum + item.pulledCount, 0);

  const caseWrite = await upsertReconciliationCases({
    admin,
    workspaceId,
    candidates: Array.from(mismatchCandidates.values()),
  });
  const caseResolve = await autoResolveReconciliationCases({
    admin,
    workspaceId,
    actorId: params.actorId ?? null,
    signalStateByKey,
    mismatchKeys: new Set(mismatchCandidates.keys()),
  });

  const caseStats = {
    opened: caseWrite.opened,
    updated: caseWrite.updated,
    resolved: caseResolve.resolved,
    errors: caseWrite.errors + caseResolve.errors,
  };

  const discrepanciesFound =
    missingReceipts +
    missingDeliveries +
    failedVerifications +
    providerMismatches +
    providerPullFailures +
    downstreamNotActivated +
    downstreamError;

  const notes: string[] = [];
  if (!downstreamConfigured) {
    notes.push(DOWNSTREAM_UNCONFIGURED_MESSAGE);
  } else if (pendingActivation > 0) {
    notes.push('Some downstream activations are within grace window and not yet confirmed as mismatches.');
  }

  return {
    error: null,
    itemsProcessed: receiptRows.length + pulledTotal + latestSnapshotByKey.size,
    discrepanciesFound,
    reportJson: {
      generated_at: new Date().toISOString(),
      coverage_mode: downstreamConfigured ? 'three_way_active' : 'two_way_active',
      downstream_activation_status: downstreamConfigured ? 'configured' : 'downstream_unconfigured',
      legal_scope: 'LanceIQ records provider data, receipt evidence, delivery outcomes, and customer-reported downstream snapshots when configured.',
      counters: {
        receipts_considered: receiptRows.length,
        provider_objects_pulled: pulledTotal,
        snapshots_considered: downstreamConfigured ? latestSnapshotByKey.size : 0,
      },
      discrepancy_counters: {
        missing_receipts: missingReceipts,
        missing_deliveries: missingDeliveries,
        failed_verifications: failedVerifications,
        provider_mismatches: providerMismatches,
        provider_pull_failures: providerPullFailures,
        downstream_not_activated: downstreamNotActivated,
        downstream_error: downstreamError,
        downstream_unconfigured: downstreamUnconfigured,
        pending_activation: pendingActivation,
      },
      cases: {
        opened: caseStats.opened,
        updated: caseStats.updated,
        auto_resolved: caseStats.resolved,
        write_errors: caseStats.errors,
      },
      providers: perProvider,
      notes,
    },
    coverageMode: downstreamConfigured ? 'three_way_active' : 'two_way_active',
    downstreamStatus: downstreamConfigured ? 'configured' : 'downstream_unconfigured',
    caseStats,
  };
}

export const reconciliationTestUtils = {
  parseCredentialBlob,
  parseResponseArray,
  toProviderObjects,
  evaluateDownstreamStatus,
  makeJoinKey,
  severityForReason,
};
