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
18. Legal hold schema, RLS, and DB-level deletion blocks added.
19. Evidence immutability enforced at DB layer (updates blocked except raw_body expiry cleanup).
20. DB-level idempotency for provider_event_id (workspace+provider unique).
21. Usage metering defaults and trigger safe increment.
22. Retention status wired into tool view, verification page, and PDF export.
23. Legal hold status wired into tool view for owners/admins.

## In Progress
1. None active (ready to start next phase).

## Next Up (V1 to V2)
1. Expand verification support for additional providers (PayPal/JWS).
2. Add ingest request size limits and structured error codes.

## Enterprise Roadmap (V3)
1. Time credibility: external anchoring or RFC-3161 timestamping.
2. Stronger role model: viewer, exporter, legal-hold manager.
3. Compliance package: SOC2 controls mapping, DPA, SLA templates.

## Risks / Gaps
1. No external timestamp anchoring yet.
2. No legal hold implementation yet.
3. Retention visibility not yet surfaced in UI/exports.

## Readiness
1. V1: Complete.
2. V2: Planned.
3. V3: Planned.
