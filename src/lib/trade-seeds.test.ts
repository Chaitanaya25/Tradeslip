import { describe, expect, it } from "vitest";
import { TRADES, tradeSeedItems } from "./trade-seeds";
import type { Country } from "./region";

const base = { country: "US" as Country, hourlyRateCents: 9500, calloutFeeCents: 4500 };

describe("tradeSeedItems", () => {
  it.each(TRADES)("gives exactly 5 valid items for %s", (trade) => {
    const items = tradeSeedItems({ ...base, trade });
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.name)).size).toBe(5);
    for (const item of items) {
      expect(["labour", "material", "fee"]).toContain(item.type);
      expect(["job", "hour", "item", "m2", "m", "day"]).toContain(item.unit);
      expect(Number.isInteger(item.rate_cents)).toBe(true);
      expect(item.rate_cents).toBeGreaterThan(0);
      expect(Number.isInteger(item.markup_bps)).toBe(true);
      // Markup only makes sense on materials.
      if (item.type !== "material") expect(item.markup_bps).toBe(0);
    }
  });

  it("uses the user's hourly rate for hourly labour", () => {
    const [hourly] = tradeSeedItems({ ...base, trade: "Plumber", hourlyRateCents: 8250 });
    expect(hourly).toMatchObject({ name: "Hourly labour", unit: "hour", rate_cents: 8250 });
  });

  it("prices job labour as a multiple of the hourly rate with exact cents", () => {
    const items = tradeSeedItems({ ...base, trade: "Plumber", hourlyRateCents: 9500 });
    expect(items.find((i) => i.name === "Tap replacement — labour")?.rate_cents).toBe(14250); // 1.5 h
    expect(items.find((i) => i.name === "Unblock drain — labour")?.rate_cents).toBe(19000); // 2 h
    const odd = tradeSeedItems({ ...base, trade: "HVAC", hourlyRateCents: 9999 });
    expect(odd.find((i) => i.name === "Filter replacement — labour")?.rate_cents).toBe(5000); // 4999.5 -> 5000
  });

  it("uses the user's call-out fee, or a fallback when it is blank", () => {
    const own = tradeSeedItems({ ...base, trade: "Plumber", calloutFeeCents: 7000 });
    expect(own.find((i) => i.name === "Call-out fee")?.rate_cents).toBe(7000);
    const blank = tradeSeedItems({ ...base, trade: "Plumber", calloutFeeCents: 0 });
    expect(blank.find((i) => i.name === "Call-out fee")?.rate_cents).toBe(6500);
  });

  it("scales fixed amounts to the currency in whole units", () => {
    const find = (country: Country) =>
      tradeSeedItems({ ...base, trade: "Plumber", country, calloutFeeCents: 0 }).find(
        (i) => i.name === "Call-out fee",
      )!.rate_cents;
    expect(find("US")).toBe(6500);
    expect(find("UK")).toBe(5200); // 65 x 0.8
    expect(find("AU")).toBe(9800); // 65 x 1.5 = 97.5 -> 98
    for (const country of ["US", "UK", "AU"] as Country[]) {
      for (const item of tradeSeedItems({ ...base, trade: "Painter", country })) {
        if (item.type === "material") expect(item.rate_cents % 100).toBe(0);
      }
    }
  });

  it("uses local spelling for metres", () => {
    expect(tradeSeedItems({ ...base, trade: "Plumber", country: "US" }).at(-1)?.name).toBe("Copper pipe, per meter");
    expect(tradeSeedItems({ ...base, trade: "Plumber", country: "UK" }).at(-1)?.name).toBe("Copper pipe, per metre");
  });

  it("falls back to Other for an unknown trade", () => {
    const items = tradeSeedItems({ ...base, trade: "Astronaut" });
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.name)).toContain("Day rate");
  });
});
