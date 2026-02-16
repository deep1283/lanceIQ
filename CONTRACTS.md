# LanceIQ Contracts

## Rule Of The Repo
Do not change this file without explicit approval.

## Contract Principles
1. Additive changes by default.
2. Breaking behavior requires explicit versioning and decision record.
3. Scope-of-proof language must stay within LanceIQ receipt/verification/delivery-attempt boundaries.

## Entitlement Contract (Canonical)
Source: `/Users/deepmishra/vscode/LanceIQ/lib/plan.ts`

| Flag | Free | Pro | Team |
|---|---:|---:|---:|
| `canExportPdf` | true | true | true |
| `canExportCsv` | false | true | true |
| `canVerify` | false | true | true |
| `canRemoveWatermark` | false | true | true |
| `canUseForwarding` | false | true | true |
| `canUseReconciliation` | false | true | true |
| `canUseAlerts` | false | false | true |
| `canUseSso` | false | false | true |
| `canUseScim` | false | false | true |
| `canUseAccessReviews` | false | false | true |
| `canUseSlaIncidents` | false | false | true |
| `canUseLegalHold` | false | false | true |
| `canRotateKeys` | false | false | true |
| `canViewAuditLogs` | false | false | true |

## Core API Contracts

### `POST /api/ingest`
Purpose: Header-auth ingest endpoint.

Auth headers:
1. `x-lanceiq-api-key` or `x-api-key`, or
2. `Authorization: Bearer <api_key>`

Success responses:
1. `202` `{ status: "queued", id, verified }`
2. `200` `{ status: "duplicate", id, verified }`

Error responses:
1. `400` invalid payload or batch metadata
2. `401` missing/invalid key
3. `413` payload too large
4. `429` rate limit or plan quota
5. `500` internal/storage/config errors

Error body shape:
`{ status: "error", id: null, error, error_code }`

Idempotency:
1. DB-level duplicate guard on `(workspace_id, detected_provider, provider_event_id)` when `provider_event_id` is present.
2. Best-effort dedupe for payload-hash fallback.

### `POST /api/ingest/[apiKey]`
Purpose: Path-auth ingest endpoint.

Same response semantics as `/api/ingest`, except missing key returns `400` on this path endpoint.

### `POST /api/verify-signature`
Purpose: Verify payload signatures using provided secret.

Required body fields:
1. `rawBody`
2. `headers`
3. `secret`

Optional body fields:
1. `workspace_id`
2. `reportId`
3. `certificateId`

Auth:
1. Logged-in user required.

Workspace binding:
1. If user has multiple memberships and no `workspace_id`, return `400`.
2. If `workspace_id` is provided but user is not a member, return `403`.
3. Entitlement is workspace-scoped (`canVerify`).

Success response includes:
1. `status`, `reason`, `error`, `method`
2. `provider`, `providerEventId`
3. `verifiedAt`, `rawBodySha256`
4. `workspaceId`
5. `verificationToken` (when signing secret configured)

### `GET /api/certificates/[reportId]`
Purpose: Load a saved certificate for authenticated workspace members.

Auth:
1. Logged-in user required.

Success response:
`{ certificate: { ... } }`

Important:
1. This route currently returns certificate fields selected in `route.ts` and does not guarantee retention helper fields.
2. Expired certificate returns `410`.

### `GET /api/certificates/export`
Purpose: CSV export of workspace certificates.

Auth and gating:
1. Logged-in user.
2. Workspace membership with export-capable role.
3. Plan entitlement `canExportCsv` required.

Output:
1. CSV stream including certificate + retention + timestamp receipt columns.

## Delivery Reliability APIs

### `POST /api/workspaces/test-webhook`
Purpose: Test webhook send in two modes.

Mode A (legacy delivery-target mode):
1. Body: `{ workspace_id, target_id, payload? }`
2. Requires workspace manage role + `canUseForwarding`.
3. Enqueues and executes test delivery.

Mode B (API-key ingest mode):
1. Body: `{ api_key, payload? }`
2. Resolves workspace from API key hash (with rotation grace lookup).
3. Requires caller membership in resolved workspace.
4. Internally calls ingest path (no API key in URL).
5. Returns ingest-style output plus `mode: "ingest"`.

### `POST /api/ops/delivery/run`
Purpose: Process delivery spool jobs.

Auth modes:
1. Manual: owner/admin session + entitlement.
2. Service: `Authorization: Bearer <OPS_SERVICE_TOKEN>` (fallback `CRON_SECRET`) + entitlement.

Body:
1. `workspace_id` (required)
2. `limit` (optional, capped to 50)

Success:
`{ status: "ok", processed, results }`

### `POST /api/ops/delivery/health-check`
Purpose: Probe target and optionally resume breaker path.

Auth:
1. Owner/admin session.
2. Entitlement `canUseForwarding`.

Body:
1. `workspace_id`
2. `target_id`
3. `manual_resume` (optional boolean)

Success:
`{ status: "ok", target_id, response_status, breaker_state }`

### `POST /api/delivery/replay`
Purpose: Replay delivery from retained immutable raw body.

Auth:
1. Owner/admin session.
2. Entitlement `canUseForwarding`.

Body:
1. `workspace_id`
2. `ingested_event_id`
3. `target_id` (optional; if omitted, all active targets)

Semantics:
1. Returns `409 raw_body_unavailable` if replay payload was pruned.
2. Enqueues replay jobs with idempotency keys.

Success:
`{ status: "ok", id: <ingested_event_id>, queued_jobs: [] }`

## Reconciliation APIs (Pro/Team)

### `POST /api/ops/reconciliation/run`
Purpose: Run provider reconciliation.

Auth modes:
1. Manual owner/admin.
2. Service bearer token (`OPS_SERVICE_TOKEN` fallback `CRON_SECRET`).

Body:
1. `workspace_id` (required)
2. `batch_id` (optional)

Entitlement:
1. `canUseReconciliation`

Success:
`{ status: "ok", id, items_processed, discrepancies_found, coverage_mode, downstream_activation_status, case_stats, report }`

`case_stats` shape:
1. `opened`
2. `updated`
3. `resolved`
4. `errors`

### `GET /api/reconciliation/summary`
Purpose: Return recent runs + aggregate counters.

Auth:
1. Workspace member.
2. `canUseReconciliation`.

Query:
1. `workspace_id`

Success:
`{ status: "ok", workspace_id, coverage_mode, downstream_activation_status, downstream_status_message, totals, cases, runs }`

Totals include:
1. `missing_receipts`
2. `missing_deliveries`
3. `failed_verifications`
4. `provider_mismatches`
5. `downstream_not_activated`
6. `downstream_error`
7. `downstream_unconfigured`
8. `pending_activation`

`cases` totals include:
1. `total`
2. `open`
3. `pending`
4. `resolved`
5. `ignored`

Two-way mode language:
1. When downstream snapshots are not configured, `downstream_status_message` is:
`"Downstream activation status not configured."`

### `POST /api/reconciliation/state-snapshots`
Purpose: Insert destination-state snapshots for reconciliation.

Body:
1. `workspace_id`
2. `run_id`
3. `snapshots[]` required fields:
1. `target_id`
2. `provider` (`stripe | razorpay | lemon_squeezy`)
3. `provider_payment_id`
4. `downstream_state` (`activated | not_activated | error`)
5. `observed_at`
6. `state_hash`
4. `snapshots[]` optional fields:
1. `reason_code`
2. `object_ref`
3. `captured_data`
5. Top-level `target_id` optional (required in signed-callback ambiguity resolution when snapshots are ambiguous).

Auth modes:
1. Manual owner/admin + entitlement.
2. Signed callback headers:
1. `x-lanceiq-signature`
2. `x-lanceiq-timestamp`
3. `x-lanceiq-nonce`

Signed callback requirements:
1. Valid signature against active workspace signing secret or target secret.
2. Valid timestamp window.
3. Nonce replay protection.

Success:
`{ status: "ok", run_id, inserted }`

### `GET /api/reconciliation/cases`
Purpose: List reconciliation cases for a workspace.

Auth:
1. Workspace member.
2. `canUseReconciliation`.

Query:
1. `workspace_id` (required)
2. `status` (optional: `open | pending | resolved | ignored`)
3. `limit` (optional, default `50`, max `200`)

Success:
`{ status: "ok", workspace_id, count, cases }`

### `GET /api/reconciliation/cases/[id]`
Purpose: Load one reconciliation case and timeline events.

Auth:
1. Workspace member.
2. `canUseReconciliation`.

Query:
1. `workspace_id` (required)

Success:
`{ status: "ok", workspace_id, case, events }`

### `POST /api/reconciliation/cases/[id]/replay`
Purpose: Owner/admin replay action for one reconciliation case.

Auth:
1. Owner/admin workspace role.
2. `canUseReconciliation`.

Body:
1. `workspace_id` (required)

Semantics:
1. Internal replay only (delivery jobs from retained raw body).
2. Returns `409 raw_body_unavailable` when replay source body has been pruned.

Success:
`{ status: "ok", id, queued_jobs, queued_count }`

### `POST /api/reconciliation/cases/[id]/resolve`
Purpose: Owner/admin manual case resolution.

Auth:
1. Owner/admin workspace role.
2. `canUseReconciliation`.

Body:
1. `workspace_id` (required)
2. `resolution_note` (required)

Success:
`{ status: "ok", id, case }`

## Evidence Pack APIs (Pro/Team)

### `POST /api/evidence-packs/generate`
Purpose: Generate and seal evidence pack.

Body:
1. `workspace_id`
2. `title`
3. `description` (optional)
4. `run_id` (optional)
5. `expires_at` (optional)

Auth:
1. Owner/admin session.
2. `canUseReconciliation`.

Success:
`{ status: "ok", id, pack_reference_id, manifest_sha256, signature_algorithm }`

### `GET /api/evidence-packs/[id]`
Purpose: Fetch pack + artifacts.

Query:
1. `workspace_id`

Auth:
1. Workspace member.
2. `canUseReconciliation`.

Success:
`{ status: "ok", pack, artifacts }`

### `POST /api/evidence-packs/[id]/verify`
Purpose: Verify pack manifest hash + signature.

Body:
1. `workspace_id`

Auth:
1. Workspace member.
2. `canUseReconciliation`.

Success:
`{ status: "ok", id, verified, verification_status, hash_match, signature_valid, details, error }`

Note:
1. Verification result is returned and audit-logged.
2. Current implementation does not persist verification fields back to sealed pack rows.

## Billing and Identity Contracts

### `GET /api/dodo/checkout`
Purpose: Start checkout for authenticated workspace member.

Query:
1. `workspace_id` (required)
2. `plan` (`pro` default, `team` optional)

Behavior:
1. Requires login and workspace membership.
2. Redirects to provider checkout URL.
3. Return URL points to dashboard settings payment-success path.

### `POST /api/dodo/webhook`
Purpose: Billing webhook processor and plan mutation source of truth.

Rules:
1. Signature verification required.
2. Activation events require workspace metadata proof.

### `POST /api/dodo/verify`
Purpose: Deprecated email-unlock path.

Behavior:
1. Returns `410` with `status: "deprecated"`.
2. Must not mutate plans.

### `POST /api/dodo/verify-payment`
Purpose: Proof verification only.

Body:
1. `payment_id`
2. `workspace_id`

Rules:
1. Authenticated user required.
2. Workspace membership required.
3. Metadata proof (`workspace_id`, `user_id`) must match.
4. No plan mutation.
5. No customer PII in response.

### `GET /api/sso/saml/metadata`
Behavior:
1. Returns SP metadata.
2. Advertises signed assertions required.

### `POST /api/sso/saml/acs`
Security requirements:
1. Signed assertion required.
2. Issuer/audience/destination/time validation required.
3. Replay blocked by assertion cache.
4. Provider must be enabled + verified for normalized domain.

### `GET /api/scim/v2/Users`
Purpose: List SCIM users for a workspace/provider token.

Auth:
1. `Authorization: Bearer <scim_token>`

Behavior:
1. Token is looked up by SHA-256 hash.
2. Revoked tokens are rejected.
3. `last_used_at` is updated on successful auth.

### `POST /api/scim/v2/Users`
Purpose: Provision or upsert SCIM user mapping + workspace membership.

Auth:
1. `Authorization: Bearer <scim_token>`

Behavior:
1. Creates user if missing.
2. Upserts `identity_mappings`.
3. Upserts workspace membership role derived from groups.

### `PATCH /api/scim/v2/Users/:id`
Purpose: Update SCIM user.

Behavior:
1. `active=false` removes membership.
2. `groups` updates mapped workspace role.
3. Email updates sync mapping email.

### `DELETE /api/scim/v2/Users/:id`
Purpose: Deprovision SCIM user from workspace.

Behavior:
1. Removes workspace membership.
2. Unlinks identity mapping user reference.

## Governance and Workspace Ops APIs

### `GET /api/audit-logs`
Purpose: Cursor-paginated audit log fetch.

Query:
1. `workspace_id` (required UUID)
2. `limit` (optional, default `50`, max `200`)
3. `cursor` (optional ISO timestamp)
4. `cursor_id` (optional UUID)

Auth and gating:
1. Logged-in workspace owner/admin role required.
2. Effective entitlement `canViewAuditLogs` is required by policy/model.

Success:
`{ data, next_cursor, next_cursor_id }`

### `POST /api/ingest/legal-holds`
Purpose: Create legal hold.

Body:
1. `workspace_id`
2. `reason` (optional)

Auth and gating:
1. Logged-in user with legal-hold create role (`owner` or `legal_hold_manager`).
2. Entitlement `canUseLegalHold`.

### `PATCH /api/ingest/legal-holds`
Purpose: Deactivate legal hold.

Body:
1. `workspace_id`
2. `hold_id`

Auth and gating:
1. Logged-in user with legal-hold deactivate role (`owner` or `admin`).
2. Entitlement `canUseLegalHold`.

### `GET /api/access-review/cycles`
### `POST /api/access-review/cycles`
Purpose: List/create access-review cycles.

Auth and gating:
1. Logged-in workspace owner/admin.
2. Entitlement `canUseAccessReviews`.

### `POST /api/access-review/decisions`
Purpose: Write attestation decisions for a cycle.

Body:
1. `cycle_id`
2. `target_user_id`
3. `decision`
4. `notes` (optional)

Auth and gating:
1. Logged-in workspace owner/admin on cycle workspace.
2. Entitlement `canUseAccessReviews`.

### `GET /api/access-review/schedules`
### `POST /api/access-review/schedules`
Purpose: Read/write automation schedule for access reviews.

Auth and gating:
1. `GET`: workspace member + entitlement `canUseAccessReviews`.
2. `POST`: workspace owner/admin + entitlement `canUseAccessReviews`.

### `GET /api/ops/incidents`
### `POST /api/ops/incidents`
### `PATCH /api/ops/incidents`
Purpose: Incident reporting and updates.

Workspace-scoped auth:
1. `GET`: workspace member + entitlement `canUseSlaIncidents`.
2. `POST/PATCH`: workspace owner/admin + entitlement `canUseSlaIncidents`.

Global incident path:
1. `workspace_id` omitted uses global incident mode.
2. Requires `x-lanceiq-incidents-token`.

### `GET /api/ops/sla`
Purpose: Compute SLA summary window from incidents and policy rows.

Query:
1. `workspace_id` (required UUID)
2. `window_days` (optional, default `30`)

Auth and gating:
1. Workspace member.
2. Entitlement `canUseSlaIncidents`.

### `GET /api/ops/replication/status`
Purpose: Read replication region status and derived summary.

Auth and gating:
1. Workspace owner/admin.
2. Team entitlement (current predicate uses Team plan gate).

### `GET /api/ops/runbooks/checks`
Purpose: Read runbook checks + latest results.

Auth and gating:
1. Workspace member.
2. Team entitlement (current predicate uses Team plan gate).

### `POST /api/workspaces/keys/rotate`
Purpose: Rotate workspace API key.

Body:
1. `workspace_id`
2. `reason` (optional)

Auth and gating:
1. Workspace owner only.
2. Entitlement `canRotateKeys`.

Behavior:
1. New key returned once in response.
2. Old key hash tracked for 24-hour grace lookup.

### `GET /api/workspaces/keys/rotations`
Purpose: List workspace key-rotation history.

Auth and gating:
1. Workspace owner/admin.
2. Entitlement `canRotateKeys`.

## Automation/Internal Ops Endpoints
These endpoints are token-protected operational interfaces:
1. `POST /api/cron/cleanup-raw-bodies` (`Authorization: Bearer <CRON_SECRET>`)
2. `POST /api/ops/retention/run` (`x-lanceiq-retention-token`)
3. `POST /api/ops/runbooks/run` (`x-lanceiq-runbook-token`)
4. `POST /api/access-review/automation/run` (`x-lanceiq-access-review-token`)
5. `POST /api/legal-holds/automation/run` (`x-lanceiq-legal-hold-token`)

## Data Schema Minimums
### `IngestedEvent`
Required fields:
1. `id`
2. `workspace_id`
3. `received_at`
4. `raw_body_sha256`
5. `headers`
6. `payload`
7. `signature_status`
8. `signature_reason`
9. `provider_event_id`

Retention semantics:
1. `raw_body` may be null after retention pruning.
2. Legal hold can block pruning.

### `DeliveryJob`
Required fields:
1. `id`
2. `workspace_id`
3. `target_id`
4. `status`
5. `ingested_event_id` (when originated from ingest/replay)
6. `idempotency_key`

### `DeliveryAttempt`
Required fields:
1. `id`
2. `job_id`
3. `attempt_number`
4. `response_status`
5. `response_body` (stored as response hash marker in current implementation)
6. `duration_ms`
7. `success`
8. `error_message`

### `ReconciliationRun`
Required fields:
1. `id`
2. `workspace_id`
3. `status`
4. `items_processed`
5. `discrepancies_found`
6. `report_json`

### `EvidencePack`
Required fields:
1. `id`
2. `workspace_id`
3. `pack_reference_id`
4. `status`
5. `manifest_sha256`
6. `signature`
7. `signature_algorithm`
8. `sealed_at`

## Evidence Language Boundary
Any UI/API copy must remain within:
1. receipt by LanceIQ,
2. verification computed by LanceIQ,
3. delivery attempt outcomes observed by LanceIQ.
