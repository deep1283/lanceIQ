-- Add HTTP status code to certificates for exports and audits
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS status_code int;

ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS chk_certificates_status_code;

ALTER TABLE public.certificates
  ADD CONSTRAINT chk_certificates_status_code CHECK (
    status_code IS NULL OR (status_code >= 100 AND status_code <= 599)
  );
