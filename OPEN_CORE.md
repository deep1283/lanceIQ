# Open Core Strategy

LanceIQ currently ships as AGPL-licensed source while using plan-gated hosted behavior.

## License State
1. Current license: AGPL-3.0 for repository code.
2. Commercial licensing can be handled separately outside this file.

## Functional Boundary (Code Reality)
### Core capabilities in repo
1. Webhook ingest and signature verification engine.
2. Certificate generation and verification surfaces.
3. Workspace model with role-based access.
4. Audit/governance APIs and operational endpoints.
5. Reliability and reconciliation APIs.

### Plan-gated behavior (same repo)
Gating is entitlement-driven (`/Users/deepmishra/vscode/LanceIQ/lib/plan.ts`), not separate code packages.

1. Free:
1. PDF export allowed.
2. CSV export disabled.
3. Forwarding/reconciliation/governance features locked.

2. Pro:
1. Signature verification enabled.
2. CSV export enabled.
3. Forwarding/replay reliability enabled.

3. Team:
1. Reconciliation enabled.
2. Governance stack enabled (alerts, audit logs, SSO/SCIM, access reviews, SLA/incidents, legal hold, key rotation).

## Practical Repository Layout
The repository is one codebase with entitlement checks at API/server-action/UI layers.

There is no separate `/core` and `/pro` directory split in the current implementation.
