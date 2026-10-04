# ARCHITECTURE.md — Tradeslip

## 1. Stack
| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, latest stable), TypeScript strict | One codebase for app, public pages, API, marketing |
| Styling | Tailwind CSS + shadcn/ui (restyled to DESIGN.md tokens) | Fast, consistent |
| Icons | lucide-react | Matches design |
| Forms | react-hook-form + zod | Validation shared client/server |
| DB / Auth / Storage | Supabase (Postgres, Auth, Storage, RLS, pg_cron) | Free tier, RLS security |
| AI | Google Gemini Flash (audio in → structured JSON out) | Cheap, handles audio directly |
| PDF | @react-pdf/renderer (server-side) | Matches design, no headless browser |
| Email | Resend + react-email templates | Simple, cheap |
| Charts | Recharts | Bar chart on dashboard |
| Drag & drop | @dnd-kit | Line-item reordering |
| Billing (web) | Paddle (merchant of record) | Handles global VAT/sales tax, pays out to India |
| Hosting | Vercel (Hobby → Pro when paid) | Zero-config Next.js |
| Errors | Sentry (free tier) | Production visibility |
| Analytics | PostHog (free tier) | Activation funnel |
| Tests | Vitest (+ Playwright later for e2e) | |
| Mobile (V1.1) | Expo app in a separate repo, same Supabase backend | |

## 2. Folder structure
```
/
├─ CLAUDE.md  PRD.md  DESIGN.md  ARCHITECTURE.md  TASKS.md
├─ design/references/            # 01-dashboard.png, 02-quote-builder.png, ...
├─ supabase/
│  ├─ migrations/                # SQL, one file per change, includes RLS
│  └─ seed.sql                   # realistic demo business + data
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/page.tsx    # landing page "/"
│  │  ├─ (marketing)/pricing/
│  │  ├─ (auth)/login/  (auth)/callback/
│  │  ├─ (app)/layout.tsx        # sidebar shell, requires auth
│  │  ├─ (app)/dashboard/
│  │  ├─ (app)/quotes/  quotes/new/  quotes/[id]/
│  │  ├─ (app)/invoices/  invoices/[id]/
│  │  ├─ (app)/customers/  customers/[id]/
│  │  ├─ (app)/price-book/
│  │  ├─ (app)/settings/
│  │  ├─ (app)/onboarding/
│  │  ├─ q/[token]/page.tsx      # public quote page
│  │  ├─ i/[token]/page.tsx      # public invoice page
│  │  └─ api/
│  │     ├─ ai/draft-quote/route.ts
│  │     ├─ pdf/quote/[id]/route.ts  pdf/invoice/[id]/route.ts
│  │     ├─ webhooks/paddle/route.ts
│  │     └─ cron/reminders/route.ts
│  ├─ components/ui/             # shadcn primitives
│  ├─ components/{dashboard,quotes,invoices,customers,public,shell,marketing}/
│  ├─ lib/
│  │  ├─ supabase/{server.ts,client.ts,admin.ts,types.ts}
│  │  ├─ money.ts                # cents math + formatMoney
│  │  ├─ region.ts               # per-country config + t.quoteWord()
│  │  ├─ tokens.ts               # public token generation
│  │  └─ plans.ts                # plan limits
│  ├─ server/
│  │  ├─ actions/                # server actions per feature
│  │  ├─ ai/{draft-quote.ts,schema.ts,prompt.ts}
│  │  ├─ pdf/{QuoteDocument.tsx,InvoiceDocument.tsx}
│  │  ├─ email/{templates/*,send.ts}
│  │  └─ reminders.ts
│  └─ tests/
└─ .env.example
```

## 3. Environment variables (`.env.example`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only
GEMINI_API_KEY=                     # server only
RESEND_API_KEY=                     # server only
EMAIL_FROM=quotes@mail.tradeslip.com
PADDLE_API_KEY=                     # server only
PADDLE_WEBHOOK_SECRET=              # server only
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=                        # protects /api/cron/*
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
```

## 4. Data model (Postgres)
All money in **integer cents**. All tables have `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at timestamptz default now()`.

**businesses**
`owner_id uuid → auth.users unique`, `name`, `trade`, `logo_path`, `phone`, `email`, `address_line1`, `city`, `region`, `postcode`, `country text check in ('US','UK','AU')`, `currency text`, `timezone text`, `tax_enabled bool`, `tax_label text`, `tax_rate_bps int` (basis points, 2000 = 20%), `tax_number text` (VAT/ABN/EIN), `default_hourly_rate_cents int`, `callout_fee_cents int`, `payment_terms_days int default 14`, `quote_validity_days int default 30`, `payment_link_url text`, `quote_prefix text default ''`, `invoice_prefix text default 'INV-'`, `next_quote_number int default 1001`, `next_invoice_number int default 1001`, `reminders_enabled bool default true`, `quote_followup_template text`, `invoice_reminder_template text`, `plan text default 'trial' check in ('trial','free','pro','business')`, `trial_ends_at timestamptz`, `paddle_customer_id`, `paddle_subscription_id`, `onboarded_at timestamptz`.

**customers**
`business_id → businesses`, `name`, `email`, `phone`, `address_line1`, `city`, `region`, `postcode`, `notes`. Index `(business_id, name)`.

**price_items**
`business_id`, `name`, `type check in ('labour','material','fee')`, `unit check in ('job','hour','item','m2','m','day')`, `rate_cents int`, `markup_bps int default 0`, `archived bool default false`.

**quotes**
`business_id`, `customer_id → customers`, `number int`, `title`, `status check in ('draft','sent','viewed','accepted','declined','expired')`, `notes`, `terms`, `valid_until date`, `deposit_enabled bool`, `deposit_bps int default 3000`, `include_photos bool`, `subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `tax_rate_bps` (snapshot), `public_token text unique`, `voice_note_path`, `transcript`, `sent_at`, `viewed_at`, `accepted_at`, `accepted_name`, `accepted_ip`, `accepted_user_agent`, `declined_at`, `decline_reason`, `followup_count int default 0`, `last_followup_at`, `scheduled_for timestamptz`. Unique `(business_id, number)`.

**quote_items**
`quote_id → quotes on delete cascade`, `position int`, `description`, `type`, `qty numeric(10,2)`, `unit_rate_cents int`, `amount_cents int`, `price_item_id → price_items null`, `needs_price bool default false`.

**invoices**
`business_id`, `customer_id`, `quote_id → quotes null`, `number int`, `status check in ('draft','sent','viewed','paid','void')` (overdue is **derived**: `status in ('sent','viewed') and due_date < today`), `issue_date date`, `due_date date`, `notes`, `subtotal_cents`, `tax_cents`, `total_cents`, `amount_paid_cents int default 0`, `currency`, `tax_rate_bps`, `public_token unique`, `sent_at`, `viewed_at`, `paid_at`, `payment_method`, `reminder_count int default 0`, `last_reminder_at`. Unique `(business_id, number)`.

**invoice_items** — same shape as quote_items with `invoice_id`.

**job_photos**
`business_id`, `quote_id null`, `invoice_id null`, `storage_path`, `kind check in ('before','after','other')`, `position int`.

**activity**
`business_id`, `entity_type check in ('quote','invoice','customer')`, `entity_id uuid`, `event text` (e.g. `quote.sent`, `quote.viewed`, `quote.accepted`, `invoice.reminder_sent`, `invoice.paid`), `meta jsonb`. Index `(business_id, created_at desc)`. Powers "Recent activity" and audit trail.

**usage_counters**
`business_id`, `period text` ('2026-10'), `quotes_sent int`, `ai_drafts int`. Unique `(business_id, period)`.

### Number allocation
Postgres function `next_doc_number(business_id, kind)` that does `update businesses set next_quote_number = next_quote_number + 1 ... returning` inside the insert transaction — never compute numbers in JS (race conditions).

### Views / functions
- `dashboard_stats(business_id)` → owed_cents, awaiting_count, awaiting_value_cents, paid_this_month_cents, paid_last_month_cents, overdue_count, overdue_cents.
- `monthly_invoice_totals(business_id, months int)` → for chart.

## 5. Security
- **RLS on every table.** Helper SQL function `auth_business_id()` returns the business id owned by `auth.uid()`. Policies: `using (business_id = auth_business_id())` and same `with check`. `businesses` policy: `owner_id = auth.uid()`.
- **Public pages** (`/q/[token]`, `/i/[token]`): server components call functions in `src/server/public.ts` that use the **service-role client** (`lib/supabase/admin.ts`, imported with `server-only`) and select **only** whitelisted columns by `public_token`. Never return ids, business owner email, or other customers.
- `public_token`: 24 random bytes, base64url (≥ 32 chars). Regenerate option in UI.
- Accept/decline endpoints: server actions keyed by token, rate-limited (simple per-IP limit in a `rate_limits` table or Upstash later), idempotent.
- **Storage buckets**: `logos` (public read), `voice-notes` (private), `job-photos` (private; served via short-lived signed URLs, including on public pages when `include_photos` is on).
- Validate every server action input with zod. Check plan limits server-side (`lib/plans.ts`).
- Cron routes require `Authorization: Bearer ${CRON_SECRET}`.
- Paddle webhook: verify signature before touching data.
- No card data ever touches our servers. Tradesperson payments go through *their* payment links.
- Account deletion: delete business row (cascade) + storage objects + auth user.

## 6. AI voice-drafting pipeline
1. **Record** in browser with `MediaRecorder` (webm/opus; fallback mp4 on Safari). Max 120s. Show timer + waveform.
2. **Upload** to `voice-notes/{business_id}/{uuid}.webm` via signed upload URL.
3. **POST `/api/ai/draft-quote`** with `{ voiceNotePath }`. Server:
   - checks auth + plan + monthly `ai_drafts` limit,
   - downloads audio, loads business settings + active price_items (id, name, type, unit, rate),
   - calls Gemini Flash with audio + system prompt + price book JSON, requesting **structured JSON output** matching the schema below,
   - validates with zod; on failure retries once, then returns transcript-only so the user can fill manually.
4. **Post-processing (deterministic, in code, not AI):**
   - For each item with `price_item_id`, overwrite `unit_rate_cents` with the price-book rate (AI cannot change known prices).
   - Items with no id and no spoken price → `needs_price = true`, rate 0.
   - Materials with markup → apply `markup_bps`.
   - Compute amounts and totals with `lib/money.ts`.
   - Customer match: same business, case-insensitive name + (phone or postcode) → existing `customer_id`.
5. Return draft to the builder; nothing is saved until the user clicks Save/Send.

**Output schema (zod):**
```ts
{
  transcript: string,
  customer: { name: string|null, phone: string|null, email: string|null,
              address_line1: string|null, city: string|null, region: string|null, postcode: string|null },
  job_title: string,
  items: Array<{ description: string, type: 'labour'|'material'|'fee',
                 qty: number, unit_rate_cents: number|null,
                 price_item_id: string|null }>,
  notes: string|null
}
```
**Prompt rules:** use the provided price book; prefer matching items; never invent prices for unmatched items unless the speaker said a price; convert spoken money to cents; keep descriptions short and professional in the business's English variant (US/UK/AU spelling); add the call-out fee only if mentioned or if the business has `callout_fee_cents > 0` and the job is a visit.

Cost guard: log tokens per call; cap free/trial at 10 AI drafts/month, Pro at 300.

## 7. PDFs
`@react-pdf/renderer` documents in `src/server/pdf/`, using Inter TTF bundled in `/public/fonts`. Same structure as the public page. Generated on demand at `/api/pdf/quote/[id]` (auth) and `/q/[token]/pdf` (public). Cache not needed in V1.

## 8. Emails (Resend)
Templates: quote sent to customer, quote viewed/accepted/declined (to owner), invoice sent, invoice reminder 1 & 2, quote follow-up, trial ending, welcome. From: `"{Business Name} via Tradeslip" <quotes@mail.tradeslip.com>`, reply-to = business email. Requires verified sending domain (SPF/DKIM).

## 9. Scheduled jobs
Vercel Cron hits `/api/cron/reminders` hourly (or Supabase pg_cron + edge function). Job:
1. Expire quotes past `valid_until` → `expired`.
2. Quote follow-ups: status sent/viewed, `sent_at` ≥ 3 days, `followup_count = 0`, reminders enabled, plan allows → send, increment, log activity.
3. Invoice reminders: unpaid, `due_date + 1 day` passed and `reminder_count = 0` → reminder 1; `due_date + 7` and `reminder_count = 1` → reminder 2.
4. Respect business timezone: only send between 8am–6pm local.
Idempotent: every step guarded by counters/timestamps.

## 10. Billing (Paddle)
- Products: Pro monthly, Pro yearly, Business monthly.
- Paddle.js overlay checkout from `/settings/billing` and pricing page, passing `business_id` as custom data.
- Webhook `/api/webhooks/paddle`: on `subscription.created/updated/canceled` → update `businesses.plan`, `paddle_*` ids.
- Trial: 14 days Pro on signup (`trial_ends_at`), then `free` if no subscription.

## 11. Performance targets
Public quote page < 1.5s LCP on 4G (server component, no client JS except accept modal). Dashboard < 2s. AI draft < 10s p90.

## 12. Mobile (V1.1)
Separate Expo repo using Supabase JS directly with the same RLS. Shares zod schemas by copying `src/server/ai/schema.ts` and `lib/money.ts` (or extract to a package later). Android first; iOS via EAS Build later.
