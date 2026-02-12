# LanceIQ Architecture

## Purpose
LanceIQ records and verifies webhook deliveries, then produces audit-ready evidence artifacts. The core guarantee is evidence of receipt and verification by LanceIQ, not proof of downstream processing or external provider intent.

## One-Line Principle
LanceIQ records and verifies receipt, not business truth.

## Scope of Proof
LanceIQ attests only to receipt by LanceIQ at a specific time, the payload and headers received, and the verification status computed. LanceIQ does not attest to upstream provider intent, downstream processing, or financial settlement.

## Design Principles
1. Evidence integrity over convenience
2. Append-only data and auditability by default
3. Clear separation between ingestion, verification, and evidence generation
4. Workspace-scoped access control with RLS
5. Explicit contracts and versioning for all external interfaces
6. Safety-first language that avoids legal overreach

## High-Level System Diagram

Webhook Provider
  -> Ingest API (header or path auth)
  -> Verification pipeline
  -> Evidence store (Postgres)
  -> Certificate render (PDF and verification page)
  -> Exports and audit logs

## Core Modules
1. Ingestion
2. Verification
3. Evidence Storage
4. Certificate Generation
5. Verification Page and Exports
6. Alerts and Audit Logs

## Data Model Summary
1. workspaces
2. workspace_members
3. ingested_events
4. certificates
5. verification_history
6. audit_logs
7. alert_deliveries

## Immutability Policy
1. Evidence records are append-only.
2. Updates are forbidden for evidence fields once written.
3. Deletion is only allowed by retention policy or legal hold expiration.
4. Admins and support do not have mutation rights for evidence records.
5. Corrections are implemented as new records with linkage, never in-place edits.

## Time Credibility Plan
1. Current: RFC-3161 timestamp authority anchoring on ingest (best-effort).
2. Near-term: scheduled anchoring with retries and monitoring.
3. Enterprise: external attestations and published anchoring policy.

## Security and Access Control
1. RLS enforced for all workspace-scoped data.
2. Service Role is used only for trusted server-side workflows.
3. Secrets are encrypted at rest where applicable.
4. Audit logs are immutable and restricted to owners and admins.
5. SAML SSO is fail-closed: signed assertion required, issuer/audience/destination/time-window checks required, replay-blocked by assertion id + issuer.
6. Plan activation is webhook-driven and proof-bound; no email-only unlock flow is trusted.

## Identity and Billing Trust Boundaries
1. SSO provider resolution is domain-normalized and only enabled plus verified providers are accepted.
2. Group claims are not trusted for privilege by default; least-privilege membership (`member`) is the default unless explicit allowlist mapping is configured.
3. Payment verification endpoints may confirm proof only; they do not mutate workspace plan state.
4. Workspace plan changes occur from verified billing webhook processing with workspace-bound metadata.

## Role Model
1. Current roles: owner, admin, member, viewer, exporter, legal_hold_manager.
2. Owners can manage workspace settings, members, and audit visibility.
3. Admins can manage operational settings but cannot delete the workspace.
4. Members have read access to evidence scoped by workspace.
5. Viewer: read-only access to evidence.
6. Exporter: read-only + export access.
7. legal_hold_manager: can create holds; only owner/admin can deactivate.

## Storage Strategy
1. Postgres is the system of record for evidence and metadata.
2. Large raw bodies may be stored in Postgres initially, with a planned path to object storage for cost and retention scaling.
3. PDFs are generated client-side today; server-side generation is an enterprise option.

## Scalability Assumptions
1. Initial target: 1 to 10 million events per month.
2. Retention target: 1 to 3 years for business, 3 to 7 years for enterprise.
3. Single-region with DR/replication status; multi-region failover planned.

## Out of Scope
1. Proving that the provider sent the webhook.
2. Proving downstream processing, business logic, or fund settlement.
3. Guaranteeing delivery to customer infrastructure.
4. Acting as a financial or accounting system.
5. Acting as a compliance certification authority.
6. Mutating, replaying, or re-emitting customer webhooks.

## Contract Boundaries
All external interfaces are defined in CONTRACTS.md and must not be changed without explicit approval.

## Change Discipline
Any change that alters evidence semantics, contracts, or immutability guarantees requires a decision record in DECISIONS.md.
