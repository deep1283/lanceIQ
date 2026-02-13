# LanceIQ Contracts

## Rule of the Repo
No changes to this file without explicit approval. This is the shared contract boundary.

## API Contracts

### POST /api/ingest
Purpose: Header-based ingestion endpoint.
Auth: API key in headers.
Request body: Raw webhook payload, any content type.
Required headers:
1. x-lanceiq-api-key or x-api-key
Response:
1. 200 or 202 with event id
2. 401 for invalid key
3. 429 for rate limiting or quota
4. 500 for internal errors
Minimum response fields:
1. status
2. id
3. error when applicable
4. error_code when applicable
Idempotency:
1. If provider_event_id is present and already stored for the same workspace+provider, return 200 with existing id.
2. If provider_event_id is absent, best-effort dedupe may occur, but no DB guarantee.

### POST /api/ingest/[apiKey]
Purpose: Path-based ingestion for providers that do not support custom headers.
Auth: API key in path.
Request body: Raw webhook payload, any content type.
Response:
1. 202 for queued
2. 200 for duplicate
3. 401 for invalid key
4. 429 for rate limiting or quota
5. 500 for internal errors
Minimum response fields:
1. status
2. id
3. error when applicable
4. error_code when applicable
Idempotency:
1. If provider_event_id is present and already stored for the same workspace+provider, return 200 with existing id.
2. If provider_event_id is absent, best-effort dedupe may occur, but no DB guarantee.

### GET /api/certificates/[reportId]
Purpose: Fetch certificate data by report id.
Auth: Public or workspace-scoped depending on certificate visibility.
Response:
1. Certificate summary
2. Verification status
3. Evidence hashes
Minimum response fields:
1. report_id
2. created_at
3. provider
4. signature_status
5. raw_body_sha256
Retention visibility (workspace-scoped UI/export, not public):
1. raw_body_expires_at
2. raw_body_present
3. retention_policy_label

### POST /api/certificates/export
Purpose: Export certificate as PDF or CSV.
Auth: Workspace-scoped.
Request body:
1. report_id or filter criteria
Response:
1. export_url or binary PDF

### POST /api/verify-signature
Purpose: Verify a payload using a supplied secret.
Auth: Workspace-scoped or limited.
Request body:
1. rawBody
2. headers
3. secret
4. workspace_id (optional for single-workspace users; required when user has multiple workspaces)
5. reportId or certificateId (optional persistence target)
Response:
1. verification status
2. reason if failed
3. provider and rawBodySha256
4. verificationToken (when signing is configured)
Error semantics:
1. `400` when `workspace_id` is missing and workspace context is ambiguous (multi-workspace user)
2. `403` when user is not a member of the supplied `workspace_id`
3. `403` when workspace entitlement does not allow verification

### GET /api/audit-logs
Purpose: Fetch audit logs for a workspace.
Auth: Owner or admin.
Query:
1. workspace_id
2. cursor or page
Response:
1. audit log entries
2. pagination cursor

### GET /api/sso/saml/metadata
Purpose: Expose SP metadata for IdP configuration.
Auth: Public.
Response:
1. XML metadata document
2. `WantAssertionsSigned="true"`

### POST /api/sso/saml/acs
Purpose: Handle SAML login assertion and create session link.
Auth: Public endpoint with cryptographic SAML validation.
Request body:
1. `SAMLResponse` (base64), form-encoded or JSON
Security requirements:
1. Signed assertion required
2. Issuer must match configured provider metadata entity id
3. Audience must match SP entity id
4. Destination/recipient must match ACS URL
5. Conditions and subject-confirmation time window checks required
6. Replay blocked by one-time assertion id + issuer
Provider resolution:
1. Email domain from assertion is normalized
2. Provider must be enabled and domain-verified
Role assignment:
1. Default role is `member`
2. Elevated mapping allowed only through explicit allowlist configuration
Response:
1. `302` redirect to generated auth link on success
2. `401` on signature or assertion validation failure
3. `404` when provider is missing/disabled/unverified
4. `409` on replay detection

### POST /api/dodo/webhook
Purpose: Process billing events and mutate workspace plan state.
Auth: Dodo signature verification required.
Trust boundary:
1. Plan mutation is allowed only through verified webhook events.
2. Activation events require workspace-bound metadata proof.
Response:
1. `200` with `received: true` on accepted webhook
2. `400` for invalid signature or missing required proof for activation events

### POST /api/dodo/verify
Purpose: Legacy email-based unlock endpoint.
Status: Deprecated for security.
Response:
1. `410` with `status: "deprecated"`
2. Must not change any workspace plan

### POST /api/dodo/verify-payment
Purpose: Verify payment proof for authenticated workspace context.
Auth:
1. Authenticated user required
2. Workspace membership required for supplied `workspace_id`
Request body:
1. `payment_id`
2. `workspace_id`
Proof requirements:
1. Payment status must be succeeded
2. Payment metadata must include matching `workspace_id` and `user_id`
Response:
1. `200` with `paid`, `verified`, `workspace_plan_active`, `plan_changed: false` on proof success
2. `401` unauthorized when not logged in
3. `403` for membership or metadata proof mismatch
4. `400` for invalid payload or non-succeeded payment
Privacy:
1. Must not return customer PII (`email`, `name`)
Mutation rule:
1. Must not mutate workspace plan

### POST /api/cron/cleanup-raw-bodies
Purpose: Remove raw bodies past retention.
Auth: Cron secret.
Response:
1. count_pruned (number of events where raw_body was set to NULL)

## Logical Data Schemas

### IngestedEvent
Minimum fields:
1. id
2. workspace_id
3. received_at
4. raw_body_sha256
5. headers
6. payload
7. raw_body
8. raw_body_expires_at
9. detected_provider
10. signature_status
11. signature_reason
12. provider_event_id
Retention semantics:
1. raw_body may be set to null after raw_body_expires_at, unless a legal hold is active.
2. raw_body_expires_at is required when raw_body is stored.
Note: raw_body may be NULL after raw_body_expires_at, but only if no active legal hold exists for the workspace.

### Certificate
Minimum fields:
1. id
2. report_id
3. workspace_id
4. created_at
5. raw_body_sha256
6. headers
7. payload
8. provider
9. provider_event_id
10. signature_status
11. signature_status_reason
12. verification_method
13. verified_at
14. signature_secret_hint
15. status_code
16. expires_at
17. raw_body_expires_at
18. raw_body_present
19. retention_policy_label
Retention semantics:
1. expires_at reflects plan-based certificate retention.
2. raw_body_present indicates whether raw_body is currently retained.
3. Legal hold does not change scope-of-proof; it only blocks retention pruning.

### AuditLog
Minimum fields:
1. id
2. workspace_id
3. actor_id
4. action
5. target_resource
6. details
7. ip_address
8. created_at

### VerificationResult
Minimum fields:
1. status
2. reason
3. provider_event_id
4. verified_at

## Versioning Rules
1. Additive changes only by default.
2. Breaking changes require a new versioned endpoint.
3. Any field removal or semantic change requires explicit approval and a decision record.
4. Contracts must be backward compatible for at least one release cycle.

## Evidence Language Boundary
All outputs and documentation must state that LanceIQ attests only to receipt by LanceIQ, payload and headers received, and verification status at time T.
