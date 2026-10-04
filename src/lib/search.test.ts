import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, digitsOf, escapeLike, isSearchable, normaliseQuery, rankResults, scoreMatch, tokensOf, type SearchRow } from "./search";

describe("normaliseQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normaliseQuery("  sarah    thompson \n")).toBe("sarah thompson");
  });
  it("strips control characters", () => {
    expect(normaliseQuery("sa\u0000rah\u0007")).toBe("sa rah");
  });
  it("handles empty, non-string and whitespace-only input", () => {
    expect(normaliseQuery("")).toBe("");
    expect(normaliseQuery("   ")).toBe("");
    expect(normaliseQuery(null)).toBe("");
    expect(normaliseQuery(undefined)).toBe("");
    expect(normaliseQuery(42)).toBe("");
  });
  it("caps very long input", () => {
    expect(normaliseQuery("a".repeat(5000))).toHaveLength(MAX_QUERY_LENGTH);
  });
  it("keeps unicode and odd characters", () => {
    expect(normaliseQuery("O'Connor & Söns")).toBe("O'Connor & Söns");
  });
});

describe("isSearchable", () => {
  it("needs 2 characters", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" a ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
    expect(isSearchable("")).toBe(false);
  });
});

describe("tokensOf", () => {
  it("lower-cases, splits and caps at five words", () => {
    expect(tokensOf("Sarah  Thompson")).toEqual(["sarah", "thompson"]);
    expect(tokensOf("a b c d e f g")).toHaveLength(5);
    expect(tokensOf("")).toEqual([]);
  });
});

describe("escapeLike", () => {
  it("escapes % _ and backslash so they match literally", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\x")).toBe("c:\\\\x");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("digitsOf", () => {
  it("keeps only digits", () => {
    expect(digitsOf("(413) 555-0182")).toBe("4135550182");
    expect(digitsOf("abc")).toBe("");
  });
});

describe("scoreMatch and rankResults", () => {
  it("scores exact > prefix > word start > contains, plus a number bonus", () => {
    expect(scoreMatch("sarah", { title: "Sarah", number: null })).toBe(100);
    expect(scoreMatch("sar", { title: "Sarah Thompson", number: null })).toBe(80);
    expect(scoreMatch("thom", { title: "Sarah Thompson", number: null })).toBe(60);
    expect(scoreMatch("ara", { title: "Sarah Thompson", number: null })).toBe(30);
    expect(scoreMatch("1047", { title: "Kitchen tap", number: 1047 })).toBe(50);
    expect(scoreMatch("#1047", { title: "Kitchen tap", number: 1047 })).toBe(50);
  });
  it("groups by kind, best first, capped", () => {
    const rows: SearchRow[] = [
      { kind: "invoice", id: "i1", title: "A", subtitle: null, number: 1, rank: 30 },
      { kind: "customer", id: "c1", title: "Zed", subtitle: null, number: null, rank: 30 },
      { kind: "customer", id: "c2", title: "Amy", subtitle: null, number: null, rank: 80 },
      { kind: "customer", id: "c3", title: "Bob", subtitle: null, number: null, rank: 80 },
      { kind: "quote", id: "q1", title: "Q", subtitle: null, number: 2, rank: 60 },
    ];
    const grouped = rankResults(rows, 2);
    expect(grouped.customer.map((r) => r.id)).toEqual(["c2", "c3"]);
    expect(grouped.quote.map((r) => r.id)).toEqual(["q1"]);
    expect(grouped.invoice.map((r) => r.id)).toEqual(["i1"]);
  });
});
