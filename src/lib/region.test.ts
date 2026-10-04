import { describe, expect, it } from "vitest";
import { REGIONS, getRegion, quoteWord, t, type Country } from "./region";

describe("region config (PRD §6)", () => {
  it("US", () => {
    const r = getRegion("US");
    expect(r.currency).toBe("USD");
    expect(r.documentWord).toBe("Estimate");
    expect(r.taxLabel).toBe("Sales tax");
    expect(r.defaultTaxBps).toBe(0);
    expect(r.businessIdLabel).toBe("EIN (optional)");
    expect(r.dateFormat).toBe("MM/DD/YYYY");
    expect(r.shortDateFormat).toBe("MMM D");
    expect(r.address.regionLabel).toBe("State");
    expect(r.address.postcodeLabel).toBe("ZIP code");
    expect(r.address.regionRequired).toBe(true);
  });

  it("UK", () => {
    const r = getRegion("UK");
    expect(r.currency).toBe("GBP");
    expect(r.documentWord).toBe("Quote");
    expect(r.taxLabel).toBe("VAT");
    expect(r.defaultTaxBps).toBe(2000);
    expect(r.businessIdLabel).toBe("VAT number");
    expect(r.dateFormat).toBe("DD/MM/YYYY");
    expect(r.shortDateFormat).toBe("D MMM");
    expect(r.address.regionLabel).toBe("County (optional)");
    expect(r.address.postcodeLabel).toBe("Postcode");
    expect(r.address.regionRequired).toBe(false);
  });

  it("AU", () => {
    const r = getRegion("AU");
    expect(r.currency).toBe("AUD");
    expect(r.documentWord).toBe("Quote");
    expect(r.taxLabel).toBe("GST");
    expect(r.defaultTaxBps).toBe(1000);
    expect(r.businessIdLabel).toBe("ABN");
    expect(r.dateFormat).toBe("DD/MM/YYYY");
    expect(r.address.regionLabel).toBe("State");
    expect(r.address.postcodeLabel).toBe("Postcode");
  });

  it("tax is never on by default for any country", () => {
    for (const c of Object.keys(REGIONS) as Country[]) {
      expect(REGIONS[c].taxOnByDefault).toBe(false);
    }
  });
});

describe("quoteWord", () => {
  it("says Estimate in the US and Quote in UK/AU", () => {
    expect(quoteWord("US")).toBe("Estimate");
    expect(quoteWord("UK")).toBe("Quote");
    expect(quoteWord("AU")).toBe("Quote");
  });
  it("is exposed on t and has a lowercase form", () => {
    expect(t.quoteWord("US")).toBe("Estimate");
    expect(t.quoteWordLower("US")).toBe("estimate");
    expect(t.quoteWordLower("UK")).toBe("quote");
    expect(t.taxLabel("AU")).toBe("GST");
  });
});
