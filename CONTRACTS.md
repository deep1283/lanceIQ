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
1. payload
2. headers
3. provider
4. secret
Response:
1. verification status
2. reason if failed

### GET /api/audit-logs (Planned)
Purpose: Fetch audit logs for a workspace.
Auth: Owner or admin.
Query:
1. workspace_id
2. cursor or page
Response:
1. audit log entries
2. pagination cursor

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
