# LanceIQ

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Live Demo](https://img.shields.io/badge/demo-lanceiq.com-green)](https://lanceiq.com)

**Generate professional Webhook Receipt Certificates in seconds.**

LanceIQ creates official-looking PDF certificates documenting webhook receipt and verification. Perfect for audits, compliance, dispute resolution, and record-keeping.

## Read First
Before making changes, read:
1. `/Users/deepmishra/vscode/LanceIQ/OWNERSHIP.md`
2. `/Users/deepmishra/vscode/LanceIQ/ATOMIZATION.md`
3. `/Users/deepmishra/vscode/LanceIQ/ARCHITECTURE.md`
4. `/Users/deepmishra/vscode/LanceIQ/CONTRACTS.md`
5. `/Users/deepmishra/vscode/LanceIQ/DECISIONS.md`
6. `/Users/deepmishra/vscode/LanceIQ/STATUS.md`
7. `/Users/deepmishra/vscode/LanceIQ/OPERATING_RULES.md`

![LanceIQ Input Form](./public/assets/input%20form.png)

![LanceIQ PDF Certificate](./public/assets/pdf1.png)

![LanceIQ Verification Page](./public/assets/verification-page.png)

## Features

- 📄 **Instant PDF Generation** — Paste JSON, get a professional certificate
- 🔒 **Privacy First** — Guest data is processed entirely in your browser and never sent to our servers
- 🏢 **Enterprise Ready** — Save certificates to your account for future reference
- ⚡ **Fast & Simple** — No complex setup, works immediately
- 🎨 **Professional Design** — Clean, audit-ready document format

## Quick Start

### Hosted Version (Easiest)
Visit [lanceiq.com](https://lanceiq.com) — no setup required.

### Self-Hosted

1. **Clone the repo**
   ```bash
   git clone https://github.com/deep1283/lanceIQ.git
   cd lanceIQ
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. **Set up Supabase** (for auth & storage)
   ```sql
   -- Run in Supabase SQL Editor
   create table public.certificates (
     id uuid default gen_random_uuid() primary key,
     user_id uuid references auth.users(id) not null,
     created_at timestamptz default now(),
     report_id text not null,
     payload jsonb,
     headers jsonb,
     hash text,
    payload_hash text,
    is_pro boolean default false
   );

   alter table public.certificates enable row level security;

   create policy "Users can view own certificates"
     on public.certificates for select using (auth.uid() = user_id);

   create policy "Users can insert own certificates"
     on public.certificates for insert with check (auth.uid() = user_id);
   ```

5. **Run locally**
   ```bash
   npm run dev
   ```

6. **Open** [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Auth & Database**: Supabase
- **PDF Generation**: `html2canvas-pro` + `jsPDF` (in-browser)
- **Payments**: Dodo Payments (optional)

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | For public certificate verification |
| `DODO_PAYMENTS_API_KEY` | No | For watermark removal payments |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | No | Dodo webhook verification |
| `API_KEY_HASH_SECRET` | Yes (Phase 2 ingest) | HMAC secret used to hash workspace API keys |
| `ENCRYPTION_MASTER_KEY` | No (Phase 3 secrets) | 32-byte hex key for encrypting stored webhook secrets |
| `CRON_SECRET` | No | Protects cron endpoints like raw body cleanup |
| `UPSTASH_REDIS_REST_URL` | No (Phase 4 alerts) | Upstash Redis URL for shared rate limiting/dedup |
| `UPSTASH_REDIS_REST_TOKEN` | No (Phase 4 alerts) | Upstash Redis token |
| `RESEND_API_KEY` | No (Phase 4 alerts) | Resend API key for email alerts |
| `RESEND_FROM_EMAIL` | No | Alert sender address (default: onboarding@resend.dev) |
| `SITE_URL` | No | Base URL used in alert links |

## Raw Body Retention Cleanup

If you enable `store_raw_body`, the app sets `raw_body_expires_at` and expects an automated cleanup.

MVP-friendly option (recommended): call the cron endpoint periodically:
- `POST /api/cron/cleanup-raw-bodies`
- Header: `Authorization: Bearer $CRON_SECRET`

DB option: run the SQL migration `supabase/migrations/20260204143000_cleanup_raw_bodies.sql` and schedule:
- `select public.cleanup_expired_raw_bodies();`

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.



Built with ❤️ by Deep Mishra
