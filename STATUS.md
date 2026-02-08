# LanceIQ Status

Last updated: 2026-02-07
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
8. Ingest responses now return status + id and use 202 for queued, 200 for duplicate.
9. Plan quota enforcement added to /api/ingest/[apiKey].
10. Audit logs now recorded for workspace create/delete and member invite/remove.
11. Alert delivery hardened (HTTPS validation, timeout, safe logging).
12. Server-side validation added for workspace creation and member invites.
13. Alert settings gating now honors canceled-but-active grace period.

## In Progress
1. None active (ready to start next phase).

## Next Up (V1 to V2)
1. Define legal hold policy and add backend enforcement flows.
2. Surface retention behavior in UI and exports.
3. Add DB-level idempotency constraint for provider event IDs.

## Enterprise Roadmap (V3)
1. Time credibility: external anchoring or RFC-3161 timestamping.
2. Stronger role model: viewer, exporter, legal-hold manager.
3. Compliance package: SOC2 controls mapping, DPA, SLA templates.

## Risks / Gaps
1. No external timestamp anchoring yet.
2. No legal hold implementation yet.
3. Audit logs exist in DB but no API surface or UI yet.

## Readiness
1. V1: Partially complete.
2. V2: Planned.
3. V3: Planned.
