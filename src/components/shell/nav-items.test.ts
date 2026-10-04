import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActiveNav } from "./nav-items";

describe("isActiveNav", () => {
  it("matches the route and its children", () => {
    expect(isActiveNav("/quotes", "/quotes")).toBe(true);
    expect(isActiveNav("/quotes/new", "/quotes")).toBe(true);
    expect(isActiveNav("/settings/business", "/settings")).toBe(true);
  });
  it("does not match lookalike prefixes", () => {
    expect(isActiveNav("/quotes-archive", "/quotes")).toBe(false);
    expect(isActiveNav("/price-book", "/invoices")).toBe(false);
    expect(isActiveNav("/", "/dashboard")).toBe(false);
  });
  it("lists the six items in design order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Quotes",
      "Invoices",
      "Customers",
      "Price Book",
      "Settings",
    ]);
  });
});
