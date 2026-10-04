# Supabase — Tradeslip

All schema lives in plain SQL files. You do not need Docker or `supabase start`.

## Files

| File | What it does |
|---|---|
| `migrations/001_core.sql` | Helpers, `businesses`, `customers`, `price_items`, `auth_business_id()`, RLS |
| `migrations/002_documents.sql` | `quotes`, `quote_items`, `invoices`, `invoice_items`, `job_photos`, `activity`, `usage_counters`, `rate_limits`, RLS |
| `migrations/003_functions.sql` | `next_doc_number`, `dashboard_stats`, `monthly_invoice_totals` |
| `migrations/004_storage.sql` | Buckets `logos` / `voice-notes` / `job-photos` and path policies |
| `migrations/005_save_quote.sql` | `save_quote`: saves a draft quote and its items in one transaction |
| `migrations/006_voice_and_limits.sql` | `save_quote` stores voice note + transcript; atomic AI-draft and rate-limit counters (service role only) |
| `migrations/007_public_quotes.sql` | Customer link functions: `get_public_quote`, view / accept / decline, free-plan send counter (service role only) |
| `seed.sql` | `seed_demo_data(owner uuid)` — demo business "Miller Plumbing" |

Run them **in this order: 001, 002, 003, 004, 005, 006, 007, then seed.sql.** Each file is safe to run twice.

## Option A — SQL editor (simplest)

1. Open your project in the Supabase dashboard and go to **SQL Editor**.
2. For each file in order, paste the whole file into a new query and press **Run**.
3. Check **Table Editor**: you should see all 11 tables with the "RLS enabled" badge.

If `004_storage.sql` fails with "must be owner of table objects", create the buckets in
**Storage** and the policies in **Storage > Policies** using the same expressions
(`(storage.foldername(name))[1] = (select public.auth_business_id())::text`).

## Option B — Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`db push` applies everything in `migrations/` that has not run yet. It does not run `seed.sql`;
paste that one into the SQL editor (it only installs functions).

## Auth settings (needed for magic-link login)

Dashboard > **Authentication > URL Configuration**:

- Site URL: `http://localhost:3000` (use your real domain in production)
- Redirect URLs: add `http://localhost:3000/auth/callback`

Google sign-in is optional. To use it, enable the Google provider in Authentication > Providers,
then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`.

## Demo data

1. Run `seed.sql` once (it only creates functions).
2. Sign up in the app at `/login`. You land on the placeholder `/onboarding` page.
3. In the SQL editor run (use the email you signed up with):

```sql
select public.seed_demo_data(id) from auth.users where email = 'you@example.com';
```

4. Reload the app. You now go to `/dashboard`.

The function does nothing if that user already has a business. To start over, delete the row in
`businesses` for that user (everything else cascades) and call it again.

## Types

`src/lib/supabase/types.ts` is hand-written to match these migrations. To regenerate it from your
live database:

```bash
npx supabase login
# set SUPABASE_PROJECT_ID in .env.local, then:
pnpm db:types
```

(Equivalent to `supabase gen types typescript --project-id <id>`.) Helper aliases live in
`src/lib/supabase/tables.ts`, so regenerating does not remove them.

## RLS tests

`src/tests/rls.test.ts` creates two real users and checks that user A cannot read or change
user B's businesses, customers, quotes or quote items. It creates and deletes users and rows.

**Use a separate throwaway Supabase project for this. Never point it at your main project.**

1. Create a new empty Supabase project.
2. Run migrations 001–007 on it.
3. Create `.env.test.local` in the repo root:

```
TEST_SUPABASE_URL=https://<throwaway-ref>.supabase.co
TEST_SUPABASE_ANON_KEY=...
TEST_SUPABASE_SERVICE_ROLE_KEY=...
```

4. Run `pnpm test`. Without these variables the RLS tests are skipped with a message, and the
   suite refuses to run if `TEST_SUPABASE_URL` equals `NEXT_PUBLIC_SUPABASE_URL`.

## Voice notes

Recordings are stored in the private `voice-notes` bucket at `{business_id}/{uuid}.{ext}`. A voice note is
deleted when its draft quote is deleted. Re-recording on the same draft leaves the previous file behind, and
an abandoned recording (never saved to a quote) stays too. **Future task:** a scheduled cleanup of voice notes
older than 30 days that no quote references.
