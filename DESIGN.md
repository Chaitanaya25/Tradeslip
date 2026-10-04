# DESIGN.md — Tradeslip visual system

References: `design/references/01-dashboard.png`, `02-quote-builder.png`, `03-customer-quote-mobile.png`, `04-landing-page.png`.

The product must look like a calm, trustworthy, shipped SaaS tool a 45-year-old plumber trusts with his money. **Not** AI-generated, not "techy".

## 1. Hard bans
No gradients. No glassmorphism/blur panels. No glowing blobs or 3D illustrations. No purple or neon blue. No emoji in UI. No sparkle/magic-wand AI icons. No heavy drop shadows. No more than one accent colour. No lorem ipsum anywhere, including seed data.

## 2. Colour tokens
Define as CSS variables in `src/app/globals.css` and map in Tailwind theme.

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF9F7` | App background (warm off-white) |
| `--surface` | `#FFFFFF` | Cards, tables, inputs |
| `--surface-muted` | `#F5F4F1` | Table header, transcript box, icon tiles |
| `--border` | `#E7E5E0` | All 1px borders and dividers |
| `--border-strong` | `#D6D3CD` | Input borders, hover borders |
| `--text` | `#1C1917` | Primary text |
| `--text-muted` | `#78716C` | Secondary text, labels |
| `--text-subtle` | `#A8A29E` | Placeholders, disabled |
| `--accent` | `#E8590C` | Primary buttons, key money figures, active nav text, links |
| `--accent-hover` | `#D24E08` | Primary button hover |
| `--accent-soft` | `#FDEDE3` | Active nav background, deposit box, selected row tint |
| `--accent-border` | `#F6C3A3` | Deposit box border, selected row border |

**Status colours** (pills only — soft bg + darker text, no borders):

| Status | Background | Text |
|---|---|---|
| Accepted / Paid | `#E7F6EC` | `#1E7B43` |
| Viewed | `#E6F0FB` | `#2563A8` |
| Sent / Draft | `#F0EFEC` | `#57534E` |
| Awaiting reply | `#FDF3DC` | `#9A6B00` |
| Overdue / Declined | `#FDE8E6` | `#C2361F` |
| Expired | `#F0EFEC` | `#A8A29E` |

Positive delta text (e.g. "↑ 18%"): `#1E7B43`. Destructive actions: `#C2361F`.

Dark mode: **not in V1.**

## 3. Typography
- Font: **Inter** (via `next/font/google`), fallback system-ui.
- Enable `font-variant-numeric: tabular-nums` on all money, quantities, dates and table numbers (`.tabular` utility).

| Style | Size / line-height | Weight | Use |
|---|---|---|---|
| Display | 32/40 | 600 | Page greeting "Morning, Dave", "Estimate #1047" |
| H2 | 20/28 | 600 | Card titles ("Recent activity") |
| Stat value | 30/36 | 600 | Stat card numbers |
| Total | 30/36 | 700 | Quote total (accent colour) |
| Body | 15/22 | 400 | Default text |
| Body strong | 15/22 | 500 | Customer names in tables |
| Small | 13/18 | 400 | Secondary lines, addresses, meta |
| Label | 13/18 | 500 | Form labels, table headers |
| Pill | 13/18 | 500 | Status pills |

Letter-spacing: -0.01em on Display and H2. Never use all caps except tiny overlines (avoid generally).

## 4. Spacing, radius, elevation
- 8px grid. Common gaps: 8, 12, 16, 24, 32.
- Page padding: 32px desktop, 16px mobile.
- Card padding: 24px (stat cards 20px).
- Radius: **8px** cards, inputs, buttons; **6px** pills; **full** avatars and toggles.
- Elevation: cards use 1px `--border` only. Optional `shadow-[0_1px_2px_rgba(28,25,23,0.04)]`. Modals/dropdowns: `0 8px 24px rgba(28,25,23,0.08)`.

## 5. Icons
Lucide React, 1.5px stroke, 20px default (18px in nav, 16px inline). Colour inherits text. Icon tiles (stat cards, needs-attention): 40×40, radius 8, `--surface-muted` bg; red-tinted (`#FDE8E6` bg, `#C2361F` icon) for overdue items.

## 6. Layout — app shell (desktop ≥ 1024px)
- **Sidebar** 240px fixed, bg `--bg`, right border `--border`.
  - Logo top-left: orange outline house/doc mark + "Tradeslip" wordmark 20px/600.
  - Nav items: 44px tall, 12px horizontal padding, icon + label, radius 8. Active: `--accent-soft` bg, `--accent` icon+text, weight 500. Inactive: `--text` at 80%, hover `--surface-muted`.
  - Order: Dashboard, Quotes, Invoices, Customers, Price Book, Settings.
  - Bottom: avatar circle (initials, `--surface-muted`), name 15/500, business name 13 muted, chevron right.
- **Main** area: max-width 1320px, padding 32px.
- **Tablet (768–1023)**: sidebar collapses to 72px icon rail.
- **Mobile (< 768)**: sidebar becomes bottom tab bar (Dashboard, Quotes, mic FAB center in accent, Invoices, More). Cards stack single column.

## 7. Components

**Button**
- Primary: `--accent` bg, white text 15/600, height 44 (40 compact), padding 0 20px, radius 8, optional leading icon. Hover `--accent-hover`.
- Secondary: white bg, `--border-strong` border, `--text`. Hover `--surface-muted`.
- Outline-accent (e.g. "Send reminder"): white bg, 1px `--accent` border, `--accent` text, 13/500, height 36.
- Ghost/link: `--accent` text + trailing arrow ("View all →").
- Icon button: 44×44 square, secondary style (mic button next to New Quote).

**Input / Select**
- Height 44, white bg, 1px `--border-strong`, radius 8, padding 0 12px, 15px text. Focus: 2px ring `--accent` at 25% opacity + border `--accent`. Label above, 13/500 muted, 6px gap.

**Card**: white, 1px border, radius 8, padding 24. Header row: title H2 left, link/action right, 16–20px below header. Table cards have the header separated by a divider and no inner padding on the table.

**Stat card**: icon tile left, then label (15 muted), value (stat value; money figures and the overdue count in `--accent`, other counts like "6 quotes" in `--text`, exactly as in `01-dashboard.png`), sub-line (13 muted; positive delta in green). 4 per row desktop, 2 tablet, 1 mobile (horizontal scroll allowed).

**Table**: header row `--surface-muted`, 13/500 muted, 44px tall. Rows 64px tall with two-line customer cell (name 15/500 + address 13 muted). Row divider `--border`. Hover row `#FCFBF9`. Trailing `…` menu (ghost icon button). Amounts right-aligned, tabular.

**Status pill**: inline-flex, height 26, padding 0 10px, radius 6, colours from §2.

**Toggle switch**: 44×24, on = `--accent`, off = `#D6D3CD`, white knob. Label 15/500 + description 13 muted beneath.

**Line-item editor row** (quote builder): drag handle (6-dot, muted) · description input (flex) · qty input (72px, centered) · rate input (100px, right) · amount text (right, 15/500, tabular) · `…` menu. Hover/selected row: `--accent-soft`-tinted bg with 1px `--accent-border`, radius 8. "+ Add item" accent link with plus icon.

**Totals block**: right-aligned, label/value rows 15px, divider, then "Total" 20/700 label + value 30/700 accent.

**Voice note card**: play button (40px accent circle, white play icon), waveform (bars in `--text` at 70%), duration right. Transcript in `--surface-muted` box, radius 8, italic 15/24 muted with curly quotes. Below: green check-circle + "Drafted from your price book" 15 muted.

**Needs-attention item**: icon tile · text (15/500 line, 13 muted meta "$410 • Invoice #INV-1024") · outline-accent button right.

**Schedule list**: time column 13 muted (72px) · dot timeline (accent dots, grey for past) · job title 15/500 + map-pin address 13 muted.

**Bar chart** (invoices): stacked bars, Paid = `#D6D3CD`, Outstanding = `--accent`. Thin gridlines `--border`. Axis labels 12 muted. Use Recharts with these colours; no animation beyond default.

**Deposit box** (public page): `--accent-soft` bg, 1px `--accent-border`, radius 8, padding 16. Label 15/500, amount 20/700 accent right, sub-line 13 muted.

**Empty states**: one line of plain text + primary action. No illustrations.

## 8. Screen specs
- **Dashboard** — replicate `01-dashboard.png`: header row (greeting/date left; search 320px, New Quote primary with plus, mic icon button right). Row of 4 stat cards. Grid: Recent activity (2/3) + Needs attention (1/3); then Invoices chart (≈1/3) + Quick actions 2×2 (≈1/3) + Today's schedule (1/3, spans down).
- **Quote builder** — replicate `02-quote-builder.png`: back arrow + "New quote" title. Left column 40% (Voice note card, Customer form card). Right column 60% document card: "Estimate #1047" display, "Valid until…" muted, Draft pill + `…` top-right, line items editor, add item, totals, toggles, sticky bottom action bar (Save draft, Preview PDF secondary; Send to customer primary with send icon).
- **Public quote page** — replicate `03-customer-quote-mobile.png`: single column max-width 480px centered on desktop, white page on `--bg`. Header (monogram/logo circle 56px + name 20/600 + "Licensed & insured · phone"), divider, title 24/600 "Estimate for {name}", meta line, job address with pin icon, item list (description left, amount right, dividers), subtotal/tax, Total row (label 24/700, amount 30/700 accent), deposit box, Notes, full-width primary "Accept estimate", secondary "Ask a question", underlined "Decline" link, footer "Sent with **Tradeslip**".
- **Landing page** — replicate `04-landing-page.png` once added.

## 9. Motion
Subtle only: 150ms ease-out on hover colour changes, 200ms for sheet/modal open. Recording state: mic button pulses (opacity) — no bouncing or confetti.

## 10. Accessibility
Contrast AA minimum (accent on white passes for large text/buttons; use `--text` for small body). Focus rings always visible. Hit targets ≥ 44px. Form errors in text, not colour alone.
