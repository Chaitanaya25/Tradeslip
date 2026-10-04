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
- [x] Migration: businesses, customers, price_items + RLS + `auth_business_id()`.
- [x] Migration: quotes, quote_items, invoices, invoice_items, job_photos, activity, usage_counters + RLS + indexes.
- [x] Function `next_doc_number(business_id, kind)`; `dashboard_stats`; `monthly_invoice_totals`.
- [x] Storage buckets: logos (public), voice-notes (private), job-photos (private) + policies.
- [x] `seed.sql`: demo business "Miller Plumbing" (US), 8 customers, 12 price items, quotes/invoices across all statuses (realistic names, no lorem).
- [x] Generate types (`pnpm db:types`). _(hand-written to match the migrations; `pnpm db:types` regenerates from the live DB once `SUPABASE_PROJECT_ID` is set)_
- [x] Auth: login page (magic link + Google), callback route, middleware protecting `(app)` routes. _(Next 16 calls it `proxy.ts`; end-to-end login not yet tried against a live project)_
- [x] RLS test: user A cannot read user B's rows (vitest against local Supabase). _(written; runs only when `TEST_SUPABASE_*` point at a throwaway project, skipped otherwise)_

## Phase 2 — Shell, onboarding, price book (Day 6–8)
- [x] App shell: sidebar per DESIGN §6 (desktop), icon rail (tablet), bottom tab bar + mic FAB (mobile).
- [x] Onboarding 3-step wizard (PRD F1); creates business, seeds 5 trade price items; redirects to dashboard.
- [x] Price book page: table, add/edit sheet, archive, search.
- [x] Settings: business profile + logo upload, regional/tax, numbering, payment terms/validity, payment link.

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
- 2026-10-04: `/dev/*` is public only when `NODE_ENV !== 'production'` (see `src/lib/auth/routes.ts`); remove the page before launch (Phase 10).
- 2026-10-04: Supabase project creation (local CLI + hosted) is deferred to the user; not done in Phase 0 by instruction.
- 2026-10-04: Phase 1 SQL is plain files in `supabase/migrations/` (001-004) + `supabase/seed.sql`, applied by pasting into the SQL editor (no Docker). Smoke-tested twice in a scratch PGlite instance with stubbed `auth`/`storage` schemas; not yet run on a real Supabase project.
- 2026-10-04: Next 16 renamed middleware to `src/proxy.ts`. It is default-deny with an allowlist (`src/lib/auth/routes.ts`): `/`, `/login`, `/pricing`, `/auth/*`, `/q/*`, `/i/*`, `/api/cron/*`, `/api/webhooks/*`, plus `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` (needed in Phase 10). Unauthenticated `/api/*` returns 401 JSON; pages redirect to `/login`. Server pages still call `requireUser()`.
- 2026-10-04: Callback lives at `/auth/callback` (not `(auth)/callback` from ARCHITECTURE §2, because a route group would make the URL `/callback`). After sign-in: no business or `onboarded_at` null -> `/onboarding`, else `/dashboard`. No `next` redirect param yet.
- 2026-10-04: Security additions beyond ARCHITECTURE §4: trigger `guard_business_billing` stops owners changing `plan`, `trial_ends_at` and `paddle_*` (service role / SQL editor only); `usage_counters` is read-only for owners so limits cannot be reset from the browser; `activity` is insert/select only (audit trail); quotes/invoices/items/photos policies also check that linked customer/quote/price item belong to the same business.
- 2026-10-04: `public_token` has a DB default (two UUIDs as hex, 64 chars) as a safety net; the app will generate 24-byte base64url tokens in Phase 5 (`lib/tokens.ts`).
- 2026-10-04: `next_doc_number` is security invoker and called as an RPC, so it is atomic but not in the same transaction as the later insert: a failed insert can leave a gap in numbers, never a duplicate.
- 2026-10-04: Dashboard stat definitions: owed = unpaid remainder of sent/viewed invoices (incl. overdue, extra `owed_count` column added for "3 invoices"); overdue = the part of owed past `due_date` in the business timezone; paid this/last month = `amount_paid_cents` where `paid_at` falls in that month (business timezone, void excluded); chart groups non-draft, non-void invoices by `issue_date` month, empty months returned as zeros.
- 2026-10-04: `types.ts` uses literal unions for CHECK-constrained columns; the Supabase CLI would emit `string`, so narrow values after regenerating. Helper aliases live in `src/lib/supabase/tables.ts`. The `seed_*` helper functions are not in the types (editor-only).
- 2026-10-04: `.env.example` gained `SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` and commented `TEST_SUPABASE_*` vars. RLS tests read `TEST_*` from `.env.test.local` (parsed in `vitest.config.mts` with `node:util` `parseEnv`).
- 2026-10-04: `@supabase/supabase-js` warns that Node 20 is deprecated; use Node 22+ locally and on Vercel.
- 2026-10-04: Phase 2 route layout: `(app)/layout.tsx` requires a user + toasts; `(app)/(shell)/layout.tsx` adds the sidebar and redirects users without an onboarded business to `/onboarding`; `/onboarding` sits outside `(shell)` so it never shows the sidebar. Pages that need the business call `requireBusiness()` because layouts do not re-run on client navigation.
- 2026-10-04: Onboarding saves a draft business on step 1 "Continue" (so a logo can upload to `logos/{business_id}/`), and the wizard resumes from that draft. `completeOnboarding` seeds price items only if none exist and sets `onboarded_at` last, so a failed finish can be retried safely.
- 2026-10-04: No `@hookform/resolvers`: a ~20-line `zodResolver` in `lib/forms.ts`. Forms hold raw strings; each schema is `z.object(strings).transform(...)` run through one `Check` (`lib/schemas/fields.ts`) so every error shows in a single pass. Money is typed in dollars/pounds and stored as cents; tax rates are typed as percent and stored as basis points.
- 2026-10-04: Tax: when "registered" is off, `tax_rate_bps` is stored as 0 and `tax_enabled` false (the region default is suggested again when switched on). Registered requires a rate above 0. Phone and business email are required in onboarding; phone is optional in Settings.
- 2026-10-04: Sidebar user block shows `user_metadata.full_name`, else a prettified email local part (no owner-name column exists). Settings > Business profile has an optional "Your name" saved to auth metadata with `auth.updateUser`.
- 2026-10-04: Toast is hand-written (`ui/toast.tsx`), no sonner. Price-book type pills reuse existing status colours (labour = viewed blue, material = sent grey, fee = awaiting amber); no new colours. Price-book search/archived filtering is client-side (a solo trader has well under a few hundred items).
- 2026-10-04: Starter price items (`lib/trade-seeds.ts`) are 5 per trade; labour = multiples of the user's hourly rate, call-out uses the user's fee, fixed USD amounts are scaled x0.8 (GBP) / x1.5 (AUD) to whole units. They are approximate and editable. US spelling "meter" vs "metre" follows the country.
- 2026-10-04: Settings are nested routes (`/settings/business|regional|numbering|payment-link`), each form with its own action and an explicit column whitelist; country and currency are not editable after onboarding. Billing, Reminders and Data export are disabled "Coming soon" entries.
- 2026-10-04: `/quotes/new` is a "Coming soon" placeholder so the mobile mic FAB never 404s.
