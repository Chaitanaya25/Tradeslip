import type { Country } from "@/lib/region";

export type CustomerOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
};

export type PriceItemOption = {
  id: string;
  name: string;
  type: "labour" | "material" | "fee";
  rate_cents: number;
  markup_bps: number;
};

/** Business settings the builder needs (never the full business row). */
export type BuilderConfig = {
  country: Country;
  currency: string;
  locale: string;
  quoteWord: string;
  docPrefix: string;
  timezone: string;
  businessName: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
};
