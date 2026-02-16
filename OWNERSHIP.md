# LanceIQ Ownership

## Rule Of Engagement
No one edits files outside assigned ownership without explicit approval.

## Read-First Requirement
1. `/Users/deepmishra/vscode/LanceIQ/OWNERSHIP.md`
2. `/Users/deepmishra/vscode/LanceIQ/ATOMIZATION.md`
3. `/Users/deepmishra/vscode/LanceIQ/ARCHITECTURE.md`
4. `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`
5. `/Users/deepmishra/vscode/LanceIQ/DECISIONS.md`
6. `/Users/deepmishra/vscode/LanceIQ/STATUS.md`
7. `/Users/deepmishra/vscode/LanceIQ/OPERATING_RULES.md`

## Tier 1 — Protected (Approval Required)
Changes require rationale + backward-compatibility note.
1. `app/api/ingest/*`
2. `lib/ingest-core.ts`
3. `lib/signature-verification.ts`
4. `lib/delivery/*`
5. `lib/workspace-context.ts`
6. `supabase/migrations/*`
7. `CONTRACTS.md`
8. `ARCHITECTURE.md`
9. `DECISIONS.md`

## Tier 2 — Owned But Evolvable
Can evolve without breaking contracts.
1. `app/api/verify-signature/*`
2. `app/api/delivery/*`
3. `app/api/ops/*`
4. `app/api/reconciliation/*`
5. `app/api/evidence-packs/*`
6. `app/actions/*`
7. `app/dashboard/*`
8. `components/*`

## Tier 3 — Flexible UX/Content
1. `app/(marketing)/*`
2. `styles/*`
3. `README.md`
4. `overview.md`
5. `STATUS.md`
6. `V6_PLAN.md`

## Ownership Map
### Product Owner
Owns:
1. `ARCHITECTURE.md`
2. `CONTRACTS.md`
3. `DECISIONS.md`
4. `STATUS.md`
5. `V6_PLAN.md`

### Backend Owner
Owns:
1. `app/api/*` (except DB migration logic)
2. `lib/ingest-core.ts`
3. `lib/delivery/*`
4. `lib/workspace-context.ts`
5. `utils/audit.ts`

### Database Owner
Owns:
1. `supabase/migrations/*`
2. RLS/trigger/index policy correctness.

### Frontend Owner
Owns:
1. `app/tool/*`
2. `app/dashboard/*`
3. `app/verify/*`
4. `components/*`
5. `styles/*`

### Payments Owner
Owns:
1. `app/api/dodo/*`
2. `app/actions/subscription.ts`
3. entitlement/promo/purchase-flow alignment.

## Approval Rules
1. Product Owner approves all Tier-1 and contract-semantic changes.
2. DB Owner signs off migrations after Product Owner approval.
3. Payments Owner cannot change evidence semantics.
4. Frontend Owner cannot change contract payload semantics.

## Status Ownership
`STATUS.md` is Product Owner-owned; other roles report status in handoff notes.
