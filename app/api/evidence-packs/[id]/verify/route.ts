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
import { decrypt } from '@/lib/encryption';
import { logAuditAction, AUDIT_ACTIONS } from '@/utils/audit';

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

function hashSha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveSecret(secret: string | null | undefined) {
  if (!secret) return null;
  try {
    return decrypt(secret);
  } catch {
    return secret;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, admin } = await getApiClients();
  const user = await requireUser(supabase);
  if (!user) {
    const err = apiError('Unauthorized', 401, 'unauthorized');
    return NextResponse.json(err.body, { status: err.status });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const workspaceId = body.workspace_id as string | undefined;

  if (!isValidUuid(id) || !isValidUuid(workspaceId)) {
    const err = apiError('Pack id and workspace_id are required.', 400, 'invalid_input');
    return NextResponse.json(err.body, { status: err.status });
  }

  const access = await requireWorkspaceAccess({
    supabase,
    workspaceId,
    userId: user.id,
    requireManage: false,
    entitlementPredicate: canUseReconciliationEntitlement,
  });
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  const { data: pack, error: packError } = await admin
    .from('evidence_packs')
    .select(
      'id, workspace_id, status, manifest_sha256, manifest_json, signature, signature_algorithm, signing_key_id, verification_status'
    )
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (packError || !pack?.id) {
    const err = apiError('Evidence pack not found.', 404, 'pack_not_found');
    return NextResponse.json(err.body, { status: err.status });
  }

  const manifestText = stableStringify(pack.manifest_json || {});
  const computedManifestHash = hashSha256(manifestText);
  const hashMatch = computedManifestHash === pack.manifest_sha256;

  let signatureValid = false;
  let verificationError: string | null = null;

  if (pack.signature_algorithm !== 'hmac-sha256') {
    verificationError = 'Unsupported signature algorithm.';
  } else if (!pack.signing_key_id) {
    verificationError = 'Missing signing key reference.';
  } else {
    const { data: signingKey } = await admin
      .from('workspace_delivery_signing_keys')
      .select('id, secret_encrypted')
      .eq('id', pack.signing_key_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const secret = resolveSecret(signingKey?.secret_encrypted);
    if (!secret) {
      verificationError = 'Signing key secret unavailable.';
    } else {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${pack.manifest_sha256}.${pack.id}`)
        .digest('hex');
      signatureValid = expectedSignature === pack.signature;
      if (!signatureValid) {
        verificationError = 'Signature mismatch.';
      }
    }
  }

  const verified = hashMatch && signatureValid;
  const verificationStatus = verified ? 'verified' : 'failed';
  const details = {
    hash_match: hashMatch,
    signature_valid: signatureValid,
    computed_manifest_sha256: computedManifestHash,
    error: verificationError,
    verified_by: user.id,
    verified_at: new Date().toISOString(),
  };

  await logAuditAction({
    workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.EVIDENCE_PACK_VERIFIED,
    targetResource: 'evidence_packs',
    details: {
      pack_id: pack.id,
      verification_status: verificationStatus,
      hash_match: hashMatch,
      signature_valid: signatureValid,
    },
  });

  return NextResponse.json({
    status: 'ok',
    id: pack.id,
    verified,
    verification_status: verificationStatus,
    hash_match: hashMatch,
    signature_valid: signatureValid,
    details,
    error: verificationError,
  });
}
