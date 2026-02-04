import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeRawBodySha256, verifySignature, detectProvider, type Provider } from '@/lib/signature-verification';
import { rateLimit } from '@/lib/rate-limit';
import { signVerificationToken } from '@/lib/verification-token';

// Simple in-memory rate limiter for Phase 1 (since we don't have Redis)
const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500, // Max 500 users per second
});

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting (IP-based)
    const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
    const ip = (forwardedFor.split(',')[0] || '').trim() || '127.0.0.1';
    try {
      await limiter.check(30, ip); // 30 requests per minute per IP
    } catch {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    // 2. Parse Input
    const body = await request.json();
    const { rawBody, headers, secret, certificateId, reportId } = body;

    // Validate inputs
    if (!rawBody || !headers || !secret) {
      return NextResponse.json({ 
        error: 'Missing required fields: rawBody, headers, and secret are required.' 
      }, { status: 400 });
    }

    // 3. Detect Provider & Verify
    const provider: Provider = detectProvider(headers);
    const result = verifySignature(provider, rawBody, headers, secret);
    const rawBodySha256 = computeRawBodySha256(rawBody);

    // 4. Auth (optional). Token issuance and persistence are only available when authenticated.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let verificationToken: string | undefined;
    if (user) {
      try {
        verificationToken = signVerificationToken({
          v: 1,
          userId: user.id,
          provider,
          rawBodySha256,
          issuedAt: Math.floor(Date.now() / 1000),
          result,
        });
      } catch (e) {
        // If token signing fails (missing env), still return the verification result,
        // but the client won't be able to persist via saveCertificate.
        console.error("Failed to sign verification token:", e);
      }
    }

    // 5. Persistence (Optional: Only if authenticated and owns certificate)
    // Supports resolving by reportId (friendly ID) or certificateId (UUID)
    if (user && (reportId || certificateId)) {
      const updateData = {
        signature_status: result.status,
        signature_status_reason: result.reason || null,
        verification_method: result.method || null,
        verification_error: result.error || null,
        verified_at: result.status === 'verified' ? new Date().toISOString() : null,
        signature_secret_hint: result.secretHint || null,
        provider: provider !== 'unknown' ? provider : null,
        provider_event_id: result.providerEventId || null,
        stripe_timestamp_tolerance_sec: result.toleranceUsedSec ?? null,
        verified_by_user_id: user.id,
      };

      // Update strictly by user_id ownership
      let query = supabase.from('certificates').update(updateData).eq('user_id', user.id);
      if (reportId) {
        query = query.eq('report_id', reportId);
      } else if (certificateId) {
        query = query.eq('id', certificateId);
      }

      const { error } = await query;
      if (error) {
        console.error('Failed to persist verification:', error);
      }
    }

    // 6. Return Result (Sanitized)
    const verifiedAt = result.status === 'verified' ? new Date().toISOString() : null;
    return NextResponse.json({
      status: result.status,
      reason: result.reason,
      error: result.error, // Human readable
      method: result.method,
      secretHint: result.secretHint,
      provider,
      providerEventId: result.providerEventId,
      verifiedAt,
      toleranceUsedSec: result.toleranceUsedSec,
      rawBodySha256,
      verificationToken,
    });

  } catch (err) {
    console.error('Verification error:', err);
    return NextResponse.json({ error: 'Internal server error during verification' }, { status: 500 });
  }
}
