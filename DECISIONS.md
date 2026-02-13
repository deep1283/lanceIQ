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

## 2026-02-07: SAML Attribute Mapping (V4)
Decision: Canonical attributes are email, name, and groups. Accept email from email, mail, or userPrincipalName; name from displayName/givenName/familyName; groups from groups.
Why: Enterprise IdP compatibility with minimal friction.
Backward compatibility: Additive mapping; no change to existing auth.
Alternatives rejected: Single-attribute-only mapping.

## 2026-02-07: Initial IdP Support (V4)
Decision: Okta and Azure AD first; Google Workspace next.
Why: Highest enterprise demand and predictable SAML profiles.
Backward compatibility: No breaking changes.
Alternatives rejected: Google-first.

## 2026-02-07: SCIM Auth Tokens (V4)
Decision: Authorization: Bearer <token>, allow multiple active tokens with last_used_at tracking.
Why: Safe rotation and enterprise operational needs.
Backward compatibility: Additive; existing tokens remain valid until revoked.
Alternatives rejected: Single-token only with forced rotation windows.

## 2026-02-07: SLA Incident Taxonomy (V4)
Decision: Severity levels sev1, sev2, sev3. Incidents can be global or workspace-scoped.
Why: Standard operational taxonomy with tenant-specific visibility.
Backward compatibility: Additive; no change to prior behavior.
Alternatives rejected: Single-scope incidents only.

## 2026-02-07: API Key Rotation Grace Period (V4)
Decision: 24-hour grace period for old keys after rotation.
Why: Reduces customer downtime during key propagation.
Backward compatibility: Additive; existing keys behavior unchanged.
Alternatives rejected: Immediate revocation.

## 2026-02-10: Batch Ingest + Workspace Counters (V5)
Decision: Use ingest_batches metadata and workspace_ingest_counters for scalable ingest/quota enforcement.
Why: COUNT(*) on ingested_events does not scale; counters and batch metadata provide predictable performance and operational visibility.
Backward compatibility: Existing single-event ingest remains supported; batch fields are optional and additive; counters are derived from inserts.
Alternatives rejected: Per-request COUNT(*) and no batch tracking due to performance risk at enterprise scale.

## 2026-02-11: Ingest Core Refactor (Tier-1)
Decision: Deduplicate ingest routes into a shared processIngestEvent() core and centralize ingest limits/UUID validation.
Why: Reduces drift risk between header- and path-based ingestion, improves maintainability, and hardens validation.
Backward compatibility: HTTP responses and payload semantics remain unchanged; refactor is internal.
Alternatives rejected: Maintaining duplicate logic in two route handlers.

## 2026-02-11: Workspace Creation RPC Auth Enforcement (Tier-1)
Decision: Enforce auth.uid() for workspace creation and owner membership inside the SECURITY DEFINER RPC.
Why: Prevents spoofing the creator/owner identity and preserves audit integrity.
Backward compatibility: Normal authenticated creation flows continue; only mismatched caller-supplied user ids are rejected.
Alternatives rejected: Trusting client-supplied user ids in a SECURITY DEFINER function.

## 2026-02-08: Strict Evidence Immutability with Retention Exception
Decision: Enforce database-level immutability on ingested evidence with a narrow retention exception for raw bodies.
Why: Evidence integrity is paramount; updates to evidence fields are prohibited to preserve auditability and legal posture.
Exception: raw_body may be set to NULL only after raw_body_expires_at has passed and only when no active legal hold exists for the workspace.
Backward compatibility: Existing rows become immutable. Retention workflows must prune raw_body via UPDATE raw_body = NULL (not delete) when permitted; full deletes are allowed only when retention policy permits and no legal hold exists.
Alternatives rejected: Allowing in-place updates to evidence fields or soft-deletes, which weaken immutability guarantees.

## 2026-02-07: Align Ingest Responses with API Contract
Decision: Ensure ingest endpoints return `id` and correct status codes per CONTRACTS.md (202 for queued, 200 for duplicate). Align plan quota gating between both endpoints.
Why: Current responses omitted required fields and used inconsistent status codes, breaking the published contract and weakening enterprise integration reliability.
Backward compatibility: Response bodies remain additive (status, id, and existing verified fields preserved). Clients treating any 2xx as success remain compatible.
Alternatives rejected: Leaving inconsistent responses and undocumented behavior.

## 2026-02-12: Strict SAML Assertion Validation (Security Hardening)
Decision: SAML ACS requires signed assertions and full assertion validation (issuer, audience, destination, time window) with replay protection at the DB layer.
Why: Unsigned or weakly validated assertions allow forged login and role escalation.
Backward compatibility: IdPs must provide signed assertions and valid metadata; insecure assertions are rejected.
Alternatives rejected: Regex-only parsing, unsigned assertion acceptance, or soft validation warnings.

## 2026-02-12: Billing Activation Trust Boundary
Decision: Workspace plan activation is webhook-only and proof-bound; client verification endpoints cannot mutate plan state.
Why: Email-only and payment-id-only flows can be abused for plan escalation.
Backward compatibility: Legacy `/api/dodo/verify` remains as explicit deprecated `410` response; activation continues through webhook events.
Alternatives rejected: Email lookup unlocks and direct plan mutation from verification endpoints.

## 2026-02-12: Payment Verification Privacy Boundary
Decision: `/api/dodo/verify-payment` requires authenticated workspace context and must not return customer PII.
Why: Prevents payment-id probing and exposure of customer identity data.
Backward compatibility: Response shape changed to proof status fields without PII; plan mutation removed from this endpoint.
Alternatives rejected: Anonymous verification and responses including customer email/name.

## 2026-02-12: Workspace Context Resolution Canonicalization (V5.1)
Decision: Dashboard SSR surfaces must resolve workspace context through one shared resolver with fallback order: explicit workspace hint, workspace cookie, deterministic primary workspace.
Why: Prevents UI/API entitlement mismatches caused by ad-hoc `.limit(1).single()` membership selection in different server-render paths.
Backward compatibility: Single-workspace behavior is unchanged; multi-workspace users can pass `workspace_id` for explicit targeting.
Alternatives rejected: Keeping page-local workspace selection logic and relying on raw `workspace.plan` checks.

## 2026-02-12: Workspace-Scoped Signature Verification Entitlement (V5.1)
Decision: `/api/verify-signature` entitlement checks are workspace-scoped and membership-validated, with `workspace_id` required when a user belongs to multiple workspaces.
Why: Unscoped verification checks can apply the wrong plan when users belong to multiple workspaces.
Backward compatibility: Single-workspace users can omit `workspace_id`; multi-workspace users receive explicit `400` guidance.
Alternatives rejected: User-level "best plan" checks without workspace binding.
