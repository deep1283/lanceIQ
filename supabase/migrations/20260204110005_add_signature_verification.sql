-- Add signature verification fields to certificates table
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS raw_body_sha256 text,          -- Always computed (UTF-8 bytes)
  ADD COLUMN IF NOT EXISTS canonical_json_sha256 text,    -- Only if valid JSON (RFC 8785)
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS signature_status text DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS signature_status_reason text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_error text,
  ADD COLUMN IF NOT EXISTS signature_secret_hint text,
  ADD COLUMN IF NOT EXISTS stripe_timestamp_tolerance_sec int,
  ADD COLUMN IF NOT EXISTS verified_by_user_id uuid references auth.users(id);

-- Type safety: CHECK constraints
ALTER TABLE public.certificates
  ADD CONSTRAINT chk_signature_status CHECK (
    signature_status IN ('not_verified', 'verified', 'failed')
  ),
  ADD CONSTRAINT chk_status_reason CHECK (
    signature_status_reason IS NULL OR signature_status_reason IN (
      'missing_header', 'missing_secret', 'unsupported_provider',
      'mismatch', 'malformed_signature', 'timestamp_expired'
    )
  );

-- Indexes optimized for dashboard and quarantine queries
CREATE INDEX IF NOT EXISTS idx_certs_user_created 
  ON public.certificates(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_certs_quarantine 
  ON public.certificates(user_id, signature_status, created_at DESC);
