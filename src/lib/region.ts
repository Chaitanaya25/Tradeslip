import type { Currency } from "./money";

/** Matches the `country` check constraint in ARCHITECTURE §4: 'US' | 'UK' | 'AU'. */
export type Country = "US" | "UK" | "AU";

export interface RegionConfig {
  country: Country;
  name: string;
  currency: Currency;
  /** BCP 47 locale for number/date formatting. */
  locale: string;
  /** Word for the document: "Estimate" (US) or "Quote" (UK/AU). */
  documentWord: "Estimate" | "Quote";
  taxLabel: "Sales tax" | "VAT" | "GST";
  /** Default tax rate in basis points. US is 0: the user sets their own %. */
  defaultTaxBps: number;
  /** Tax is only on by default once the user says they are registered (UK/AU); never for US. */
  taxOnByDefault: false;
  /** Label for the business tax/ID field. */
  businessIdLabel: string;
  businessIdRequired: boolean;
  /** Numeric display format, e.g. on forms. */
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY";
  /** Short display format: US "Oct 14", UK/AU "14 Oct". */
  shortDateFormat: "MMM D" | "D MMM";
  address: {
    regionLabel: string;
    regionRequired: boolean;
    postcodeLabel: string;
  };
  defaultTimezone: string;
}

export const REGIONS: Record<Country, RegionConfig> = {
  US: {
    country: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    documentWord: "Estimate",
    taxLabel: "Sales tax",
    defaultTaxBps: 0,
    taxOnByDefault: false,
    businessIdLabel: "EIN (optional)",
    businessIdRequired: false,
    dateFormat: "MM/DD/YYYY",
    shortDateFormat: "MMM D",
    address: { regionLabel: "State", regionRequired: true, postcodeLabel: "ZIP code" },
    defaultTimezone: "America/New_York",
  },
  UK: {
    country: "UK",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    documentWord: "Quote",
    taxLabel: "VAT",
    defaultTaxBps: 2000,
    taxOnByDefault: false,
    businessIdLabel: "VAT number",
    businessIdRequired: false,
    dateFormat: "DD/MM/YYYY",
    shortDateFormat: "D MMM",
    address: { regionLabel: "County (optional)", regionRequired: false, postcodeLabel: "Postcode" },
    defaultTimezone: "Europe/London",
  },
  AU: {
    country: "AU",
    name: "Australia",
    currency: "AUD",
    locale: "en-AU",
    documentWord: "Quote",
    taxLabel: "GST",
    defaultTaxBps: 1000,
    taxOnByDefault: false,
    businessIdLabel: "ABN",
    businessIdRequired: false,
    dateFormat: "DD/MM/YYYY",
    shortDateFormat: "D MMM",
    address: { regionLabel: "State", regionRequired: true, postcodeLabel: "Postcode" },
    defaultTimezone: "Australia/Sydney",
  },
};

export function getRegion(country: Country): RegionConfig {
  return REGIONS[country];
}

/** "Estimate" for US, "Quote" for UK/AU. Never hard-code the word in UI copy. */
export function quoteWord(country: Country): "Estimate" | "Quote" {
  return REGIONS[country].documentWord;
}

/** Copy helpers, per CLAUDE.md rule 8 (`t.quoteWord()`). */
export const t = {
  quoteWord,
  /** "estimate" / "quote" for use mid-sentence. */
  quoteWordLower: (country: Country): "estimate" | "quote" =>
    quoteWord(country) === "Estimate" ? "estimate" : "quote",
  taxLabel: (country: Country): RegionConfig["taxLabel"] => REGIONS[country].taxLabel,
};
