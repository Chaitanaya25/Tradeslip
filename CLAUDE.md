# CLAUDE.md — Tradeslip

You are building **Tradeslip**: a voice-first quoting and invoicing web app for solo tradespeople (plumbers, electricians, handymen, cleaners) in the US, UK and Australia. A tradesperson describes a job by voice, gets a professional quote drafted from *their own price book*, sends it as a link, the customer accepts on their phone, the quote becomes an invoice, and automatic reminders chase payment.

## Read these first, in this order
1. `PRD.md` — what we are building and why, with acceptance criteria
2. `DESIGN.md` — the visual system. Follow it exactly.
3. `ARCHITECTURE.md` — stack, data model, security rules, AI pipeline
4. `TASKS.md` — the build plan. Work top to bottom. Tick items off as you finish them.

## Visual references (source of truth for UI)
Located in `design/references/`:
- `01-dashboard.png` → `/dashboard`
- `02-quote-builder.png` → `/quotes/new` and `/quotes/[id]`
- `03-customer-quote-mobile.png` → public page `/q/[token]` (mobile-first)
- `04-landing-page.png` → marketing home page `/`

When building any screen that has a reference image, **open the image and match it**: layout, spacing, hierarchy, colours, copy style. If the image and `DESIGN.md` disagree, `DESIGN.md` wins on tokens (colours, radius, fonts); the image wins on layout. Ignore sample data inconsistencies in the images (e.g. the dashboard mockup shows 2024 dates — use real data).

## Commands
```bash
pnpm install
pnpm dev            # Next.js dev server
pnpm build
pnpm lint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm db:types       # regenerate Supabase TS types into src/lib/supabase/types.ts
supabase start      # local Supabase (Docker)
supabase db reset   # apply migrations + seed
```

## Non-negotiable rules
1. **Money is always integer cents** (`amount_cents`). Never store or compute money as floats. Format only at display time with `formatMoney(cents, currency)`.
2. **Every table has Row Level Security.** Users can only touch rows where `business_id` belongs to them. No exceptions. Write the RLS policy in the same migration as the table.
3. **Secrets stay server-side.** The Supabase service-role key, Gemini key, Resend key and Paddle keys are only used in server code (`server-only` import). Never in client components. Never prefixed `NEXT_PUBLIC_`.
4. **Public quote pages are accessed only by an unguessable `public_token`**, never by database id. They are read through a server function that returns only the fields the customer needs.
5. **The AI never invents prices when a price-book item matches.** AI output is validated with zod. Unmatched items are flagged for the user to price. The user always reviews before sending.
6. **Free plan limits are enforced on the server**, never only in the UI.
7. **Follow `DESIGN.md`.** No gradients, no glassmorphism, no purple, no emoji in UI, no sparkle/magic AI icons, no new colours. Use the tokens.
8. **Region-aware copy:** US says "Estimate", UK/AU say "Quote". Tax label and default rate come from the business settings (Sales tax / VAT / GST). Use the `t.quoteWord()` helper, never hard-code.

## Conventions
- Next.js App Router, TypeScript strict, server components by default; `"use client"` only when needed (forms, recorder, interactive tables).
- Mutations via **server actions** in `src/server/actions/*`. Validate every input with zod.
- DB access via the typed Supabase client in `src/lib/supabase/`.
- UI built on shadcn/ui primitives in `src/components/ui/`, restyled to our tokens. Feature components live in `src/components/<feature>/`.
- File names kebab-case. Components PascalCase. One component per file.
- Dates stored UTC (`timestamptz`). Displayed in the business timezone.
- Keep functions small. No premature abstraction. No new dependency without a one-line reason in the PR/commit message.
- Write a vitest test for every money/tax calculation and every AI-output parser.

## How to work
- Do one `TASKS.md` item at a time. After finishing, run `pnpm typecheck && pnpm lint && pnpm test`, then tick the box.
- For UI tasks, compare your result against the reference image before marking done.
- If something in the docs is ambiguous, choose the simplest option that satisfies the PRD acceptance criteria and note it under "Decisions log" at the bottom of `TASKS.md`.
- Do not build anything listed under "Out of scope" in `PRD.md`.
