# LanceIQ Operating Rules

## Purpose
Prevent boundary violations and undocumented behavior drift.

## Read-First Requirement
Before making changes, every chat must read:
1. `/Users/deepmishra/vscode/LanceIQ/OWNERSHIP.md`
2. `/Users/deepmishra/vscode/LanceIQ/ATOMIZATION.md`
3. `/Users/deepmishra/vscode/LanceIQ/ARCHITECTURE.md`
4. `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`
5. `/Users/deepmishra/vscode/LanceIQ/DECISIONS.md`
6. `/Users/deepmishra/vscode/LanceIQ/STATUS.md`
7. `/Users/deepmishra/vscode/LanceIQ/OPERATING_RULES.md`

## Evidence Discipline
1. Never claim behavior unless verified in code.
2. Keep scope-of-proof language strict.
3. Do not infer legal guarantees not present in contracts.

## Security Boundaries
1. No unsigned/weak identity assertions in auth flows.
2. No email-only/payment-id-only plan activation.
3. Plan changes are webhook/proof-bound.
4. Do not return customer PII from proof endpoints unless contract-approved.

## Tier Control
1. Tier-1 changes require Product Owner approval.
2. Contract changes require decision record updates.
3. Immutability/RLS semantics cannot be weakened.

## Documentation Rule
When product behavior changes:
1. Update `CONTRACTS.md` for interface changes.
2. Update `DECISIONS.md` for semantic/security choices.
3. Update `STATUS.md` for milestone state.
4. Confirm docs against current code before handoff.

## Status Ownership
Only Product Owner updates `STATUS.md`.

## Communication Rule
1. Include exact file paths in handoffs.
2. State rationale for non-trivial changes.
3. If unsure, stop and ask.
