# Open Core Strategy

LanceIQ follows an **Open Core** model to balance community adoption with sustainable operations.

## Licensing Status
*   **Current**: [GNU AGPLv3](./LICENSE) for the entire codebase.
*   **Future Goal**: Dual-Licensing (AGPL for OSS / Commercial for Enterprise).

## Feature Boundary

### ✅ Core (Open Source - AGPL)
These features are free forever and form the foundation of trust.
*   **Signature Verification**: `lib/signature-verification`, `/api/verify` logic.
*   **Public Verification Page**: `/verify/[id]` (Read-only proof).
*   **PDF Generation**: Certificate rendering.
*   **Manual Tools**: "Paste & Verify" debugger.
*   **Ingestion (Basic)**: Standard webhook capture (with 24h retention).

### 💎 Pro (Hosted / Proprietary Context)
These features are designed for teams and scaling operations.
*   **Monetization**: Dodo Payments integration, Subscription management.
*   **Smart Alerts**: Email/Slack notifications for critical failures.
*   **Extended Retention**: 7-day or 30-day storage enforcement.
*   **Rate Limiting**: Distributed limits (Upstash/Redis) for high volume.
*   **Admin Console**: Multi-workspace management and audit logs.

## Repository Structure Logic
While currently a single monorepo, we conceptualize the code as:

*   `/core`: Essential logic for verification and proof generation.
*   `/pro`: Billing, Alerting, and Compliance logic.

*Note: Enterprise users requiring a non-AGPL license for embedding LanceIQ should contact sales.*
