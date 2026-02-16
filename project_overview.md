# LanceIQ Project Overview

## What is LanceIQ?
**LanceIQ prevents revenue loss caused by failed or missing payment webhooks — and provides verifiable proof when disputes happen.**

It serves as a payments-focused webhook evidence ledger and reliability platform.

**LanceIQ solves this by providing:**
1.  **Evidence**: A tamper-proof ledger proving *exactly* what was received and when (headers + payload).
2.  **Reliability**: Smart forwarding, retries, and circuit breakers to ensure your downstream systems get the message.
3.  **Reconciliation**: Automated checks against providers (like Stripe) to find missing events.

---

## Real-Life Example: The "Lost Payment" Scenario

Imagine you run a SaaS platform selling $100 subscriptions. A customer, "Alice," pays via Stripe.

### Without LanceIQ
1.  Stripe charges Alice $100.
2.  Stripe sends a `payment_succeeded` webhook to your server.
3.  **Failure**: Your server is temporarily down for maintenance or hits a bug. The webhook is lost.
4.  **Result**: Alice paid, but your database says she didn't. She gets angry, churns, and you lose revenue and trust. You have no easy way to prove what happened without digging through Stripe logs manually.

### With LanceIQ
1.  **Ingestion**: Stripe sends the webhook to LanceIQ first (or you send it to LanceIQ as a sidecar).
2.  **Evidence Locking**: LanceIQ immediately:
    *   Verifies the cryptographic signature (proving it came from Stripe).
    *   Logs the raw payload and headers.
    *   Anchors a timestamp hash to a ledger.
    *   **Result**: You now have *proof* the event occurred.
3.  **Reliable Delivery**: LanceIQ attempts to forward the webhook to your main application.
    *   *Attempt 1*: Fails (500 Error).
    *   *Attempt 2 (1 min later)*: Fails.
    *   *System Action*: LanceIQ queues it for retry with exponential backoff.
4.  **Recovery**: Once your server recovers, LanceIQ successfully delivers the webhook on *Attempt 3*.
5.  **Replay**: If valid webhooks were completely missed, you can "Replay" them from the LanceIQ dashboard with a single click, using the immutable copy stored in the evidence ledger.

**Outcome**: Alice gets her subscription automatically. Your team has a full audit trail of the failure and recovery.

---

## Technology Stack

LanceIQ is built on a modern, high-performance stack designed for reliability and security.

### Frontend & Application Framework
*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router) - The React framework for production.
*   **UI Library**: [React 19](https://react.dev/) - latest React features.
*   **Styling**: [TailwindCSS v4](https://tailwindcss.com/) - Utility-first CSS.
*   **Components**: [Radix UI](https://www.radix-ui.com/) primitives + [Lucide React](https://lucide.dev/) icons.
*   **Animation**: [Framer Motion](https://www.framer.com/motion/).

### Backend & Database
*   **Platform**: [Supabase](https://supabase.com/) - Open Source Firebase alternative.
    *   **PostgreSQL**: The core relational database.
    *   **Auth**: Authentication and user management.
    *   **Row Level Security (RLS)**: Fine-grained access control enforced at the database layer.
*   **Caching & Queueing**: [Upstash Redis](https://upstash.com/) - Used for rate limiting and lightweight queue operations.

### Key Libraries & Tools
*   **PDF Generation**: `html2canvas-pro` + `jspdf` - For generating professional delivery certificates client-side.
*   **Security**: `xml-crypto` (XML signature validation), `qrcode` (Verification QR codes).
*   **Payment Integration**: `dodopayments` - Handling checkout and billing within the platform.
*   **Email**: `resend` - Transactional email delivery.

---

## Core Features Breakdown

### 1. Ingestion & Verification
*   **Endpoints**: Header-based (`/api/ingest`) and Path-based (`/api/ingest/[apiKey]`) authentication.
*   **Signature Verification**: Native support for Stripe, Razorpay, and Lemon Squeezy signatures to reject spoofed requests.

### 2. Forwarding Reliability (Pro/Team)
*   **Smart Retries**: Configurable retry schedules (linear/exponential).
*   **Circuit Breakers**: Automatically stops forwarding to a failing target to prevent system overload, with auto-reset or manual resumption.
*   **Replay**: One-click re-delivery of past events using the stored raw payload.

### 3. Evidence & Certificates
*   **Generator Tool**: A dedicated tool to create "Delivery Certificates" — handy PDFs that serve as proof of delivery for disputes or audits.
*   **Visual Trust**: Certificates include QR codes that link back to a verified, hosted record on LanceIQ.

### 4. Enterprise Security (Team)
*   **SSO & SCIM**: Integration for large teams to manage access via Okta/AzureAD.
*   **Audit Logs**: Comprehensive logging of *who* did *what* (e.g., "Deep changed the retention policy").
*   **Legal Hold**: Prevents data deletion for compliance during ongoing investigations.
