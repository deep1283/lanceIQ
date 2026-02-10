import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { parseSamlResponse } from '@/lib/sso/saml';

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

function deriveRole(groups: string[]) {
  const normalized = groups.map((g) => g.toLowerCase());
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('viewer')) return 'viewer';
  if (normalized.includes('exporter')) return 'exporter';
  if (normalized.includes('legal_hold_manager')) return 'legal_hold_manager';
  return 'member';
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

    const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');
    const { email, name, groups, externalId, rawAttributes } = parseSamlResponse(xml);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Missing email attribute in SAML response' }, { status: 400 });
    }

    const domain = email.split('@')[1].toLowerCase();
    const { data: provider, error: providerError } = await admin
      .from('sso_providers')
      .select('id, workspace_id, domain, enabled')
      .eq('domain', domain)
      .eq('enabled', true)
      .maybeSingle();

    if (providerError || !provider) {
      return NextResponse.json({ error: 'SSO provider not configured' }, { status: 404 });
    }

    const { data: existingUser, error: userLookupError } = await admin.auth.admin.getUserByEmail(email);
    if (userLookupError) {
      console.error('User lookup failed:', userLookupError);
      return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });
    }

    let userId = existingUser?.user?.id;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: name ? { name } : undefined,
      });
      if (createError || !created.user) {
        console.error('User create failed:', createError);
        return NextResponse.json({ error: 'Failed to provision user' }, { status: 500 });
      }
      userId = created.user.id;
    }

    const role = deriveRole(groups || []);

    const { error: mappingError } = await admin.from('identity_mappings').upsert(
      {
        workspace_id: provider.workspace_id,
        provider_id: provider.id,
        user_id: userId,
        external_id: externalId || email,
        external_email: email,
        scim_attributes: { groups, attributes: rawAttributes },
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
      email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.action_link) {
      console.error('Magic link generation failed:', linkError);
      return NextResponse.json({ error: 'Failed to create session link' }, { status: 500 });
    }

    return NextResponse.redirect(linkData.action_link, { status: 302 });
  } catch (err) {
    console.error('SAML ACS error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
