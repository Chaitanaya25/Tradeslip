import type { Country } from "@/lib/region";

/** The price book is sent as compact JSON; cap it so a huge book cannot blow up the prompt. */
export const MAX_PROMPT_ITEMS = 300;

export type PromptBusiness = {
  trade: string | null;
  country: Country;
  currency: string;
  taxLabel: string;
};

export type PromptPriceItem = {
  id: string;
  name: string;
  type: string;
  unit: string;
  rate_cents: number;
};

const ENGLISH: Record<Country, string> = {
  US: "US English (labor, color, meter)",
  UK: "British English (labour, colour, metre)",
  AU: "Australian English (labour, colour, metre)",
};

/** Compact price book: one short object per item, rates in cents. */
export function compactPriceBook(items: readonly PromptPriceItem[]): string {
  return JSON.stringify(
    items.slice(0, MAX_PROMPT_ITEMS).map((i) => ({ id: i.id, n: i.name, t: i.type, u: i.unit, r: i.rate_cents })),
  );
}

/**
 * System prompt for one voice note. The model only proposes a draft; prices of
 * price-book items are overwritten in code afterwards, so the rules here are
 * guidance, not the safety net.
 */
export function buildSystemPrompt(business: PromptBusiness, priceItems: readonly PromptPriceItem[]): string {
  const trade = business.trade?.trim() || "trades";
  return [
    `You turn a spoken job description from a ${trade} business (${business.country}, ${business.currency}) into a draft quote.`,
    "Listen to the audio and return JSON only, matching the schema.",
    "",
    "Rules:",
    "- transcript: what was said, cleaned of filler words (um, uh, you know).",
    "- customer: name, phone, email and address ONLY if spoken. Use null for anything not said.",
    "- job_title: a short title for the job (max 6 words).",
    "- items: one line per piece of work, material or fee. Short professional descriptions.",
    "- Match each item to the price book below by meaning and set price_item_id to its id. Prefer a match over a new item. If nothing fits, price_item_id is null.",
    "- unit_rate_cents: integer cents in " + business.currency + ". For price-book matches use null (the system applies the book price). For anything else use the price the speaker said; if no price was said, use null. Never invent a price.",
    "- Convert spoken money to integer cents (eighty dollars = 8000).",
    "- type is labour, material or fee. qty defaults to 1; hours or counts spoken become qty.",
    "- Add a call-out fee item only if the speaker mentions one.",
    "- notes: anything that is not a line item (access, timing, requests). null if none.",
    `- Write in ${ENGLISH[business.country]}. Tax (${business.taxLabel}) is added by the system: do not add tax lines.`,
    "- If the audio is silent or unintelligible: items = [], and transcript says that nothing could be understood.",
    "",
    "Price book (id, name, type, unit, rate in cents):",
    compactPriceBook(priceItems),
  ].join("\n");
}

export const USER_PROMPT = "Draft the quote from this voice note.";
