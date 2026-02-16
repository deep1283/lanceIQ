# LanceIQ Status

Last updated: 2026-02-16
Owner: Product Owner

## Current State
LanceIQ is operating as a payments-first webhook evidence platform with:
1. Receipt + verification evidence.
2. Pro/Team forwarding reliability (retry, breaker, replay, delivery attempts).
3. Pro/Team reconciliation (two-way and optional three-way with downstream snapshots).
4. Pro/Team evidence-pack APIs (manifest hash + signature verify).
5. Workspace-scoped entitlement and context alignment across dashboard SSR/UI/API.

## Readiness Snapshot
1. V1: Complete
2. V2: Complete
3. V3: Complete
4. V4: Complete
5. V5: Complete
6. V5.1: Complete
7. V6: Complete
8. V6.1: Complete
9. V6.2: Complete (progressive reconciliation coverage, cases lifecycle, auto-resolve)

## Implemented Milestones
### Evidence + verification baseline
1. Ingest contracts: `status + id`, duplicate semantics, standardized errors.
2. DB idempotency for provider events.
3. Canonical JSON hash + raw body hash storage.
4. RFC-3161 receipt anchoring support.
5. Scope-of-proof language in evidence UI/PDF.

### Governance and enterprise controls
1. Legal hold schema + DB enforcement.
2. Audit logs API with pagination.
3. Team roles (`viewer`, `exporter`, `legal_hold_manager`) and role checks.
4. SSO/SCIM/access review/SLA-incidents/key rotation feature set.
5. Workspace context canonicalization across dashboard layout/admin/settings.

### Security hardening
1. SAML fail-closed validation and replay protection.
2. Deprecated insecure billing verify endpoint (`/api/dodo/verify` -> `410`).
3. `/api/dodo/verify-payment` proof-only, workspace-bound, no PII response.
4. Rate-limit cardinality cap in in-memory limiter.

### V6 reliability + reconciliation
1. Forwarding entitlements introduced (`canUseForwarding`, `canUseReconciliation`).
2. Ingest enqueue is best-effort and non-blocking.
3. Forwarding uses immutable raw-body envelope (`raw_body_base64`).
4. Delivery runner API with manual + service-token execution.
5. Circuit breaker + health-check API.
6. Replay API with explicit `raw_body_unavailable` behavior.
7. Reconciliation runner persists provider objects and discrepancy counters.
8. Reconciliation summary API for entitled workspaces (Pro/Team).
9. Signed callback-capable state snapshot API.
10. Evidence pack generate/get/verify APIs.
11. Test-webhook API supports both target mode and API-key ingest mode.

### V6.2 progressive reconciliation
1. Ingest derives `provider_payment_id` for Stripe/Razorpay/Lemon Squeezy when derivable.
2. Reconciliation uses explicit coverage modes:
1. `two_way_active`
2. `three_way_active`
3. Two-way mode always returns explicit downstream message and avoids downstream activation overclaims.
4. Reconciliation cases API added (`list`, `detail`, `replay`, `resolve`).
5. Case timeline events include `created`, `status_change`, `replay_triggered`, `resolved`, `auto_resolved`.
6. Runner auto-resolves active cases when current signals become healthy (outside grace windows).
7. Frontend admin reconciliation UI now supports summary, case list/detail, and replay/resolve actions.

### Frontend alignment delivered
1. Dashboard Sources tab includes forwarding config panel.
2. Recent ingestion list includes delivery status/attempt context.
3. Payment Delivery Recovery panel with replay actions.
4. Admin sidebar includes Reconciliation section (visible-but-locked when not entitled).
5. Admin reconciliation view supports manual run + discrepancy counters.
6. Add Source modal test send now uses `/api/workspaces/test-webhook` with structured inline errors.

## Remaining Gaps (Known)
1. Provider signature verification support is still limited to Stripe, Razorpay, and Lemon Squeezy (PayPal still unsupported in verification engine).
2. Evidence-pack verification response is not persisted to sealed pack rows (by design for immutability).
3. Storage-level WORM/object-lock is not implemented (app-level immutability + legal hold is current baseline).
4. Reconciliation provider integration management is backend/data-driven; no dedicated end-user setup wizard yet.
5. `provider_payment_id` can still be null when upstream payloads do not expose a derivable payment identifier.

## Post-V6.2 Optional Roadmap
1. Destination-state drill-down UI on top of snapshot records.
2. Storage-level WORM add-on for strict regulated deployments.
3. Additional provider verification adapters.
