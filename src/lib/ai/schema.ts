import { z } from "zod";

/**
 * Shape of what the model returns for one voice note (ARCHITECTURE.md §6).
 * The model is untrusted: parsing is strict about structure but tolerant about
 * sloppy values (numbers as strings, missing arrays, stray whitespace).
 */

export const AI_ITEM_TYPES = ["labour", "material", "fee"] as const;
export const MIN_QTY = 0.01;
export const MAX_QTY = 1000;

/** Trimmed string; anything that is not a string (or blank) becomes null. */
const nullableText = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}, z.string().nullable());

const text = () => z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string());

/** Whole cents. Numeric strings are coerced; junk, negatives and non-finite become null. */
const cents = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v.replace(/[,\s$£€]/g, "")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}, z.number().int().nullable());

const qty = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.round(n * 100) / 100));
}, z.number());

const itemType = z.preprocess((v) => {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (AI_ITEM_TYPES as readonly string[]).includes(t) ? t : "labour";
}, z.enum(AI_ITEM_TYPES));

const aiItemSchema = z.object({
  description: text(),
  type: itemType,
  qty,
  unit_rate_cents: cents,
  price_item_id: nullableText,
});

const aiCustomerSchema = z.object({
  name: nullableText,
  phone: nullableText,
  email: nullableText,
  address_line1: nullableText,
  city: nullableText,
  region: nullableText,
  postcode: nullableText,
});

export const aiOutputSchema = z.object({
  transcript: text(),
  customer: z.preprocess((v) => (v && typeof v === "object" ? v : {}), aiCustomerSchema),
  job_title: text(),
  items: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(aiItemSchema)),
  notes: nullableText,
});

export type AiOutput = z.output<typeof aiOutputSchema>;
export type AiItem = AiOutput["items"][number];

export type ParseResult = { ok: true; data: AiOutput } | { ok: false; reason: "empty" | "not_json" | "invalid" };

/** Parse the model's text: tolerates ```json fences and surrounding chatter. */
export function parseAiJson(raw: string | null | undefined): ParseResult {
  const body = (raw ?? "").trim();
  if (!body) return { ok: false, reason: "empty" };

  const unfenced = body.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let value: unknown;
  try {
    value = JSON.parse(unfenced);
  } catch {
    // Last resort: the outermost {...} in case the model added words around it.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false, reason: "not_json" };
    try {
      value = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return { ok: false, reason: "not_json" };
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "invalid" };
  const parsed = aiOutputSchema.safeParse(value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "invalid" };
}

/** Best effort: pull just the transcript out of broken output, for the manual-entry fallback. */
export function salvageTranscript(raw: string | null | undefined): string {
  const m = /"transcript"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw ?? "");
  if (!m) return "";
  try {
    return String(JSON.parse(`"${m[1]}"`)).trim();
  } catch {
    return m[1].trim();
  }
}

/** JSON Schema sent to Gemini as the structured-output contract. */
export const AI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    customer: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        address_line1: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        region: { type: ["string", "null"] },
        postcode: { type: ["string", "null"] },
      },
    },
    job_title: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          type: { type: "string", enum: [...AI_ITEM_TYPES] },
          qty: { type: "number" },
          unit_rate_cents: { type: ["integer", "null"] },
          price_item_id: { type: ["string", "null"] },
        },
        required: ["description", "type", "qty"],
      },
    },
    notes: { type: ["string", "null"] },
  },
  required: ["transcript", "customer", "job_title", "items"],
} as const;
