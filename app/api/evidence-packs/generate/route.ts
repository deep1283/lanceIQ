import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  canUseReconciliationEntitlement,
  getApiClients,
  isValidUuid,
  requireUser,
  requireWorkspaceAccess,
} from '@/lib/delivery/api';
import { buildEvidencePackManifest } from '@/lib/delivery/service';
import { decrypt } from '@/lib/encryption';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

function hashSha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveSigningSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function makePackReference() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `EP-${stamp}-${suffix}`.toUpperCase();
}

export async function POST(request: NextRequest) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const runId = typeof body.run_id === 'string' ? body.run_id : null;
  const expiresAt = typeof body.expires_at === 'string' ? body.expires_at : null;

  if (!isValidUuid(workspaceId) || !title) {
    const err = apiError('workspace_id and title are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }
  if (runId && !isValidUuid(runId)) {
    const err = apiError('run_id must be UUID.', 400, 'invalid_run_id');
    return NextResponse.json(err.body, { status: err.status });
  }

  const access = await requireWorkspaceAccess({
    supabase,
    workspaceId,
    userId: user.id,
    requireManage: true,
    entitlementPredicate: canUseReconciliationEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data: signingKey, error: keyError } = await admin
    .from('workspace_delivery_signing_keys')
    .select('id, workspace_id, kid, secret_encrypted, algorithm, state')
    .eq('workspace_id', workspaceId)
    .eq('state', 'active')
    .eq('algorithm', 'hmac-sha256')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (keyError || !signingKey?.id) {
    const err = apiError('Active HMAC signing key required.', 400, 'signing_key_missing');
    return NextResponse.json(err.body, { status: err.status });
  }

  const signingSecret = resolveSigningSecret(signingKey.secret_encrypted);
  if (!signingSecret) {
    const err = apiError('Signing key is not usable.', 400, 'invalid_signing_key');
    return NextResponse.json(err.body, { status: err.status });
  }

  const packReference = makePackReference();
  const { data: pack, error: packError } = await admin
    .from('evidence_packs')
    .insert({
      workspace_id: workspaceId,
      pack_reference_id: packReference,
      title,
      description,
      status: 'generating',
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (packError || !pack?.id) {
    const err = apiError('Failed to create evidence pack.', 500, 'pack_create_failed');
    return NextResponse.json(err.body, { status: err.status });
  }

  const manifest = await buildEvidencePackManifest({
    admin,
    workspaceId,
    packId: pack.id,
    title,
    description,
    runId,
  });

  const manifestText = stableStringify(manifest);
  const manifestHash = hashSha256(manifestText);
  const signature = crypto
    .createHmac('sha256', signingSecret)
    .update(`${manifestHash}.${pack.id}`)
    .digest('hex');

  const { error: artifactError } = await admin.from('evidence_pack_artifacts').insert({
    pack_id: pack.id,
    artifact_type: 'manifest',
    storage_path: `inline://evidence-pack/${pack.id}/manifest.json`,
    file_hash_sha256: manifestHash,
    file_size_bytes: Buffer.byteLength(manifestText),
  });

  if (artifactError) {
    const err = apiError('Failed to persist evidence artifact.', 500, 'artifact_create_failed', pack.id);
    return NextResponse.json(err.body, { status: err.status });
  }

  const { error: sealError } = await admin
    .from('evidence_packs')
    .update({
      status: 'sealed',
      sealed_at: new Date().toISOString(),
      manifest_sha256: manifestHash,
      manifest_json: manifest,
      signature,
      signature_algorithm: 'hmac-sha256',
      signing_key_id: signingKey.id,
      verification_status: 'unverified',
    })
    .eq('id', pack.id);

  if (sealError) {
    const err = apiError('Failed to seal evidence pack.', 500, 'pack_seal_failed', pack.id);
    return NextResponse.json(err.body, { status: err.status });
  }

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.EVIDENCE_PACK_GENERATED,
    targetResource: 'evidence_packs',
    details: { pack_id: pack.id, pack_reference_id: packReference, run_id: runId },
  });

  return NextResponse.json({
    status: 'ok',
    id: pack.id,
    pack_reference_id: packReference,
    manifest_sha256: manifestHash,
    signature_algorithm: 'hmac-sha256',
  });
}
