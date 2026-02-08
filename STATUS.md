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

## In Progress
1. None active (ready to start next phase).

## Next Up (V1 to V2)
1. Add scope-of-proof language to marketing pages and download flows.
2. Implement audit logs API endpoint and UI for owners/admins.
3. Document immutability policy in user-facing terms.
4. Add legal hold policy and minimal schema changes.
5. Define retention tier behavior in UI and exports.

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
