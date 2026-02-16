# LanceIQ Architecture

## Purpose
LanceIQ is a payment-webhook evidence system that combines:
1. Receipt evidence (what LanceIQ received).
2. Verification evidence (how LanceIQ verified signatures).
3. Reliability evidence (how LanceIQ attempted forwarding).
4. Team reconciliation evidence (provider pulls vs receipts vs deliveries, with optional signed destination-state snapshots).

## One-Line Principle
LanceIQ records and verifies receipt, not business truth.

## Scope Of Proof
LanceIQ attests only to:
1. Receipt by LanceIQ at time `T`.
2. Payload and headers LanceIQ received.
3. Verification status LanceIQ computed.
4. For forwarding mode: LanceIQ delivery attempt outcomes (HTTP/network observations).

LanceIQ does not attest to provider intent, downstream processing truth, or settlement.

## High-Level Flow
```text
Provider webhook
  -> /api/ingest or /api/ingest/[apiKey]
  -> Signature verification + evidence persistence
  -> (Optional) forwarding enqueue
  -> Delivery runner (retry + breaker + attempts)
  -> Dashboard/Admin visibility (delivery + replay)
  -> (Team) reconciliation runner + summary
  -> (Team) evidence pack generation + verify
```

## Core Modules
1. Ingestion core: `/Users/deepmishra/vscode/LanceIQ/lib/ingest-core.ts`
2. Provider verification: `/Users/deepmishra/vscode/LanceIQ/lib/signature-verification.ts`
3. Entitlements and effective billing state: `/Users/deepmishra/vscode/LanceIQ/lib/plan.ts`, `/Users/deepmishra/vscode/LanceIQ/lib/entitlements.ts`
4. Delivery reliability: `/Users/deepmishra/vscode/LanceIQ/lib/delivery/service.ts`, `/Users/deepmishra/vscode/LanceIQ/lib/delivery/security.ts`, `/Users/deepmishra/vscode/LanceIQ/lib/delivery/payload.ts`
5. Reconciliation pulls: `/Users/deepmishra/vscode/LanceIQ/lib/delivery/reconciliation.ts`
6. Workspace context resolution: `/Users/deepmishra/vscode/LanceIQ/lib/workspace-context.ts`
7. Audit logging: `/Users/deepmishra/vscode/LanceIQ/utils/audit.ts`

## Data Model (Implemented)
### Workspace and identity
1. `workspaces`
2. `workspace_members`
3. `sso_providers`
4. `identity_mappings`
5. `scim_tokens`

### Evidence core
1. `ingested_events`
2. `verification_history`
3. `certificates`
4. `timestamp_receipts`
5. `audit_logs`

### Reliability + forwarding
1. `workspace_delivery_targets`
2. `workspace_delivery_signing_keys`
3. `delivery_jobs`
4. `delivery_spool`
5. `delivery_attempts`
6. `delivery_breakers`
7. `delivery_callback_replay_cache`

### Reconciliation + packs
1. `provider_integrations`
2. `provider_objects`
3. `reconciliation_runs`
4. `destination_state_snapshots`
5. `evidence_packs`
6. `evidence_pack_artifacts`

### Governance/ops
1. `workspace_legal_holds`
2. `access_review_cycles`
3. `access_review_decisions`
4. `incident_reports`
5. `sla_policies`
6. `retention_jobs`
7. `retention_executions`
8. `runbook_checks`
9. `runbook_check_results`

## Reliability Semantics (As Implemented)
1. Forwarding is plan-gated by `canUseForwarding` (Pro/Team).
2. Ingest never fails solely because forwarding enqueue fails.
3. Delivery retries are worker-driven from `delivery_spool`.
4. Default max attempts is `5` (env override via `DELIVERY_MAX_ATTEMPTS`).
5. Breaker opens at 5 consecutive `5xx` responses per target host.
6. Replay requires retained immutable raw body.
7. UI labels "DLQ" map to failed/cancelled delivery job outcomes.

## Reconciliation Semantics (As Implemented)
1. Team-gated by `canUseReconciliation`.
2. Pulls Stripe/Razorpay/Lemon Squeezy provider objects.
3. Computes discrepancy counters from provider objects, receipts, and deliveries.
4. V6.1 snapshots can be inserted manually (owner/admin) or via signed callback headers with nonce/timestamp replay protection.

## Evidence Pack Semantics (As Implemented)
1. Generate endpoint creates manifest JSON, computes SHA-256, signs with active workspace HMAC key, and seals pack.
2. Verify endpoint recomputes hash/signature and returns verification result.
3. Verification is audit-logged.

## Security Architecture
1. RLS protects workspace-scoped reads/writes.
2. Service role is used for controlled server workflows.
3. Sensitive secrets are encrypted at rest where configured.
4. SAML is fail-closed with signature + issuer/audience/destination/time/replay checks.
5. Forwarding requests are SSRF-guarded and signed.
6. Plan activation is webhook-driven; proof endpoints do not mutate plan state.

## Workspace Context Canonicalization
Dashboard `layout`, `admin`, and `settings` resolve workspace through one resolver with order:
1. explicit `workspace_id` hint
2. workspace cookie
3. deterministic primary workspace

## Out Of Scope
1. Proving provider intent.
2. Proving downstream business processing completion.
3. Proving settlement.
4. Guaranteeing destination-side processing success.
5. Mutating webhook payload content before forwarding.
6. Acting as accounting or compliance certification authority.

## Contract Discipline
Any change to evidence semantics, API contracts, or immutability policy requires updates in:
1. `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`
2. `/Users/deepmishra/vscode/LanceIQ/DECISIONS.md`
