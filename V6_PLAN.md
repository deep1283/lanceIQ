# V6 / V6.1 Implementation Notes

Owner: Product Owner
Scope: Payments reliability + compliance + reconciliation

## Status
1. V6 core: implemented.
2. V6.1 signed snapshot callback: implemented.
3. Remaining items are optimization and UX expansion, not blockers for current V6 contracts.

## What Is Implemented
### Reliability layer
1. Ingest can enqueue forwarding jobs after evidence write.
2. Forwarding is entitlement-gated by `canUseForwarding`.
3. Delivery worker (`/api/ops/delivery/run`) supports manual and service-token execution.
4. Retry behavior is worker-driven with configurable attempt cap.
5. Circuit breaker exists per target host and opens on repeated 5xx.
6. Health-check endpoint can manually resume and probe a target.
7. Replay endpoint re-enqueues from immutable raw body evidence.

### Reconciliation layer
1. Team-gated by `canUseReconciliation`.
2. Reconciliation runner pulls provider objects (Stripe/Razorpay/Lemon Squeezy).
3. Runs store discrepancy counters in `report_json`.
4. Summary endpoint aggregates run counters for admin UI.

### V6.1 state snapshots
1. Snapshot endpoint supports owner/admin manual inserts.
2. Snapshot endpoint supports signed callback auth with nonce/timestamp replay checks.
3. Snapshot rows persist under reconciliation run context.

### Evidence packs
1. Generate endpoint seals pack with manifest SHA-256 + HMAC signature.
2. Get endpoint returns pack metadata and artifacts.
3. Verify endpoint recomputes integrity and returns verification result.

### Frontend surfaces
1. Sources tab shows forwarding state/config controls.
2. Payment recovery panel shows last-24h matched/missing deliveries.
3. Replay actions are exposed for missing/DLQ flows with role checks.
4. Admin includes Team-only reconciliation tab with manual run trigger.
5. Add Source modal test uses `/api/workspaces/test-webhook` and inline structured errors.

## Canonical Defaults In Code
1. Delivery max attempts default: `5` (`DELIVERY_MAX_ATTEMPTS` override).
2. Delivery lock window default: `60s` (`DELIVERY_LOCK_SECONDS` override).
3. Reconciliation provider timeout default: `12000ms` (`RECONCILIATION_PROVIDER_TIMEOUT_MS` override).
4. Ops service-token auth for runners: `OPS_SERVICE_TOKEN` (fallback `CRON_SECRET`).

## Security Boundaries (Current)
1. Forwarding outbound calls are SSRF-guarded.
2. Forwarded requests are signed (`x-lanceiq-signature` family headers).
3. Callback replay protection uses nonce/timestamp cache.
4. Billing plan mutation remains webhook-only.
5. Evidence semantics remain receipt-first; no claims of downstream business truth.

## Known Constraints
1. Forwarding UI manages a primary target per workspace; DB model can store multiple targets.
2. UI "DLQ" state maps to failed/cancelled delivery outcomes.
3. Evidence-pack verify does not mutate sealed pack rows.

## Optional Next Steps
1. Reconciliation drill-down tables for snapshot-level mismatches.
2. Storage-object-lock WORM add-on for stricter regulated buyers.
3. Broader provider verification support.
