# LanceIQ Decisions

This file records architectural decisions that affect contracts, evidence semantics, or security posture.

## 2026-02-07: Postgres as System of Record
Decision: Use Postgres (Supabase) as the primary evidence store.
Why: Strong consistency, RLS support, migrations, and auditability.
Alternatives rejected: DynamoDB or object storage as primary store due to weaker relational constraints and RLS needs.

## 2026-02-07: Workspace-Scoped Data Model
Decision: Scope all evidence to workspaces with membership-based access.
Why: Enables team access and enterprise-ready access control.
Alternatives rejected: User-only scoping due to limited enterprise fit.

## 2026-02-07: Append-Only Evidence Records
Decision: Evidence records are append-only with immutable semantics.
Why: Tamper-evident posture and audit compliance.
Alternatives rejected: In-place updates to evidence fields.

## 2026-02-07: Scope of Proof Language
Decision: Certificates and pages must state only receipt by LanceIQ, payload and headers, and verification status.
Why: Legal and liability boundary clarity.
Alternatives rejected: Claims about upstream intent or downstream processing.

## 2026-02-07: Time Credibility Roadmap
Decision: Start with system timestamps and move toward external anchoring or RFC-3161.
Why: Enterprise trust requires credible timestamps.
Alternatives rejected: Relying solely on internal timestamps for enterprise tier.

## 2026-02-07: Ingest Response Contract Alignment
Decision: Ensure ingest endpoints return `id` and correct status codes per CONTRACTS.md.
Why: Contract compliance and reliable client parsing.
Backward compatibility: Responses still include `status` and `verified`; clients must accept 200 or 202.
Alternatives rejected: Leaving inconsistent responses and undocumented behavior.

## 2026-02-07: Legal Hold Semantics (V2)
Decision: Legal holds are workspace-scoped, auditable, and block retention pruning while active.
Why: Enterprise-grade immutability and defensible evidence handling.
Backward compatibility: No breaking changes to existing evidence records; holds are additive.
Alternatives rejected: Application-only enforcement without DB-level guarantees.

## 2026-02-07: Retention Visibility (V2)
Decision: Retention status will be surfaced in UI and exports using additive fields and updated labels.
Why: Transparent data handling without changing evidence semantics.
Backward compatibility: Existing fields remain; new fields are additive and optional.
Alternatives rejected: Hiding retention behavior or exposing it only in internal logs.

## 2026-02-07: DB-Level Idempotency (V2)
Decision: Enforce uniqueness for provider_event_id at the database layer, scoped to workspace and provider.
Why: Hard-prevent duplicates for providers with stable event IDs.
Backward compatibility: Events without provider_event_id remain unchanged; existing behavior preserved.
Alternatives rejected: Global uniqueness or hashing-only constraints for all events.

## 2026-02-07: Timestamp Anchoring (V3)
Decision: Use RFC-3161 timestamp authority for anchoring in V3.
Why: Enterprise-grade, standards-based time credibility.
Backward compatibility: No change to evidence semantics; anchoring is additive.
Alternatives rejected: Blockchain anchoring for V3 (defer to V4).

## 2026-02-07: Timestamp Receipts Immutability (V3)
Decision: Timestamp receipts are append-only with no UPDATE/DELETE; re-verification creates a new receipt.
Why: Stronger evidence integrity and auditability.
Backward compatibility: Existing records remain untouched.
Alternatives rejected: Updating verified_at in place.

## 2026-02-07: Legal Hold Manager Scope (V3)
Decision: legal_hold_manager can create holds; only owner/admin can deactivate.
Why: Prevent unauthorized release of holds.
Backward compatibility: Existing roles retain previous privileges.
Alternatives rejected: Allowing legal_hold_manager to deactivate.

## 2026-02-07: Canonical Hash Storage (V3)
Decision: Store canonical_json_sha256 on ingested_events.
Why: Deterministic evidence hashing for exports and anchoring.
Backward compatibility: Field is nullable; no breaking change.
Alternatives rejected: On-the-fly computation during export only.

## 2026-02-08: Strict Evidence Immutability with Retention Exception
Decision: Enforce database-level immutability on ingested evidence with a narrow retention exception for raw bodies.
Why: Evidence integrity is paramount; updates to evidence fields are prohibited to preserve auditability and legal posture.
Exception: raw_body may be set to NULL only after raw_body_expires_at has passed and only when no active legal hold exists for the workspace.
Backward compatibility: Existing rows become immutable. Retention workflows must prune raw_body via UPDATE raw_body = NULL (not delete) when permitted; full deletes are allowed only when retention policy permits and no legal hold exists.
Alternatives rejected: Allowing in-place updates to evidence fields or soft-deletes, which weaken immutability guarantees.

## 2026-02-08: Align ingest responses with API contract
Decision: Update /api/ingest and /api/ingest/[apiKey] responses to include id and follow contract status codes (202 for queued, 200 for duplicate). Also align plan quota gating between both endpoints.
Why: Current responses omit required fields and use inconsistent status codes, which breaks the published contract and weakens enterprise integration reliability.
Backward-compatibility: Response bodies remain additive (status, id, and existing verified fields preserved). Clients treating any 2xx as success remain compatible; 202 indicates queued while 200 remains used for duplicates.
