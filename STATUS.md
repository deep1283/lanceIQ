# LanceIQ Status

Last updated: 2026-02-12
Owner: Product Owner (You)

## Current State
1. Architecture, contracts, ownership, decisions, and atomization docs are in place.
2. Scope-of-proof language is embedded in certificate PDF and verification page.
3. Minimal role helpers added for owner/admin/member checks.

## Completed
1. ARCHITECTURE.md created with scope-of-proof and enterprise roadmap.
2. CONTRACTS.md created and aligned with ingest headers and certificate fields.
3. DECISIONS.md created with core architectural decisions.
4. OWNERSHIP.md updated with tiered boundaries and approval rules.
5. ATOMIZATION.md created with feature-level boundaries.
6. Scope-of-proof disclaimer added to certificate template and verification page.
7. Role helpers introduced and used in server actions.
8. Ingest contract compliance (status + id, 202 for queued, 200 for duplicate).
9. Standardized ingest error responses.
10. Plan quota enforcement on ingest endpoints.
11. Audit logging for workspace/member actions.
12. Alert delivery hardening and input validation.
13. Alert settings gating honors grace period.
14. workspace_usage_periods.event_count defaulted to 0 for safe increment trigger.
15. Audit logs API: read-only, paginated, owner/admin, team-plan only via RLS.
16. Scope-of-proof language added to marketing pages and tool download flow.
17. Tool UI shows read-only audit logs for team owners/admins.
18. Legal hold schema, RLS, and DB-level deletion blocks added.
19. Evidence immutability enforced at DB layer (updates blocked except raw_body expiry cleanup).
20. DB-level idempotency for provider_event_id (workspace+provider unique).
21. Usage metering defaults and trigger safe increment.
22. Retention status wired into tool view, verification page, and PDF export.
23. Legal hold status wired into tool view for owners/admins.
24. V3 DB: timestamp_receipts table with RLS and append-only enforcement.
25. V3 DB: workspace roles expanded to viewer/exporter/legal_hold_manager.
26. V3 DB: canonical_json_sha256 added to ingested_events with indexes.
27. V3 Backend: RFC-3161 anchoring on ingest with timestamp_receipts.
28. V3 Backend: canonical_json_sha256 stored on ingested_events.
29. V3 Backend: role enforcement for viewer/exporter/legal_hold_manager.
30. V3 Backend: export includes anchor metadata and canonical hash.
31. V3 Frontend: RFC-3161 timestamp proof displayed in certificate and verification views.
32. V3 Frontend: role-based UI gating across dashboard, tool, and settings.
33. V3 Frontend: compliance pages added (SOC2/DPA/SLA templates).
34. V4 Backend: SAML SSO, SCIM, SLA incidents, access review, and key rotation implemented.
35. V4 DB: SSO/SCIM identity mappings, access reviews, SLA/incidents, key rotation, retention policies, and RLS.
36. V4 Frontend: SSO/SCIM, SLA/Incidents, Access Reviews, and Key Rotation UI shipped.
37. V4 Frontend: retention placeholders removed in certificate and verification views.
38. V5 Backend: batch ingest processed/failed counts updated idempotently.
39. V5 DB: retention/legal hold enforcement, DR replication status, runbook checks, and batch ingest counters.
40. V5 Backend: replication status API, runbook checks API, retention runner endpoint.
41. V5 Frontend: DR replication status, runbook checks, and retention automation UI.
42. Provider expansion: Lemon Squeezy added (verification + provider selection).
43. Security hardening: SAML verification is fail-closed (signed assertion, issuer/audience/destination/time checks, replay protection).
44. Security hardening: `/api/dodo/verify` deprecated with explicit `410` and no plan mutation.
45. Security hardening: `/api/dodo/verify-payment` requires auth + workspace-bound proof and no PII response fields.
46. Security hardening: SSO provider domain normalization and verified-domain enforcement at DB level.
47. Security hardening: in-memory rate limiter enforces `uniqueTokenPerInterval` cap.
48. Frontend alignment: removed email-unlock purchase flow and aligned success flow to secure payment-proof contract.
49. Security regression tests added for SAML, billing proof, and rate limiter behavior.
50. V5.1 alignment: shared workspace context resolver added for Dashboard layout/admin/settings with deterministic fallback (hint -> cookie -> primary).
51. V5.1 alignment: Team-feature gating now resolves from effective workspace entitlements in settings/admin/layout, removing raw-plan drift.
52. V5.1 alignment: `/api/verify-signature` is workspace-scoped (`workspace_id` aware), blocks ambiguous multi-workspace requests, and enforces workspace membership + entitlements.
53. V5.1 alignment: frontend verification flow sends workspace context to signature verification API.
54. V5.1 alignment: billing activation trust boundary preserved (verify endpoints proof-only; webhook-only mutation) with regression coverage retained.

## In Progress
1. None active (ready to start next phase).

## Next Up (V6 Provider Expansion)
1. Add low-effort providers (Paddle).
2. Add enterprise providers (PayPal/JWS, Adyen) as a second wave.
3. Wire non-email access review notifications (Slack/webhook) after config is defined.

## Enterprise Roadmap (Post-V5)
1. External audit/attestation (SOC2 Type II).
2. Multi-region DR drills with published RTO/RPO.
3. Provider verification expansion.

## Risks / Gaps
1. External audit/attestation not completed yet.
2. Provider verification limited to Stripe, Razorpay, and Lemon Squeezy.
3. Non-email access review notifications not wired yet.

## Readiness
1. V1: Complete.
2. V2: Complete.
3. V3: Complete.
4. V4: Complete.
5. V5: Complete.
