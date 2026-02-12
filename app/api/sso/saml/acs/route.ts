import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  deriveSamlRole,
  extractUnverifiedEmailFromSamlResponseBase64,
  storeSamlReplayAssertion,
  toSamlSecurityError,
  verifyAndExtractSamlAssertion,
} from '@/lib/sso/saml';
import { AUDIT_ACTIONS, logAuditAction } from '@/utils/audit';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getSiteUrl() {
  return (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    'https://lanceiq.com'
  );
}

export async function POST(request: NextRequest) {
  try {
    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const contentType = request.headers.get('content-type') || '';
    let samlResponse: string | null = null;
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      samlResponse = form.get('SAMLResponse') as string | null;
    } else {
      const body = await request.json().catch(() => ({}));
      samlResponse = body?.SAMLResponse ?? null;
    }

    if (!samlResponse) {
      return NextResponse.json({ error: 'Missing SAMLResponse' }, { status: 400 });
    }

    const unverifiedEmail = extractUnverifiedEmailFromSamlResponseBase64(samlResponse);
    if (!unverifiedEmail || !unverifiedEmail.includes('@')) {
      return NextResponse.json({ error: 'Unable to resolve SSO provider from SAML response' }, { status: 400 });
    }

    const domain = unverifiedEmail.split('@')[1].trim().toLowerCase();
    const { data: provider, error: providerError } = await admin
      .from('sso_providers')
      .select('id, workspace_id, domain, enabled, metadata_xml, verified_at')
      .eq('domain', domain)
      .eq('enabled', true)
      .maybeSingle();

    if (providerError || !provider || !provider.verified_at) {
      return NextResponse.json({ error: 'SSO provider not configured' }, { status: 404 });
    }

    const siteUrl = getSiteUrl();
    const expectedAcsUrl = `${siteUrl}/api/sso/saml/acs`;
    const expectedAudience = process.env.SAML_ENTITY_ID || `${siteUrl}/api/sso/saml/metadata`;

    let verified;
    try {
      verified = verifyAndExtractSamlAssertion({
        samlResponseBase64: samlResponse,
        metadataXml: provider.metadata_xml,
        expectedAcsUrl,
        expectedAudience,
      });
    } catch (err) {
      const securityError = toSamlSecurityError(err);
      await logAuditAction({
        workspaceId: provider.workspace_id,
        action: AUDIT_ACTIONS.AUTH_LOGIN,
        targetResource: 'sso_providers',
        details: {
          status: 'rejected',
          reason: securityError.code,
          domain,
        },
      });
      return NextResponse.json({ error: securityError.message }, { status: 401 });
    }

    if (verified.email.split('@')[1].trim().toLowerCase() !== domain) {
      await logAuditAction({
        workspaceId: provider.workspace_id,
        action: AUDIT_ACTIONS.AUTH_LOGIN,
        targetResource: 'sso_providers',
        details: {
          status: 'rejected',
          reason: 'domain_mismatch',
          asserted_domain: verified.email.split('@')[1].trim().toLowerCase(),
          configured_domain: domain,
        },
      });
      return NextResponse.json({ error: 'SAML email domain mismatch' }, { status: 401 });
    }

    try {
      await storeSamlReplayAssertion(admin as any, {
        assertionId: verified.assertionId,
        issuer: verified.issuer,
        expiresAt: verified.notOnOrAfter,
      });
    } catch (err) {
      const securityError = toSamlSecurityError(err);
      await logAuditAction({
        workspaceId: provider.workspace_id,
        action: AUDIT_ACTIONS.AUTH_LOGIN,
        targetResource: 'saml_replay_cache',
        details: {
          status: 'rejected',
          reason: securityError.code,
          assertion_id: verified.assertionId,
          issuer: verified.issuer,
        },
      });
      return NextResponse.json({ error: securityError.message }, { status: 409 });
    }

    const { data: listData, error: userLookupError } = await admin.auth.admin.listUsers();
    if (userLookupError) {
      console.error('User lookup failed:', userLookupError);
      return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
    }
    const existingUser = listData.users.find((u) => u.email === verified.email) ?? null;

    let userId = existingUser?.id;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: verified.email,
        email_confirm: true,
        user_metadata: verified.name ? { name: verified.name } : undefined,
      });
      if (createError || !created.user) {
        console.error('User create failed:', createError);
        return NextResponse.json({ error: 'Failed to provision user' }, { status: 500 });
      }
      userId = created.user.id;
    }

    const role = deriveSamlRole(verified.groups || []);

    const { error: mappingError } = await admin.from('identity_mappings').upsert(
      {
        workspace_id: provider.workspace_id,
        provider_id: provider.id,
        user_id: userId,
        external_id: verified.externalId || verified.email,
        external_email: verified.email,
        scim_attributes: {
          groups: verified.groups,
          attributes: verified.rawAttributes,
          saml_assertion_id: verified.assertionId,
          saml_issuer: verified.issuer,
        },
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'provider_id,external_id' }
    );

    if (mappingError) {
      console.error('Identity mapping failed:', mappingError);
      return NextResponse.json({ error: 'Failed to link identity' }, { status: 500 });
    }

    const { error: memberError } = await admin.from('workspace_members').upsert(
      {
        workspace_id: provider.workspace_id,
        user_id: userId,
        role,
      },
      { onConflict: 'workspace_id,user_id' }
    );

    if (memberError) {
      console.error('Workspace membership failed:', memberError);
      return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 });
    }

    const redirectTo = process.env.SAML_REDIRECT_URL || `${getSiteUrl()}/dashboard`;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: verified.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Magic link generation failed:', linkError);
      return NextResponse.json({ error: 'Failed to create session link' }, { status: 500 });
    }

    await logAuditAction({
      workspaceId: provider.workspace_id,
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      actorId: userId,
      targetResource: 'sso_providers',
      details: {
        status: 'accepted',
        provider_id: provider.id,
        assertion_id: verified.assertionId,
        issuer: verified.issuer,
        role_assigned: role,
      },
    });

    return NextResponse.redirect(linkData.properties.action_link, { status: 302 });
  } catch (err) {
    console.error('SAML ACS error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
