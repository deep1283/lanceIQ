# LanceIQ: System Capabilities & Robustness Overview

This document outlines the features and architectural strength of the LanceIQ system, capable of enterprise-grade webhook delivery recording and verification.

---

## 🚀 Core Features

### 1. Webhook Certificate Generator
*   **Audit-Ready Technical Record**: Generates professional records of webhook delivery for engineering and compliance workflows.
*   **Signatures & Verification**: Supports generating specific headers (e.g., Stripe signatures) and authenticating them against secrets.
*   **Interactive Web View**: Shareable links that render the payload, headers, and verification status.
*   **PDF Exports**: One-click generation of A4-formatted PDF certificates with auto-close logic for seamless UX.
*   **Watermarking**: Custom branding options gated by plan tier.

### 2. Universal Workspace Scope
*   **Centralized Data Ownership**: All data (certificates, logs, reports) belongs to a **Workspace**, not individual users.
*   **Team Collaboration**: Multiple members can access the same workspace data based on roles (Team Plan).
*   **Plan Inheritance**: Pro/Team features are applied workspace-wide, so all members benefit seamlessly.
*   **Strict Isolation**: Row Level Security (RLS) ensures zero dats leaks between workspaces.

### 3. Smart Dashboards
*   **Role-Aware Interfaces**: Dashboards dynamically adapt for Free vs. Team users.
*   **Badges & Branding**: UI clearly indicates "Pro" or "Team" status (e.g., Indigo/Blue badges).
*   **Search & Filter**: Powerful filtering of certificate history by date, status, or workspace context.
*   **CSV Data Export**: Bulk export capabilities for enterprise auditing and external analysis.

### 4. Enterprise-Ready Billing
*   **Multi-Tier Support**: Fully featured logic for Free, Pro, and Team tiers.
*   **Grace Periods**: Intelligent handling of subscription usage, including grace periods for past-due accounts.
*   **Auto-Sync**: Background synchronization with payment providers (Stripe/Dodo) via webhooks.

---

## 🛡️ Architectural Robustness

Our system is built to prevent data inconsistency, unauthorized access, and downtime.

### 1. Database Integrity (PostgreSQL)
*   **Strict Typing**: All critical columns use precise types (`uuid`, `timestamptz`).
*   **Foreign Key Constraints**: `workspace_id` is strictly enforced via foreign keys with `ON DELETE CASCADE` protection where appropriate.
*   **NOT NULL Enforcement**: The system physically prevents "orphaned" data. A certificate *cannot* exist without a workspace.
*   **Migration-First Strategy**: All schema changes are version-controlled SQL migrations, ensuring consistent deployments across environments.
*   **Schema Resilience**: Code includes fallbacks for schema evolution (e.g., handling missing columns during rollouts).

### 2. Security (Zero Trust)
*   **Row Level Security (RLS)**: Access control is enforced at the database engine level. Even if the application code has a bug, the database will reject unauthorized queries.
*   **Secure Admin Operations**: critical system checks (like subscription verification) use a specialized Service Role client to bypass user-level restrictions safely, avoiding permission recursion issues.
*   **Sanitized Inputs**: All user inputs (headers, payloads) are sanitized and typed before processing.

### 3. Reliability & Performance
*   **Client-Side Generation**: PDF generation is offloaded to the client (html2canvas), reducing server load and ensuring privacy.
*   **Optimized Queries**: All dashboard queries are indexed (e.g., `idx_certificates_workspace_date`) for sub-millisecond response times even with millions of records.
*   **Production Build Verified**: The entire codebase (Next.js 16) compiles with strict type checking enabled, ensuring type safety in production.

This architecture ensures LanceIQ is not just a tool, but a reliable platform for critical webhook infrastructure.
