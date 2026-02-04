-- Phase 3: Encrypted Secrets
-- Add support for storing encrypted webhook secrets

ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS encrypted_secret TEXT,
ADD COLUMN IF NOT EXISTS secret_last4 TEXT;

-- No new policies needed as existing Owner policies cover UPDATE.
-- API layer will ensure secrets are not returned to non-privileged users/contexts.
