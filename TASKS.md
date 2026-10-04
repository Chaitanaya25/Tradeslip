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
- [x] Customer form component (region-aware address fields).
- [x] Quote builder layout matching `02-quote-builder.png` (left: voice card + customer; right: document card).
- [x] Line-item editor: add/remove/reorder (dnd-kit), price-book autocomplete, qty/rate inputs, live totals, needs-price highlight.
- [x] Toggles: deposit %, include photos. Valid-until date picker.
- [x] Server actions: create/update draft quote (allocate number on first save), duplicate, delete draft. Totals recomputed server-side.
- [x] Quotes list page: filters by status, search, table like dashboard.
- [x] Quote detail page (read view of a sent quote + activity timeline + actions).
- [x] Job photo upload (client-side compression to 1600px), before/after tag.

## Phase 4 — Voice → quote (Day 15–18)
- [x] Recorder component: tap/hold, timer, live waveform, 120s cap, cancel, MIME fallback.
- [x] Signed upload to `voice-notes`.
- [x] `/api/ai/draft-quote`: plan + usage check, Gemini call with structured output, zod validation, one retry.
- [x] Deterministic post-processing (price-book overwrite, needs_price, markup, totals, customer match) + unit tests with fixture AI outputs.
- [x] Wire into builder: transcript card, "Drafted from your price book", populate form; manual entry still works.
- [x] Mic entry points: dashboard mic button and New Quote → recorder sheet.

## Phase 5 — Sending & public pages (Day 19–22)
- [x] `public_token` generation; Send sheet (copy link, email via Resend, SMS + WhatsApp deep links).
- [x] Email templates: quote to customer; viewed/accepted/declined to owner.
- [x] Public quote page `/q/[token]` matching `03-customer-quote-mobile.png` (server component, whitelisted fields only).
- [x] View tracking (first view only, skip owner session).
- [x] Accept modal (name + checkbox) → store acceptance evidence; confirmation state + "Pay deposit" if applicable.
- [x] Decline with optional reason; Ask a question (mailto/sms).
- [x] Quote PDF (auth + public routes).

## Phase 6 — Invoices (Day 23–26)
- [x] Convert accepted quote → invoice (one tap); create from scratch.
- [x] Invoices list + detail; derived overdue status.
- [x] Mark paid (method, date, amount; partial payments).
- [x] Public invoice page `/i/[token]` with "Pay now" → business payment link; invoice PDF.
- [x] Invoice email template.

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
- 2026-10-04: Phase 3 adds migration `005_save_quote.sql` (`save_quote`): saving a draft and replacing its items must be one transaction, which separate API calls cannot give. It is SECURITY INVOKER, locks the quote row, refuses non-drafts, and rolls back on any bad item (smoke-tested in PGlite). It must be run before quotes can be saved.
- 2026-10-04: Server recomputes line amounts, subtotal, tax, total, `tax_rate_bps` snapshot and currency on every draft save from the business settings (`lib/quote-helpers.ts` `buildSavePayload`); client totals are never accepted. Tax is rounded once on the subtotal.
- 2026-10-04: Customers: an explicitly chosen (linked) customer is updated with the form's contact details; an automatic match (same name + phone or postcode) is reused without changes; otherwise a new customer is created. Customer name is required to save a draft.
- 2026-10-04: Fully blank item rows (no description, no rate) are ignored on save. A rate left blank is stored as 0; `needs_price` is kept only while the rate is 0. Choosing a price-book material applies its markup to the rate. When the deposit toggle is off the typed percent is kept if valid, else 3000 bps.
- 2026-10-04: Valid-until uses the native date input (no picker dependency). Drag handle transforms are written by hand so `@dnd-kit/utilities` is not needed. Unsaved-changes guard covers tab close/refresh and in-app links; the browser Back button cannot be intercepted by the App Router.
- 2026-10-04: Activity events logged now: `quote.created` and `quote.duplicated` only. Duplicate does not copy photos, tokens, timestamps or voice data. Number gaps are possible if a save fails after `next_doc_number`.
- 2026-10-04: Job photos: re-encoded to JPEG (max 1600px, quality 0.8) in the browser, stored at `job-photos/{business_id}/{quote_id}/{uuid}.jpg`, capped at 10 per quote on the server, shown via 1-hour signed URLs. Photos can only be added to drafts.
- 2026-10-04: Phase 4 adds migration `006_voice_and_limits.sql`: `save_quote` also stores `voice_note_path` and `transcript` (only when those keys are sent, so duplicate never clears them), plus service-role-only atomic counters `increment_ai_drafts` (reserve with limit check in one statement), `refund_ai_draft` and `rate_limit_hit`. Owners still cannot write `usage_counters` or `rate_limits`; the service-role client is used only in `server/ai/usage.ts` after the user, business and voice path are verified.
- 2026-10-04: Model is `gemini-3.5-flash-lite` as requested, in one constant with a `GEMINI_MODEL` env override; I could not confirm the id exists until the first live call (a "model not found" error maps to a friendly message). Only new dependency: `@google/genai` (official SDK: inline audio, structured JSON output config, token usage).
- 2026-10-04: Limits: trial and free 10 drafts per month, pro and business 300 (business-timezone month), 5 requests per minute per user (fixed one-minute window, key stored in `rate_limits.ip` as `user:{id}`). A draft is reserved before the Gemini call and refunded if the call fails before producing a result; parse failures still count (the cost was incurred).
- 2026-10-04: The 120 second cap is enforced by the recorder (auto-stop) plus a 10 MB audio size cap on the server; the server does not decode audio to measure its duration.
- 2026-10-04: Post-processing is the only thing that decides prices: a known price-book id gets the book rate (markup applied to materials) whatever the AI said; unknown ids are dropped; spoken prices above $100,000 or negative are treated as unpriced; call-out items are added only if the speaker says call-out, or the business charges one and the speech clearly describes a site visit (small phrase list), and never duplicated.
- 2026-10-04: Applying a draft replaces customer, title, notes and items (after a confirm if the form already has content) and sets the voice note + transcript on the form; nothing is saved until Save draft. A draft with no items and no customer only stores the transcript. Re-recording or abandoning a recording leaves the old voice file behind (cleanup is a documented future task); deleting a draft deletes its voice note.
- 2026-10-04: `AI_DRAFTING_ENABLED=false` (or a missing `GEMINI_API_KEY`) shows the manual-entry message in the voice card and the API returns 503. Mic buttons on the mobile bar, Quotes header and Dashboard open `/quotes/new?record=1`.
- 2026-10-04: Phase 5 adds migration `007_public_quotes.sql`: `get_public_quote`, `record_quote_view`, `accept_quote`, `decline_quote`, `reserve_quote_send`, `refund_quote_send`, all SECURITY DEFINER and executable by the service role only. The public JSON is a whitelist (it also returns the quote number prefix, business timezone and a `plan_branding` boolean, never ids, the token, the owner's email or the plan name); `photos` carries storage paths for server-side signing only. Unknown tokens and drafts both return null. Open quotes past `valid_until` read as `expired` (business timezone) without changing the stored status.
- 2026-10-04: Sending: opening the Send sheet performs the send (marks the quote sent, uses a free-plan slot, issues a fresh app-generated `public_token`); the placeholder token a draft got from the database default is never shared. Email/SMS/WhatsApp from the sheet are extra deliveries (`quote.emailed` / `quote.shared`). Free plan = 3 first-sends per business-timezone month via the atomic `reserve_quote_send` (refunded if the status update fails); trial and paid are unlimited. Owner-side actions live in `server/actions/quote-sending.ts` (not appended to quotes.ts) because "use server" files can only export async functions.
- 2026-10-04: `getSendProblems` (lib/quote-send.ts) replaces the Phase 3 `validateQuoteForSending`; it runs in the builder (checklist) and on the server, and also rejects a first send whose valid-until date has passed. The state machine (accept/decline/expiry/first view) is mirrored in pure functions so it is unit tested next to the SQL.
- 2026-10-04: First view is recorded server-side when the page renders, only for status `sent`, skipping bots/previewers (user-agent list, empty UA counts as a bot) and the signed-in owner (a user-client lookup by token under RLS only returns the owner's own quote). The owner gets one email, via `after()`; accept/decline always email. Rate limits (10/min per IP and per token for accept/decline; PDF 10/min per IP) use `rate_limit_hit` with subjects `ip:{ip}` and `tok:{sha256 prefix}`.
- 2026-10-04: No new dependency: `resend`, `@react-email/components` and `@react-pdf/renderer` were installed in Phase 0. Inter TTFs (OFL, license in `public/fonts/Inter-OFL.txt`) were copied from the `@expo-google-fonts/inter` package without adding it. `next.config.ts` traces `public/fonts` into the two PDF routes. PDFs support PNG/JPEG logos only (other formats fall back to the monogram).
- 2026-10-04: Email deliverability: customer and owner emails send from `EMAIL_FROM`; until that domain is verified in Resend, Resend only delivers to the account owner. Failures return a friendly message and never break the flow.
- 2026-10-04 (Phase 5.1) PDF: text overlapped because blocks had no explicit line height or bottom margin. Every Text now sets fontSize, lineHeight and a margin, columns are flex Views with `flexBasis: 0` so long names wrap, and very long unbroken words are split by a hyphenation callback. The table header is a `fixed` View inside the table wrapper, which repeats at the top of continuation pages (checked by rasterising with a scratch PyMuPDF script, not a project dependency). Rows use `wrap={false}` so none splits. Page numbers via react-pdf `render` did not output in this version, so the footer is a static line (branding or business name); the monogram is now the first letters of the first two words ("MP"), on the PDF and the public page.
- 2026-10-04 (Phase 5.1) Email honesty: `sendEmail` reports success only when Resend returns a message id, and failures map to `not_configured | unverified_domain | invalid_address | rate_limited | failed` with plain wording (`lib/email-errors.ts`, tested). The `quote.emailed` activity is only written on success. After success the sheet says "Delivered to the mail server. If the customer can't find it, ask them to check spam." The sheet states that opening it marked the quote as Sent and that email, text and WhatsApp are separate deliveries, each with its own result; text and WhatsApp can only say "Opened on your phone. We can't tell if it was sent."
- 2026-10-04 (Phase 5.1) OTP acceptance (migration 008): customers with an email on file must enter a 6-digit code to accept. Codes are stored as sha256(code + OTP_PEPPER) in `quote_accept_otps` (RLS on, no policies); 10 minute expiry, 60 second cooldown, 3 codes per hour per quote, 5 attempts per code (then locked), previous codes invalidated on issue, used codes cannot be reused. `accept_quote` now refuses when the customer has an email, so the code step cannot be bypassed; with no email on file the single-step accept still works and is stored `accepted_verified = false`. `OTP_PEPPER` is required in production (16+ chars; OTP actions refuse without it) and falls back to a clearly-named dev value elsewhere. The customer's email is read server-side (`get_accept_target`, service role only) and the browser only ever receives a masked form (`j***@gmail.com`); codes and addresses are never logged. The owner viewing their own public link sees a calm banner and Accept/Decline are disabled (the actions also refuse an owner session). An owner could still set `accepted_verified` directly on their own row through RLS; it is evidence for the owner, not a third-party guarantee.
- 2026-10-04 (Phase 6) Migration `009_invoices.sql` (run it): `invoices.title`, `cheque` payment method, `invoice_payments` (select + function-only insert, no update/delete), `save_invoice`, `record_invoice_payment` (locks the invoice, idempotency key, never over-pays), `void_invoice`, `create_invoice_from_quote`, `get_public_invoice`, `record_invoice_view`, `invoice_derived_status`. Owner functions are SECURITY INVOKER (RLS applies); the two public ones are SECURITY DEFINER, service role only.
- 2026-10-04 (Phase 6) Derived status: overdue (sent/viewed, money remaining, due date before today in the business timezone) beats partial, since overdue is the "money is late" signal; the list still shows "{x} remaining" for a part-paid overdue invoice. Same rule in `derivedStatus` (TS), `invoice_derived_status` (SQL) and `dashboard_stats`; `summariseInvoices` is the TS twin used in tests.
- 2026-10-04 (Phase 6) Tamper guard: the 002 RLS policy let an owner update `amount_paid_cents`, `status`, totals and sent items straight through the API. Triggers on `invoices` and `invoice_items` now block that for signed-in callers unless the transaction-local flag `app.invoice_fn` is set, which only the SQL functions set. Normal sends (draft to sent, token, sent_at) still work through the user client. Direct payment inserts are refused by the insert policy for the same reason. There is no delete policy on payments: a void is refused once a payment exists, so nothing ever needs deleting.
- 2026-10-04 (Phase 6) `dashboard_stats` fix: paid this/last month summed `amount_paid_cents` of invoices by `paid_at`, which misdated part payments. It now sums `invoice_payments` by `paid_on` (void invoices excluded). 009 backfills one payment row for any invoice that already shows money (demo seed data) so the figures agree.
- 2026-10-04 (Phase 6) Brief conflict: item 2 said void invoices return NULL publicly, item 7 said the page shows a muted void notice. A void invoice now returns a minimal object (status, number, business name/contact only; no amounts, items or customer). Drafts and unknown tokens stay NULL and 404.
- 2026-10-04 (Phase 6) One live (non-void) invoice per quote (partial unique index plus a row lock in the function); a voided invoice may be re-issued. Creating from a quote copies customer, items, totals, tax snapshot, currency, title and notes; a deposit is only noted ("Deposit of $X requested on acceptance.") and never assumed paid.
- 2026-10-04 (Phase 6) Create-from-quote navigation is client side (`CreateInvoiceButton`, and `/invoices/new?quoteId=` which runs the same action once), because a server component cannot revalidate paths while rendering. The "already exists" case shows the toast and opens the existing invoice.
- 2026-10-04 (Phase 6) Photos are skipped on invoices (`JobPhotos` is bound to quotes); the builder has no voice card or deposit toggle. Invoice PDF filename is `Invoice-{number}.pdf` without the prefix. Public page shows "Pay now" only when the business has a payment link and a balance is owed; Tradeslip never handles customer card payments.
- 2026-10-04 (Phase 6) Shared code instead of copies: `server/customer-resolver.ts` (customer upsert + number allocation), `schemas/document-parts.ts` (customer and item fields/checks), `SendSheet` takes `onEmail`/`onShared`, `components/public/document-parts.tsx`, `server/pdf/doc-parts.tsx`. No new dependencies.
