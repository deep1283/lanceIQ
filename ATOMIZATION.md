# LanceIQ Atomization

## Purpose
Define feature atoms so parallel agents can work without boundary drift.

## Rules
1. Atoms are feature paths, not single functions.
2. Cross-atom edits require explicit handoff notes.
3. Tier-1 files remain protected regardless of atom.

## Atoms

### Atom A: Ingestion + Verification Core
Owner: Backend
Scope:
1. `app/api/ingest/*`
2. `lib/ingest-core.ts`
3. `lib/signature-verification.ts`
4. `lib/timestamps/*`
Boundaries:
1. Preserve ingest contracts.
2. Preserve receipt evidence semantics.

### Atom B: Delivery Reliability
Owner: Backend
Scope:
1. `lib/delivery/*`
2. `app/api/ops/delivery/*`
3. `app/api/delivery/replay/*`
4. `app/api/workspaces/test-webhook/*`
Boundaries:
1. Ingest must remain non-blocking on enqueue failures.
2. Replay must use immutable retained raw body.

### Atom C: Reconciliation + Evidence Packs
Owner: Backend
Scope:
1. `app/api/ops/reconciliation/*`
2. `app/api/reconciliation/*`
3. `app/api/evidence-packs/*`
4. `lib/delivery/reconciliation.ts`
Boundaries:
1. Team-gated entitlements only.
2. No PII overreach in provider-object summary surfaces.

### Atom D: Workspace Context + Entitlements
Owner: Payments + Backend
Scope:
1. `lib/plan.ts`
2. `lib/entitlements.ts`
3. `app/actions/subscription.ts`
4. `lib/workspace-context.ts`
Boundaries:
1. Workspace-scoped entitlements are canonical for gating.
2. Avoid raw `workspace.plan` gating in UI/API logic.

### Atom E: Governance APIs
Owner: Backend
Scope:
1. `app/api/audit-logs/*`
2. `app/api/access-review/*`
3. `app/api/ops/sla/*`
4. `app/api/ops/incidents/*`
5. `app/api/ingest/legal-holds/*`
Boundaries:
1. Audit is append-only.
2. Team-only governance remains entitlement-gated.

### Atom F: Dashboard + Tool UX
Owner: Frontend
Scope:
1. `app/dashboard/*`
2. `components/*`
3. `app/tool/*`
4. `app/verify/*`
Boundaries:
1. Scope-of-proof wording must remain intact.
2. Locked-state UX must not bypass server/API gating.

### Atom G: Billing + Identity Trust Boundaries
Owner: Payments + Backend
Scope:
1. `app/api/dodo/*`
2. `app/api/sso/saml/*`
3. `app/api/scim/*`
Boundaries:
1. Plan mutation via billing webhook only.
2. SAML must remain fail-closed.

### Atom H: Database Integrity
Owner: DB
Scope:
1. `supabase/migrations/*`
Boundaries:
1. RLS and immutability guarantees cannot be weakened.
2. Index/constraint changes require compatibility notes.
