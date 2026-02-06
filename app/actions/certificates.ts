"use server";

import { createClient } from "@/utils/supabase/server";
import { 
  computeCanonicalJsonSha256, 
  detectProvider, 
  extractEventId
} from "@/lib/signature-verification";
import { verifyVerificationToken } from "@/lib/verification-token";
import { checkProStatus } from "@/app/actions/subscription";
import { getPlanLimits, getRetentionExpiry } from "@/lib/plan";

export interface CertificateData {
  report_id: string;
  payload: object;
  headers: Record<string, string>;
  payload_hash: string;
  is_pro: boolean;

  // Server-issued token from `/api/verify-signature` (optional)
  verificationToken?: string;
}

export async function saveCertificate(data: CertificateData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { plan } = await checkProStatus();
  const limits = getPlanLimits(plan);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

  const { count: monthCount, error: countError } = await supabase
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  if (countError) {
    console.error("Certificate count failed:", countError);
    return { success: false, error: "Unable to verify monthly limits." };
  }

  if ((monthCount ?? 0) >= limits.monthlyCertificates) {
    return { 
      success: false, 
      error: `Monthly certificate limit reached (${limits.monthlyCertificates}).` 
    };
  }

  // Compute additional fields for verification support
  const canonicalHash = computeCanonicalJsonSha256(data.payload);
  const provider = detectProvider(data.headers);
  
  // Try to extract provider event ID. (Best-effort: depends on provider + payload shape.)
  const payloadString = JSON.stringify(data.payload);
  const providerEventId = extractEventId(provider, payloadString);

  // Verification fields are server-authored only. If provided, they must be backed by
  // a server-signed verification token that matches this payload hash and user.
  let verificationFields: Record<string, unknown> = {
    signature_status: 'not_verified',
    verification_method: null,
    verification_error: null,
    signature_secret_hint: null,
    verified_at: null,
    stripe_timestamp_tolerance_sec: null,
    verified_by_user_id: null,
  };

  if (plan !== 'free' && data.verificationToken) {
    const token = verifyVerificationToken(data.verificationToken);
    if (token.userId !== user.id) {
      return { success: false, error: "Invalid verification token (user mismatch)" };
    }
    if (token.rawBodySha256 !== data.payload_hash) {
      return { success: false, error: "Invalid verification token (payload mismatch)" };
    }
    if (token.provider !== provider) {
      return { success: false, error: "Invalid verification token (provider mismatch)" };
    }

    verificationFields = {
      signature_status: token.result.status,
      signature_status_reason: token.result.reason ?? null,
      verification_method: token.result.method ?? null,
      verification_error: token.result.error ?? null,
      signature_secret_hint: token.result.secretHint ?? null,
      verified_at: token.result.status === 'verified' ? new Date(token.issuedAt * 1000).toISOString() : null,
      stripe_timestamp_tolerance_sec: token.result.toleranceUsedSec ?? null,
      verified_by_user_id: user.id,
    };
  }

  const { error } = await supabase.from("certificates").insert({
    user_id: user.id,
    report_id: data.report_id,
    payload: data.payload,
    headers: data.headers,
    
    // Store legacy hash and new raw_body_sha256 (mapped from payload_hash which comes from client's raw input)
    payload_hash: data.payload_hash, 
    hash: data.payload_hash,
    raw_body_sha256: data.payload_hash,
    canonical_json_sha256: canonicalHash ?? null,
    
    // Provider details
    provider: provider !== 'unknown' ? provider : null,
    provider_event_id: providerEventId,
    
    ...verificationFields,
    
    is_pro: plan !== 'free',
    plan_tier: plan,
    expires_at: getRetentionExpiry(plan, now).toISOString(),
  });

  if (error) {
    console.error("Error saving certificate:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getCertificateForVerification(reportId: string) {
  // Use Service Role Key to bypass RLS for public verification
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return { success: false, error: "Configuration error" };
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("certificates")
    .select(`
      created_at, payload, headers, payload_hash, is_pro,
      signature_status, verified_at, verification_method, 
      verification_error, signature_secret_hint, provider,
      raw_body_sha256, canonical_json_sha256, expires_at
    `)
    .eq("report_id", reportId)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { success: false, error: "Certificate expired" };
  }

  return { success: true, data };
}

export async function getCertificates() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { certificates: [], error: "Not authenticated" };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("certificates")
    .select("*")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching certificates:", error);
    return { certificates: [], error: error.message };
  }

  return { certificates: data || [], error: null };
}
