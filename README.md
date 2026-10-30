# KernelMiners — daily-earning mining platform

A mobile-first web app where users buy a **mining pack once** and receive a fixed
payout **every 24 hours** for the pack's duration, track live progress, build a
**two-level referral team**, and claim **invite milestones** — all in **UGX**.

Built with **Next.js (App Router) + React 19 + Tailwind v4** and **Supabase**
(Auth + RPC-only Postgres). The palette, logo and product imagery come from
`public/assets`.

## Stack

| Layer     | Choice                                                              |
|-----------|---------------------------------------------------------------------|
| Framework | Next.js 16 (App Router, `src/`), React 19                            |
| Styling   | Tailwind CSS v4 with CSS-variable design tokens (black/orange/yellow) |
| Auth      | Supabase Auth (email/password), refreshed in `src/proxy.ts`          |
| Data      | Supabase Postgres, accessed **exclusively** via `SECURITY DEFINER` RPC |
| Icons     | lucide-react                                                        |

## Getting started

```bash
npm install
cp .env.example .env.local     # Supabase keys + SHASHURA credentials
npm run dev
```

Apply the migrations in order (Supabase SQL editor, or `supabase db push`):

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_functions_mutations.sql
supabase/migrations/0003_functions_reads.sql
supabase/migrations/0004_seed.sql
supabase/migrations/0005_payments.sql
supabase/migrations/0006_rules.sql
supabase/migrations/0007_identity.sql
supabase/migrations/0008_payout_runs.sql
supabase/migrations/0009_super_admin.sql
supabase/migrations/0010_admin_console.sql      # operations console RPCs
supabase/migrations/0011_support_links.sql      # Telegram support channels
supabase/migrations/0012_admin_wallet_and_payout_gate.sql  # manual credit/debit + approve→send
```

Without env vars the app still builds and runs in **demo mode** (a setup notice
is shown on the login screen; the product catalogue falls back to
`src/lib/catalog.ts`).

## Product rules (mirrored in `src/lib/brand.ts`)

| # | Pack | Price (UGX) | Daily (UGX) | Days | Total (UGX) |
|---|------|------------:|------------:|-----:|------------:|
| 1 | KMA1 | 30,000  | 8,000  | 6  | 48,000  |
| 2 | KMA2 | 50,000  | 10,000 | 8  | 80,000  |
| 3 | KMA3 | 80,000  | 15,000 | 10 | 150,000 |
| 4 | KMA4 | 200,000 | 40,500 | 8  | 324,000 |
| 5 | KMA5 | 400,000 | 90,000 | 8  | 720,000 |

- **Cycles:** one payout per 24h measured on the **server clock** from
  `started_at`; the pack completes after `duration_days` cycles.
- **Referral:** 19% (level 1) + 1% (level 2) of every successful investment,
  credited instantly to the referrer's available balance.
- **Invite milestones:** 8 → unlock 30,000 / extra 10,000 · 28 → 50,000 / 40,000
  · 68 → 80,000 / 100,000 · 128 → 200,000 / 500,000 (level-1 invites).
- **Wallet:** min deposit 30,000, min withdrawal 30,000, 1% withdrawal fee,
  4-digit security PIN for withdrawals and transfers.

## Routes

```
/                     redirect → /login (signed-in users → /home via proxy)
/login /register?ref=CODE /findpwd        public auth screens
/about /help /notice                      public info screens
                                          (/notice = support links + notices)

(app) tab shell
  /home          balance, quick actions (Deposits, Withdraw, Income, Strategy,
                 Withdraw history), packs, active mining, invite card
  /products      strategy catalogue          /products/[no]  pack detail + invest
  /portfolio     active / completed packs with 24h progress
  /income        earnings breakdown (daily, L1, L2, task rewards)
  /team          invite link, level 1 / level 2 members + commission
  /tasks         four invite milestones with claim buttons
  /wallet        balance + recent activity
  /wallet/{deposit,withdraw,transfer,ledger,withdrawals}
  /me            profile + menu            /settings/{security,language}

(admin) operations console — own shell, no tab bar, admin session required
  /admin         overview: members, money, mining, queues, 14-day trends
  /admin/members /admin/members/[id]      directory + member 360° drill-down
  /admin/deposits /admin/investments /admin/ledger
  /admin/withdrawals                     payout queue (approve → send, or reject)
  /admin/products                        pack pricing + on-sale toggle
  /admin/notices                         notice board + support channels
  /admin/settings                        programme rules + admin roster

API (route handlers, Node runtime)
  POST /api/payments/deposit          push a mobile-money collection
  POST /api/webhooks/shasure          signed callback: credit / settle / refund
  GET  /api/admin/{overview,members,members/[id],deposits,investments,
       ledger,products,notices,support,admins,config}   read (service role)
  POST /api/admin/{products,notices,support,admins,config}   write
  GET  /api/markets                   live BNB/BTC/ETH/SOL/XRP/NEAR/USDT/TRX/SUI/WLD tape
  GET  /api/admin/withdrawals         payout queue
  POST /api/admin/withdrawals/[id]    approve (queue), release (disburse) or reject (refund)
  POST /api/admin/members/[id]/wallet credit or debit one wallet (ledgered)

PWA
  /manifest.webmanifest               manifest generated from src/app/manifest.ts
  /sw.js /offline.html                service worker + offline card
  /icons/* /og/*                      launcher icons + 1200x630 share card
```

## Architecture

```
src/
  lib/
    brand.ts        # brand, rules, product & milestone seed data, copy
    types.ts        # domain model shared with SQL
    api.ts          # typed feature API (one call per Postgres function)
    rpc.ts          # Supabase RPC wrapper ({ ok, data } envelope)
    format.ts       # UGX / date / progress formatting
    catalog.ts      # seed products used when the backend is not connected
    shasure.ts      # server-only gateway client (token, collection, payout, HMAC)
    payments.ts     # browser helpers for the /api payment routes
    msisdn.ts       # Ugandan MSISDN normalisation + network lookup
    admin-auth.ts   # ADMIN_EMAILS gate for route handlers
    supabase/       # browser + server clients, service-role client, config
  app/api/          # payment + admin route handlers
  components/       # UI primitives, layout shell, providers, ReferralCard,
                    # InstallApp (PWA prompt), ServiceWorkerRegister
  proxy.ts          # session refresh + route protection
supabase/migrations/ # schema, RPC functions, seed, payments
```

### Data access = RPC only

The browser never touches tables. Every read/write calls a Postgres function
returning `{ ok:true, data }` or `{ ok:false, code, message }`. RLS is enabled on
every table with **no** policies and direct grants are revoked, so the functions
are the single audited entry point.

Key functions: `km_dashboard`, `km_bootstrap_account`, `km_invest`, `km_accrue`,
`km_list_products`, `km_product_detail`, `km_list_investments`, `km_list_ledger`,
`km_create_deposit`, `km_attach_deposit`, `km_list_deposits`,
`km_request_withdrawal`, `km_list_withdrawals`,
`km_transfer`, `km_team_summary`, `km_team_members`, `km_list_milestones`,
`km_claim_milestone`, `km_list_notices`.

Privileged functions (granted to `service_role` only, never the browser):
`km_settle_payment`, `km_admin_list_withdrawals`, `km_admin_approve_withdrawal`,
`km_admin_begin_payout`, `km_admin_reject_withdrawal`, `km_admin_attach_payout`,
`km_admin_mark_withdrawal_paid`, `km_admin_adjust_wallet`.

### Money model

- **Balance:** `available / invested / earned_total / pending_withdrawal` (UGX).
- **Invest:** `available → invested`, opens an investment row; pays 19% / 1%
  commission to referrer and referrer's referrer.
- **Accrue:** lazily on read — `floor((now() - started_at) / 24h)` cycles, capped
  at `duration_days`; credits `available` + `earned_total` and flips the pack to
  `completed` on the final cycle (principal is consumed by the payouts).
- **Referral codes:** generated at provisioning time; `/register?ref=CODE`
  prefills the invite field and the trigger links the two referral levels.
- **PIN:** bcrypt via `pgcrypto`, required for withdrawals and transfers.

## Payments — SHASHURA mobile money

Gateway docs: <https://www.shashura.com/developers>. All gateway calls are made
from route handlers; the client secret never reaches the browser.

**Deposit (automatic).** `/wallet/deposit` posts the amount and number to
`/api/payments/deposit`, which opens a `pending` `km_deposit` and pushes a
`requestToPay` collection (USSD PIN prompt). The screen polls `km_list_deposits`
while the payer approves. SHASHURA then POSTs `transaction.finalized` to
`/api/webhooks/shasure`; after HMAC verification `km_settle_payment` credits the
balance and writes the `deposit` ledger row — idempotent, so retries are safe.

**Withdrawal (admin approved, in two steps).** `km_request_withdrawal` holds the
amount (`available → pending_withdrawal`) and allocates a `WD-…` reference.
Admins work the queue at `/admin/withdrawals`:

1. **Approve** — `km_admin_approve_withdrawal` flips the request to `approved`
   and records `approved_by`. No money moves and the gateway is not called.
2. **Send** — `km_admin_begin_payout` refuses anything that is not approved and
   unsent, then the route calls `disburse` for the net amount from the server.
   `SUCCESSFUL` marks the request `paid` and releases the hold; `FAILED` (or a
   gateway error) marks it `failed`/`rejected` and refunds the amount with a
   `withdrawal_refund` ledger row.

**Manual adjustment.** `km_admin_adjust_wallet` credits or debits one wallet by
hand: `available` moves and a `admin_credit` / `admin_debit` ledger row is written
in the same transaction, with the reason and the admin's email in the memo. A
debit cannot push `available` below zero and neither direction touches
`earned_total` (a manual credit is not mining income). Available at
`/admin/members/[id]` → **Adjust wallet**.

Setup checklist:

1. Merchant dashboard → Settings → API Access: copy client ID + secret.
2. Settings → Apps: set the callback URL to `https://<domain>/api/webhooks/shasure`
   and copy the signing secret into `SHASHURA_WEBHOOK_SECRET`.
3. Whitelist the server IP (gateway returns `IP_NOT_WHITELISTED` otherwise).
4. Set `ADMIN_EMAILS` and `SUPABASE_SERVICE_ROLE_KEY` in the hosting env.
5. `SHASHURA_ENVIRONMENT=production` when you are done with sandbox.

Without gateway credentials the app stays in demo mode: deposits credit
instantly via `km_request_deposit` and approvals settle without a payout.

## Operations console (`/admin`)

A 360° view of the programme for staff. It lives in its own `(admin)` route group
so it gets a wide canvas (sidebar on `lg+`, scrolling pill nav on phones) instead
of the 480px member shell.

| Page | What it answers |
|------|-----------------|
| `/admin` | Members, money in/out, open queues, mining obligation, 14-day trends, top earners, live activity feed |
| `/admin/members` | Searchable directory (username, phone, email, referral code) with available / invested / earned |
| `/admin/members/[id]` | Member 360°: wallets with manual credit / debit, packs with 24h progress, every ledger row, payouts, deposits, referral team, task claims, promote/demote |
| `/admin/deposits` `/admin/investments` `/admin/ledger` | Server-paginated transaction browser per table |
| `/admin/withdrawals` | Payout queue — approve (queue it), send (disburse), or reject (refund) |
| `/admin/products` | Pack price / daily / duration, on-sale toggle. Running contracts keep their locked-in terms |
| `/admin/notices` | Notice board editor + the Telegram support channels |
| `/admin/settings` | Programme rules (`km_config`) and the admin roster |

**Access.** Three independent gates:

1. `src/proxy.ts` keeps `/admin` in `PROTECTED_PREFIXES` — no session redirects to
   `/login?next=/admin`.
2. `src/app/(admin)/admin/layout.tsx` re-checks on the server; a signed-in
   non-admin is bounced to `/me`.
3. Every `/api/admin/*` handler calls `adminGuard()` from `src/lib/admin-route.ts`,
   which returns `401 NOT_AUTHENTICATED`, `403 FORBIDDEN`, or
   `503 NOT_CONFIGURED` when `SUPABASE_SERVICE_ROLE_KEY` is absent.

Admin status comes from `ADMIN_EMAILS` (break-glass env list, matches a username
as `user@users.kernelminers.app`) **or** the `is_super_admin` database flag, so
grants survive redeploys:

```sql
select public.km_set_super_admin('joel.k');         -- promote by username
select public.km_set_super_admin('joel.k', false);  -- demote
```

The same thing is available in `/admin/settings` → Administrators (the last admin
cannot be demoted). Accounts that are admin through `ADMIN_EMAILS` only will not
appear in that roster.

**Data path.** All metrics are aggregated inside Postgres by migration
`0010_admin_console.sql` (`km_admin_overview`, `km_admin_member_detail`, …) so the
console makes one round trip per page instead of scanning tables in the browser.
Those functions are `security definer`, revoked from `anon`/`authenticated`, and
granted to `service_role` only; the service key never reaches the client.

## Support channels

Members reach a human through two Telegram destinations set in the console at
`/admin/notices` → **Support channels**: a direct chat and the community group.
Each has a URL and the button caption; leave a URL empty to hide that button.
An optional support email is shown underneath.

The links live in `km_setting` (text key/value; `km_config` stays numeric for the
rules engine) and are read through `km_get_support()`, which is granted to `anon`
so the public help centre can show them too. `km_admin_set_support()` validates
`https://` links and is service-role only.

Where they appear: `/notice` (top of the Support & notices screen, behind the
bell on Home) and `/help`. `src/components/SupportLinks.tsx` renders nothing at
all when both channels are off, so pages never show an empty card.

## Live market tape

`/api/markets` returns a 10-asset snapshot (BNB, BTC, ETH, SOL, XRP, NEAR, USDT,
TRX, SUI, WLD) for the sliding strip on Home: price, 24h change, 24h volume and a
24-point sparkline. It is cached in-process for 60s and sourced from CoinGecko,
falling back to Binance (plus hourly klines for the sparkline), then to a static
snapshot that the UI labels **Indicative**. No API key is required.

## Brand assets

| Asset | Use |
|-------|-----|
| `public/assets/logo.jpg` | source of truth — the only logo file to replace |
| `public/icons/*.png` | PWA launcher icons (192, 512, maskable 512, Apple 180) |
| `public/og/og-default.jpg` | 1200x630 Open Graph / Twitter card |
| `public/assets/product_image.jpg` | every mining pack card/detail |
| palette `#070707 / #ff6a00 / #ffc600` | tokens in `src/app/globals.css` |

All derived assets are generated, not hand-drawn:

```bash
npm run assets     # scripts/pwa-assets.mjs — reads logo.jpg, writes icons + share card
```

The script finds the mark by scanning for the empty band between it and the
wordmark, lifts the black background into alpha, and re-renders the share card
text; rerun it whenever `logo.jpg` changes.

## Sharing & install

- `metadataBase` resolves from `NEXT_PUBLIC_SITE_URL`, then Vercel's
  `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, then `localhost`. Empty or
  scheme-less values are normalised, so a blank env var can never break a build.
- Every page inherits `openGraph` + `twitter` metadata pointing at
  `/og/og-default.jpg` (absolute URL, 1200x630), so invite and deposit links
  unfurl with the logo and tagline.
- `src/app/manifest.ts` declares the standalone PWA (start at `/home`, shortcuts
  for deposit, packs and withdraw). `ServiceWorkerRegister` registers `/sw.js`
  in production; navigations stay network-first with an offline fallback, and
  static chunks are stale-while-revalidate.
- The **Download app** card on `/home` (`src/components/InstallApp.tsx`) consumes
  `beforeinstallprompt` when the browser offers it and otherwise opens a how-to
  sheet (iOS Safari has no prompt API).

To retune the platform, edit `src/lib/brand.ts` (rules + seed) and the CSS
custom properties at the top of `src/app/globals.css`. Protocol constants are
mirrored in the SQL migrations — keep both in sync when changing fees or limits.
