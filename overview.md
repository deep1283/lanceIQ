# LanceIQ Overview

This document is a code-backed summary of what LanceIQ currently does.

## Product Positioning
LanceIQ is a payment-webhook evidence and reliability platform.

It combines:
1. Evidence ledger (receipt + verification).
2. Delivery reliability (forwarding, retries, replay, breaker).
3. Team reconciliation (provider pulls vs receipt/delivery evidence).

## What Users Can Do Today
1. Create webhook sources with API keys and optional stored secrets.
2. Ingest webhooks through header or path auth endpoints.
3. Verify Stripe/Razorpay/Lemon Squeezy signatures.
4. Generate certificate records and export PDF/CSV (plan/role gated).
5. Configure forwarding target and monitor delivery outcomes (Pro/Team).
6. Replay failed/missing deliveries from dashboard workflows.
7. Run reconciliation and inspect discrepancy counters (Team).
8. Generate and verify evidence packs through API (Team).

## Governance and Access
1. Workspace-scoped data model with RLS.
2. Roles: `owner`, `admin`, `member`, `viewer`, `exporter`, `legal_hold_manager`.
3. Team-only governance surfaces: alerts, audit logs, legal hold, SSO/SCIM, access reviews, SLA/incidents, key rotation, reconciliation.

## Security Posture In Code
1. SAML ACS validates signed assertions and blocks replay.
2. Billing activation is webhook-only; verify endpoints are proof-only.
3. Forwarding requests are SSRF-guarded and HMAC-signed.
4. Delivery and reconciliation runners support service-token execution.
5. Evidentiary tables are protected with immutability-oriented policies/triggers.

## Provider Scope
1. Verification engines: Stripe, Razorpay, Lemon Squeezy.
2. Reconciliation pulls: Stripe, Razorpay, Lemon Squeezy.
3. Billing integration in repo: Dodo Payments.

## Known Boundaries
1. LanceIQ records receipt and delivery attempts; it does not prove downstream processing truth.
2. Storage-level WORM/object-lock is not part of current baseline.
