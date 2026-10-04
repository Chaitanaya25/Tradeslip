# TASKS.md — Tradeslip build plan

Work top to bottom. One task at a time. After each: `pnpm typecheck && pnpm lint && pnpm test`, compare UI against `design/references/*`, then tick `[x]`.

## Phase 0 — Setup (Day 1–2)
- [x] Init Next.js (App Router, TS strict, Tailwind, ESLint), pnpm, path alias `@/`.
- [x] Add shadcn/ui; restyle base tokens per `DESIGN.md` §2–4 in `globals.css` + Tailwind theme. Load Inter via `next/font`. Add `.tabular` utility.
- [x] Install: lucide-react, zod, react-hook-form, @supabase/ssr, @supabase/supabase-js, recharts, @dnd-kit/core, @dnd-kit/sortable, @react-pdf/renderer, resend, react-email, server-only, vitest.
- [x] Create `.env.example` (ARCHITECTURE §3). Supabase project (local via CLI + hosted). _(.env.example done; creating the Supabase project is left to the user, see Decisions log.)_
- [x] Supabase clients: `lib/supabase/server.ts`, `client.ts`, `admin.ts` (server-only).
- [x] `lib/money.ts` (add, multiply qty×rate with rounding, tax from bps, formatMoney) + tests.
- [x] `lib/region.ts` (US/UK/AU config: currency, tax label/default, document word, date format, address labels) + tests.
- [x] Build UI primitives to spec: Button (primary/secondary/outline-accent/ghost/icon), Input, Select, Card, StatusPill, Toggle, Table, Avatar, IconTile. Create a `/dev/ui` page showing all of them.

## Phase 1 — Data & auth (Day 3–5)
- [ ] Migration: businesses, customers, price_items + RLS + `auth_business_id()`.
- [ ] Migration: quotes, quote_items, invoices, invoice_items, job_photos, activity, usage_counters + RLS + indexes.
- [ ] Function `next_doc_number(business_id, kind)`; `dashboard_stats`; `monthly_invoice_totals`.
- [ ] Storage buckets: logos (public), voice-notes (private), job-photos (private) + policies.
- [ ] `seed.sql`: demo business "Miller Plumbing" (US), 8 customers, 12 price items, quotes/invoices across all statuses (realistic names, no lorem).
- [ ] Generate types (`pnpm db:types`).
- [ ] Auth: login page (magic link + Google), callback route, middleware protecting `(app)` routes.
- [ ] RLS test: user A cannot read user B's rows (vitest against local Supabase).

## Phase 2 — Shell, onboarding, price book (Day 6–8)
- [ ] App shell: sidebar per DESIGN §6 (desktop), icon rail (tablet), bottom tab bar + mic FAB (mobile).
- [ ] Onboarding 3-step wizard (PRD F1); creates business, seeds 5 trade price items; redirects to dashboard.
- [ ] Price book page: table, add/edit sheet, archive, search.
- [ ] Settings: business profile + logo upload, regional/tax, numbering, payment terms/validity, payment link.

## Phase 3 — Quotes core (Day 9–14)
- [ ] Customer form component (region-aware address fields).
- [ ] Quote builder layout matching `02-quote-builder.png` (left: voice card + customer; right: document card).
- [ ] Line-item editor: add/remove/reorder (dnd-kit), price-book autocomplete, qty/rate inputs, live totals, needs-price highlight.
- [ ] Toggles: deposit %, include photos. Valid-until date picker.
- [ ] Server actions: create/update draft quote (allocate number on first save), duplicate, delete draft. Totals recomputed server-side.
- [ ] Quotes list page: filters by status, search, table like dashboard.
- [ ] Quote detail page (read view of a sent quote + activity timeline + actions).
- [ ] Job photo upload (client-side compression to 1600px), before/after tag.

## Phase 4 — Voice → quote (Day 15–18)
- [ ] Recorder component: tap/hold, timer, live waveform, 120s cap, cancel, MIME fallback.
- [ ] Signed upload to `voice-notes`.
- [ ] `/api/ai/draft-quote`: plan + usage check, Gemini call with structured output, zod validation, one retry.
- [ ] Deterministic post-processing (price-book overwrite, needs_price, markup, totals, customer match) + unit tests with fixture AI outputs.
- [ ] Wire into builder: transcript card, "Drafted from your price book", populate form; manual entry still works.
- [ ] Mic entry points: dashboard mic button and New Quote → recorder sheet.

## Phase 5 — Sending & public pages (Day 19–22)
- [ ] `public_token` generation; Send sheet (copy link, email via Resend, SMS + WhatsApp deep links).
- [ ] Email templates: quote to customer; viewed/accepted/declined to owner.
- [ ] Public quote page `/q/[token]` matching `03-customer-quote-mobile.png` (server component, whitelisted fields only).
- [ ] View tracking (first view only, skip owner session).
- [ ] Accept modal (name + checkbox) → store acceptance evidence; confirmation state + "Pay deposit" if applicable.
- [ ] Decline with optional reason; Ask a question (mailto/sms).
- [ ] Quote PDF (auth + public routes).

## Phase 6 — Invoices (Day 23–26)
- [ ] Convert accepted quote → invoice (one tap); create from scratch.
- [ ] Invoices list + detail; derived overdue status.
- [ ] Mark paid (method, date, amount; partial payments).
- [ ] Public invoice page `/i/[token]` with "Pay now" → business payment link; invoice PDF.
- [ ] Invoice email template.

## Phase 7 — Dashboard & customers (Day 27–29)
- [ ] Dashboard matching `01-dashboard.png`: stat cards (`dashboard_stats`), recent activity, needs attention, invoices chart, quick actions, today's schedule (hide if empty).
- [ ] Global search (customers, quotes, invoices).
- [ ] Customers list + detail with history and contact buttons.

## Phase 8 — Reminders (Day 30–31)
- [ ] `/api/cron/reminders` per ARCHITECTURE §9 (expire, follow-up, invoice reminders, local-hours window, idempotent).
- [ ] Reminder settings + editable templates in Settings.
- [ ] Tests for reminder eligibility logic.

## Phase 9 — Billing & limits (Day 32–34)
- [ ] `lib/plans.ts` limits; server-side enforcement on send + AI drafts; upgrade prompts in UI.
- [ ] Paddle checkout (Pro monthly/yearly, Business); webhook handler with signature verification.
- [ ] 14-day trial logic + trial-ending email; "Sent with Tradeslip" footer only on free/trial.
- [ ] Billing page in Settings.

## Phase 10 — Landing page & launch (Day 35–38)
- [ ] Marketing home `/` matching `04-landing-page.png`; pricing page; privacy policy; terms.
- [ ] SEO basics: metadata, OG image, sitemap, robots.
- [ ] Sentry + PostHog (events: signup, onboarded, quote_drafted_voice, quote_sent, quote_accepted, invoice_paid, upgraded).
- [ ] Data export (CSV) + delete account.
- [ ] Production: Vercel, hosted Supabase migrations, Resend domain verification, Paddle live mode, cron enabled.
- [ ] Manual QA pass on mobile Safari + Chrome Android for public pages.

## Later (do not start until V1 has paying users)
- V1.1: deposits tracking, recurring invoices, expenses/profit per job, calendar scheduling, review requests, trade templates, Expo Android app.
- V2: Stripe Connect, QuickBooks/Xero export, team members, reports.

## Decisions log
_Record ambiguous choices here with date and one-line reason._
- 2026-10-04: Next.js 16.3 / Tailwind v4 (create-next-app default). Tokens live in `globals.css` (`:root` + `@theme inline`); shadcn semantic vars (`--primary`, `--muted`, ...) are mapped onto our tokens, no dark mode.
- 2026-10-04: shadcn radix-nova preset (radix-ui). Primitives were rewritten to DESIGN.md §7. Dialog/sheet overlays use `bg-text/30` with no blur (glassmorphism ban). `cn()` uses `extendTailwindMerge` so custom type utilities (`text-stat`, `text-h2`, ...) are not dropped as colours.
- 2026-10-04: Extra deps beyond the Phase 0 list, all required by shadcn: radix-ui, class-variance-authority, clsx, tailwind-merge, tw-animate-css, shadcn. `react-email` is installed as `@react-email/components` (current official package).
- 2026-10-04: `@rolldown/binding-win32-x64-msvc` added as a devDependency because pnpm did not install vitest's rolldown native binding on this Windows machine. Revisit before CI/Vercel (Linux): remove it if a clean `pnpm install` works there.
- 2026-10-04: `multiplyQtyByRateCents` converts qty to hundredths (qty is numeric(10,2)) and rounds half away from zero. `taxFromBps` uses the same rounding.
- 2026-10-04: Country key for the UK is `UK` (matches the ARCHITECTURE check constraint), not ISO `GB`. `defaultTaxBps` is 0 (US), 2000 (UK), 1000 (AU); tax is never on by default, the onboarding toggle decides.
- 2026-10-04: Supabase client files read env lazily (error thrown on first use, not at import) so `pnpm build` works without `.env.local`. `src/lib/supabase/types.ts` is an `any` placeholder until `pnpm db:types` exists (Phase 1).
- 2026-10-04: `/dev/ui` is left reachable in all environments for now; gate or remove before launch (Phase 10).
- 2026-10-04: Supabase project creation (local CLI + hosted) is deferred to the user; not done in Phase 0 by instruction.
