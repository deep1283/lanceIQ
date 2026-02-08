# LanceIQ Atomization

## Purpose
Define feature-level atoms so multiple agents can work in parallel without breaking contracts or evidence semantics.

## Rules
1. Atom boundaries follow feature paths, not individual functions.
2. Changes that cross atoms require explicit coordination and review.
3. Tier 1 files remain protected even if they sit inside an atom.

## Atoms

### Atom A: Ingestion Pipeline
Owner: Backend Owner
Scope:
1. app/api/ingest
2. app/api/ingest/[apiKey]
3. lib/verification/*
4. lib/hashing/*
5. lib/timestamps/*
Boundaries:
1. Must preserve contract semantics.
2. Must remain append-only for evidence data.

### Atom B: Evidence Storage and Retention
Owner: Database Owner
Scope:
1. supabase/migrations
2. retention functions and policies
Boundaries:
1. No breaking schema changes without a decision record.
2. RLS must remain workspace-scoped.

### Atom C: Certificates and Verification Views
Owner: Frontend Owner
Scope:
1. app/verify
2. app/tool
3. components/CertificateTemplate
4. lib/pdf/*
Boundaries:
1. Scope-of-proof text must remain visible.
2. Evidence fields must not be reworded to imply business truth.

### Atom D: Workspace and Membership
Owner: Backend Owner
Scope:
1. app/actions/workspaces
2. app/actions/members
3. workspace role policies
Boundaries:
1. Role checks must use canonical role helpers.
2. No role expansion without DB migration.

### Atom E: Alerts and Audit Logs
Owner: Backend Owner
Scope:
1. app/actions/alert-settings
2. utils/audit
3. audit and alert delivery policies
Boundaries:
1. Audit logs are append-only.
2. No client-side inserts to audit logs.

### Atom F: Billing and Plans
Owner: Payments Owner
Scope:
1. app/api/dodo
2. app/actions/subscription
3. plan gating logic
Boundaries:
1. No changes to evidence semantics.
2. Plan enforcement must be server-side.

### Atom G: Marketing and Site UI
Owner: Frontend Owner
Scope:
1. app/(marketing)
2. components/marketing
3. public assets
Boundaries:
1. Claims must follow scope-of-proof language.
