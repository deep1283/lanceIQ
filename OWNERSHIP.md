# LanceIQ Ownership

## Rule of Engagement
No one edits files outside their assigned area. If ownership is unclear, do not touch the file.
See ATOMIZATION.md for feature-level boundaries.

## Read-First Requirement
Before making changes, every chat must read:
1. OWNERSHIP.md
2. ATOMIZATION.md
3. ARCHITECTURE.md
4. CONTRACTS.md
5. DECISIONS.md
6. STATUS.md

## Tier 1 — Protected (Almost Frozen)
Changes require rationale plus a backward-compatibility note.
1. app/api/ingest
2. lib/verification/*
3. lib/hashing/*
4. lib/certificates/*
5. lib/timestamps/*
6. supabase/migrations
7. CONTRACTS.md

## Tier 2 — Owned but Evolvable
Can evolve but may not break contracts.
1. app/api/certificates
2. app/api/verify
3. app/api/audit-logs
4. lib/pdf/*
5. lib/providers/*

## Tier 3 — Flexible
UX may change; evidence must not.
1. components/*
2. app/ui/*
3. styles/*
4. docs/* (except CONTRACTS.md)

## Ownership Map
1. Platform Contracts: CONTRACTS.md, ARCHITECTURE.md, DECISIONS.md
Owner: Product Owner

2. Ingestion and Verification: app/api/ingest, lib/verification/*
Owner: Backend Owner

3. Evidence Storage and Migrations: supabase/migrations
Owner: Database Owner

4. UI and Certificate Rendering: app/verify, app/tool, components
Owner: Frontend Owner

5. Billing and Plans: app/api/dodo, app/actions/subscription
Owner: Payments Owner

## Role Cards
Use these to assign a human to a role with clear boundaries.

**Product Owner**
1. Owns: CONTRACTS.md, ARCHITECTURE.md, DECISIONS.md.
2. May approve Tier 1 changes.
3. Responsible for scope-of-proof language and liability boundaries.

**Backend Owner**
1. Owns: app/api/ingest, lib/verification/*, lib/hashing/*, lib/timestamps/*.
2. Must preserve contracts and append-only evidence semantics.
3. Requires Product Owner approval for Tier 1 changes.

**Database Owner**
1. Owns: supabase/migrations.
2. Responsible for RLS, retention, and data integrity.
3. Requires Product Owner approval for evidence schema changes.

**Frontend Owner**
1. Owns: app/verify, app/tool, components, styles, UI work.
2. Must keep scope-of-proof text intact in evidence views and PDFs.
3. Cannot change contracts or evidence semantics.

**Payments Owner**
1. Owns: app/api/dodo, app/actions/subscription.
2. Responsible for billing workflows and plan gating.
3. Cannot modify evidence records or verification logic.

## Change Rules
1. Tier 1 changes require explicit approval, rationale, and a backward-compatibility note.
2. Contract changes require a decision record.
3. Ownership transfers must be recorded here.

## Approval Rules
1. Product Owner approves all Tier 1 changes and all contract changes.
2. Product Owner approves any changes that affect evidence semantics or legal language.
3. Database Owner approves migration changes after Product Owner sign-off.

## Status Ownership
STATUS.md is owned by the Product Owner. Other roles must report changes in their response only.
