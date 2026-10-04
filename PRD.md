# PRD — Tradeslip

## 1. One-liner
Say the job, send a professional quote in under 60 seconds, and get paid faster.

## 2. Problem
Solo tradespeople lose evenings writing quotes and chasing unpaid invoices. They quote from memory in a van, send a vague text or a Word doc days later, and lose jobs to whoever replied first. Unpaid invoices sit for weeks because chasing customers is awkward.

## 3. Target users
**Primary:** owner-operator tradespeople (1 person, sometimes + 1 helper) in the **US, UK and Australia**: plumbers, electricians, handymen, painters, cleaners, gardeners, HVAC, carpenters.
- Age 25–60, phone-first, not technical, impatient with software.
- Already accept card/bank payments (have Stripe, PayPal, Square or bank transfer).

**Secondary:** the homeowner who receives the quote link. They never sign up.

## 4. Goals (V1)
- Quote created and sent in **< 60 seconds** from voice note.
- Customer can view and accept a quote on mobile **without an account**.
- Quote → invoice in **one tap**.
- Unpaid quotes and invoices are **chased automatically**.
- Convert free users to paid at $19/mo.

## 5. Success metrics
- Activation: % of signups who send their first quote within 24h (target 40%).
- Time from voice note to sent quote (target median < 90s).
- Quote acceptance rate tracked per user.
- Free → paid conversion (target 4–6%).
- Monthly churn on paid (target < 5%).

## 6. Regional rules
| Setting | US | UK | AU |
|---|---|---|---|
| Document word | Estimate | Quote | Quote |
| Currency | USD | GBP | AUD |
| Tax label | Sales tax | VAT | GST |
| Default tax | off, user sets % | 20% if VAT registered | 10% if GST registered |
| Business ID field | — (optional EIN) | VAT number | ABN |
| Date format | MM/DD/YYYY display "Oct 14" | DD/MM/YYYY "14 Oct" | DD/MM/YYYY "14 Oct" |
| Address | State + ZIP | County (optional) + Postcode | State + Postcode |

## 7. Features — V1 (MVP)

### F1. Auth & onboarding
- Sign up with email magic link or Google.
- Onboarding wizard (≤ 2 min, 3 steps):
  1. Business: name, trade (select), country, phone, email, logo upload (optional).
  2. Pricing defaults: hourly rate, call-out fee, tax registered toggle + rate, payment terms (7/14/30 days), quote validity (14/30 days).
  3. Payment link: paste Stripe/PayPal/Square payment link (optional, can skip).
- Seed the price book with 5 common items for the chosen trade (editable).

**Acceptance:** a new user can reach the dashboard in under 2 minutes; country selection sets currency, tax label and document word everywhere.

### F2. Price book
- CRUD items: name, type (labour / material / fee), unit (job, hour, item, m²), rate, optional markup % for materials.
- Search, archive.
**Acceptance:** items appear in quote builder autocomplete and are used by AI drafting.

### F3. Voice → quote (core)
- Big mic button on dashboard and quote builder. Hold-to-record or tap-to-start/stop. Max 2 minutes.
- Audio uploaded; AI returns: customer (name, address, phone, email if spoken), job title, line items (description, qty, unit rate, type, matched price item id or null), notes.
- Items matching the price book use the price-book rate. Unmatched items with a spoken price use that price. Unmatched items with no price are inserted with rate 0 and highlighted "Needs price".
- Transcript shown on the left panel (see `design/references/02-quote-builder.png`) with "Drafted from your price book".
- If the customer already exists (name + address/phone match), link to existing customer; else create a new one on save.
- Manual entry is always possible without voice.
**Acceptance:** a 20-second voice note produces an editable draft in < 10s; no AI-invented rate replaces an existing price-book rate; every field remains editable.

### F4. Quotes
- Fields: number (auto, per-business sequence, e.g. 1047), customer, job title, line items (drag to reorder), notes, valid-until date, deposit % toggle (default 30% when on), include job photos toggle.
- Totals: subtotal, tax, total. Tax applied per business setting.
- Statuses: `draft → sent → viewed → accepted | declined | expired`.
- Actions: Save draft, Preview PDF, Send to customer, Duplicate, Delete draft.
- PDF: business logo/name, contact, customer, items, totals, deposit, notes, terms, valid until.
**Acceptance:** totals are always correct to the cent (unit tested); expired status is set automatically after `valid_until`.

### F5. Sending
- "Send to customer" opens a sheet with: copy link, send email (via Resend, from "Business Name via Tradeslip"), share via SMS/WhatsApp (uses `sms:`/`https://wa.me/` deep links with prefilled text + link).
- Marks quote `sent`, stores `sent_at`.

### F6. Public customer quote page `/q/[token]`
- Mobile-first, matches `design/references/03-customer-quote-mobile.png`.
- Shows business header, customer, address, items, totals, deposit box, notes, buttons: **Accept**, **Ask a question**, **Decline**.
- First view sets status `viewed` and `viewed_at` (only first time, ignore the owner's own visits when logged in).
- Accept: modal asks for full name + checkbox "I accept this estimate and its terms". Stores `accepted_name`, `accepted_at`, IP, user agent. Shows confirmation and, if deposit + payment link exist, a "Pay deposit" button linking to the business's payment link.
- Ask a question: opens `mailto:`/`sms:` to the business.
- Decline: optional reason, sets `declined`.
- Owner notified by email (and later push) on view, accept, decline.
- Footer "Sent with Tradeslip" (hidden on paid plans).
**Acceptance:** works without login, loads in < 1.5s on 4G, no internal IDs exposed.

### F7. Invoices
- Create from accepted quote (one tap, copies items) or from scratch.
- Number sequence separate from quotes (e.g. INV-1024).
- Due date = issue date + payment terms.
- Statuses: `draft → sent → viewed → paid`; `overdue` derived when past due and unpaid.
- Mark paid: method (cash, card, bank transfer, other), date, amount (supports partial: shows remaining).
- Public invoice page `/i/[token]` mirrors the quote page with "Pay now" (business payment link) instead of Accept.
- PDF invoice.

### F8. Automatic reminders
- Quote follow-up: if `sent`/`viewed` and not accepted after 3 days → one polite email to customer.
- Invoice: on due date +1 day → reminder; +7 days → second reminder. Max 2.
- Per-business toggle and editable message templates.
- Every reminder logged in activity.
**Acceptance:** reminders never send for paid/accepted/declined items and never more than the configured count.

### F9. Customers
- List with search; detail page with contact buttons and history (quotes, invoices, total paid).

### F10. Job photos
- Upload multiple photos to a quote (before/after tag). Optional inclusion in PDF and public page.
- Images compressed client-side to max 1600px.

### F11. Dashboard
Matches `design/references/01-dashboard.png`:
- Greeting + date, search, **New Quote** button, mic button.
- Stat cards: Owed to you, Awaiting reply, Paid this month (with % vs last month), Overdue.
- Recent activity table, Needs attention list (overdue invoices, quotes expiring tomorrow, quotes with no reply after 3 days), Invoices bar chart (paid vs outstanding, last 6 months), Quick actions, Today's schedule (V1: shows accepted jobs with a scheduled date if set; otherwise hide the card).

### F12. Billing & plans
| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 3 sent quotes / month, "Sent with Tradeslip" footer, no automatic reminders |
| Pro | $19/mo or $169/yr | Unlimited quotes, voice drafting, reminders, no footer |
| Business | $39/mo | Pro + deposits tracking, recurring invoices, profit per job, review requests (V1.1 features) |
- Web billing via Paddle (merchant of record). 14-day Pro trial on signup, no card.
- Limit enforcement server-side.

### F13. Settings
Business profile, logo, regional settings, tax, numbering prefixes, payment link, reminder settings + templates, plan & billing, export all data (CSV), delete account.

## 8. V1.1 (after first paying users)
Deposits tracking, recurring invoices, expenses per job / profit per job, simple calendar scheduling with customer reminder, Google review request after payment, trade-specific quote templates, Android app (Expo).

## 9. V2
Stripe Connect in-app card payments, QuickBooks/Xero export, team members, reports.

## 10. Out of scope (do not build)
GPS technician tracking, inventory, payroll, full CRM pipelines, customer accounts/app, chat between customer and business, marketplace.

## 11. Copy & tone
Plain, friendly, trade-appropriate. "Owed to you", not "Accounts receivable". No AI hype words ("magic", "supercharge"). Errors say what to do next.
