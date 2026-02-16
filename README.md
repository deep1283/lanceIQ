# LanceIQ

LanceIQ prevents revenue loss caused by failed or missing payment webhooks — and provides verifiable proof when disputes happen.
 LanceIQ received (`payload + headers`), computes verification status, and stores audit-ready evidence. For paid plans, it also adds forwarding reliability (delivery attempts, retries, replay) and reconciliation surfaces.

## Scope Of Proof (Contractual Boundary)
LanceIQ proves:
1. LanceIQ received a webhook at time `T`.
2. LanceIQ computed signature verification status `Y` for payload hash `X`.
3. (When forwarding is enabled) LanceIQ attempted delivery and observed HTTP/network outcomes.

LanceIQ does **not** prove:
1. Provider intent.
2. Downstream business processing success.
3. Financial settlement.

## Payment-First Scope
Current payment providers in product flows:
1. Stripe
2. Razorpay
3. Lemon Squeezy

Billing provider in this repo:
1. Dodo Payments (checkout + webhook activation)

## Plan Entitlements (Canonical)
Source of truth: `/Users/deepmishra/vscode/LanceIQ/lib/plan.ts`

| Capability | Free | Pro | Team |
|---|---:|---:|---:|
| PDF export | Yes | Yes | Yes |
| CSV export | No | Yes | Yes |
| Signature verification (`/api/verify-signature`) | No | Yes | Yes |
| Watermark removal | No | Yes | Yes |
| Forwarding + retries + replay | No | Yes | Yes |
| Reconciliation | No | No | Yes |
| Alerts | No | No | Yes |
| SSO/SCIM/Access Reviews/SLA/Legal Hold/Key Rotation/Audit Logs | No | No | Yes |

## Product Surfaces
1. Generator (`/tool`)
1. Creates certificate-style records from payload + headers.
2. Guest users can download PDF (watermarked by entitlement).
3. Authenticated users can save certificates to workspace.
2. Dashboard (`/dashboard`)
1. Certificate history + CSV export (plan/role gated).
2. Sources & ingestion management.
3. Payment delivery recovery panel (matched vs missing, replay actions).
3. Admin workspace console (`/dashboard/admin`)
1. Smart Alerts, Audit Logs, Legal Hold, Team Members, SSO & SCIM, Access Reviews, SLA & Incidents, Reconciliation.
2. Team-only sections are visible-but-locked when not entitled.
4. Settings (`/dashboard/settings`)
1. Dashboard dark mode toggle.
2. Current plan display.
3. Signed-in email (or Team admin emails for owner/admin on Team).

## Core Back-End Flows
### 1) Ingest
Endpoints:
1. `POST /api/ingest`
2. `POST /api/ingest/[apiKey]`

Behavior:
1. API key auth (header or path).
2. Rate limit + quota checks.
3. Signature verification for supported providers.
4. Evidence insert into `ingested_events` + verification history.
5. Best-effort RFC-3161 anchoring.
6. Optional forwarding enqueue (non-blocking).

### 2) Forwarding Reliability (Pro/Team)
Core tables: `workspace_delivery_targets`, `delivery_jobs`, `delivery_spool`, `delivery_attempts`, `delivery_breakers`.

Behavior:
1. One destination can be configured from UI per workspace (DB allows multiple rows; UI manages primary target).
2. Delivery runner executes due spool jobs.
3. Retries with backoff; default max attempts is `5` (`DELIVERY_MAX_ATTEMPTS` overrides).
4. Circuit breaker opens after `5` consecutive destination `5xx`.
5. Manual health-check supports breaker recovery.
6. Replay endpoint re-enqueues using immutable retained raw body; returns `409 raw_body_unavailable` if pruned.

### 3) Reconciliation (Team)
Core tables: `provider_integrations`, `provider_objects`, `reconciliation_runs`, `destination_state_snapshots`.

Behavior:
1. Pulls provider objects for Stripe/Razorpay/Lemon Squeezy.
2. Computes discrepancy counters (`missing_receipts`, `missing_deliveries`, `failed_verifications`, `provider_mismatches`, `provider_pull_failures`).
3. Supports V6.1 signed callback snapshots (`/api/reconciliation/state-snapshots`).

### 4) Evidence Packs (Team API)
Core tables: `evidence_packs`, `evidence_pack_artifacts`.

Behavior:
1. Generate sealed pack with stable manifest hash + HMAC signature.
2. Verify endpoint recomputes and validates hash/signature.
3. Verification is returned in response and audit-logged.

## Security Highlights
1. SAML ACS is fail-closed: signed assertion required, issuer/audience/destination/time-window checks, replay protection.
2. Forwarding has SSRF guards (HTTPS by default, private/local IP blocking, DNS validation, redirect control).
3. Forwarded requests include LanceIQ HMAC headers (`x-lanceiq-signature`, timestamp, nonce, optional key id).
4. Billing trust boundary: plan mutation is webhook-driven; `/api/dodo/verify-payment` is proof-only.
5. Evidence immutability is enforced via DB policies/triggers on evidentiary tables.

## API Groups
Detailed contracts are in `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`.

Primary groups:
1. Ingest + verification
2. Delivery reliability (`/api/ops/delivery/*`, `/api/delivery/replay`)
3. Reconciliation (`/api/ops/reconciliation/run`, `/api/reconciliation/*`)
4. Evidence packs (`/api/evidence-packs/*`)
5. Workspace test webhook (`/api/workspaces/test-webhook`)
6. Identity + provisioning (`/api/sso/saml/*`, `/api/scim/v2/*`)
7. Governance/ops (`/api/audit-logs`, `/api/access-review/*`, `/api/ops/*`)

## Local Setup
1. Clone and install:
```bash
git clone https://github.com/deep1283/lanceIQ.git
cd lanceIQ
npm install
```
2. Configure env:
```bash
cp .env.example .env.local
```
3. Run SQL migrations in order from:
`/Users/deepmishra/vscode/LanceIQ/supabase/migrations`
4. Start app:
```bash
npm run dev
```

## Recommended Schedulers
1. `POST /api/ops/delivery/run` every 1 minute.
2. `POST /api/ops/reconciliation/run` every 15 minutes.
3. `POST /api/ops/retention/run` on your retention cadence.
4. `POST /api/ops/runbooks/run` on your runbook-check cadence.

Use `Authorization: Bearer <OPS_SERVICE_TOKEN>` for delivery/reconciliation runners.

## Important Docs
Read these before changes:
1. `/Users/deepmishra/vscode/LanceIQ/OWNERSHIP.md`
2. `/Users/deepmishra/vscode/LanceIQ/ATOMIZATION.md`
3. `/Users/deepmishra/vscode/LanceIQ/ARCHITECTURE.md`
4. `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`
5. `/Users/deepmishra/vscode/LanceIQ/DECISIONS.md`
6. `/Users/deepmishra/vscode/LanceIQ/STATUS.md`
7. `/Users/deepmishra/vscode/LanceIQ/OPERATING_RULES.md`
