import { escapeLikePattern } from "./quote-helpers";

/** Input handling and ranking for global search. The SQL (global_search, migration 010) does the matching. */

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;
export const MAX_TOKENS = 5;
export const PER_KIND_LIMIT = 5;

/** Trim, drop control characters, collapse whitespace, cap the length. */
export function normaliseQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, MAX_QUERY_LENGTH).trim();
}

export function isSearchable(query: string): boolean {
  return normaliseQuery(query).length >= MIN_QUERY_LENGTH;
}

/** Lower-case words of the query (max 5); every word has to match something. */
export function tokensOf(query: string): string[] {
  return normaliseQuery(query).toLowerCase().split(" ").filter(Boolean).slice(0, MAX_TOKENS);
}

/** Escape LIKE wildcards so "100%" and "a_b" match literally. */
export function escapeLike(value: string): string {
  return escapeLikePattern(value);
}

/** Only the digits, for matching phone numbers typed as "(413) 555-0182". */
export function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

export type SearchKind = "customer" | "quote" | "invoice";

export type SearchRow = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  number: number | null;
  rank: number;
};

const KIND_ORDER: SearchKind[] = ["customer", "quote", "invoice"];

/**
 * How well a row matches the query: exact name 100, name starts with 80, a word starts with 60,
 * anything else 30, plus 20 when the document number matches exactly.
 */
export function scoreMatch(query: string, row: { title: string; number: number | null; numberLabel?: string }): number {
  const q = normaliseQuery(query).toLowerCase().replace(/^#/, "");
  const title = row.title.toLowerCase();
  let score = 30;
  if (title === q) score = 100;
  else if (title.startsWith(q)) score = 80;
  else if (title.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
  const num = row.number === null ? "" : String(row.number);
  if (q && (num === q || (row.numberLabel ?? "").toLowerCase() === q)) score += 20;
  return score;
}

/** Group results by kind (customers, quotes, invoices), best match first, capped per kind. */
export function rankResults<T extends SearchRow>(rows: readonly T[], limit = PER_KIND_LIMIT): Record<SearchKind, T[]> {
  const grouped: Record<SearchKind, T[]> = { customer: [], quote: [], invoice: [] };
  for (const kind of KIND_ORDER) {
    grouped[kind] = rows
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
      .slice(0, limit);
  }
  return grouped;
}

export { escapeLikePattern };
