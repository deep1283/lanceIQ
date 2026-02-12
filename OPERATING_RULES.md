# LanceIQ Operating Rules

## Purpose
Prevent boundary violations and hallucinations when multiple agents work in parallel.

## Read-First Requirement
Before making changes, every chat must read:
1. OWNERSHIP.md
2. ATOMIZATION.md
3. ARCHITECTURE.md
4. CONTRACTS.md
5. DECISIONS.md
6. STATUS.md
7. OPERATING_RULES.md

## Evidence Discipline
1. Never claim behavior unless it is verified in code or a doc.
2. If the information is not in repo docs, ask for clarification.
3. Do not infer legal claims; follow scope-of-proof language.

## Security Boundaries
1. Do not accept unsigned or weakly validated identity assertions in auth flows.
2. Do not grant or upgrade plans from email-only or payment-id-only verification paths.
3. Plan state changes must remain webhook and proof bound.
4. Do not return customer PII from proof/verification endpoints unless explicitly contract-approved.

## Change Control
1. Tier 1 changes require explicit approval.
2. Contract changes require a decision record.
3. Evidence semantics are append-only and must not be weakened.

## Status Updates
1. Only the Status Owner updates STATUS.md.
2. Other roles must report changes in their response, not by editing STATUS.md.

## Communication Rules
1. Reference exact file paths for any change.
2. Include a brief rationale for non-trivial changes.
3. If unsure, stop and ask.
