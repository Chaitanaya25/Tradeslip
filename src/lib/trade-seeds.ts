import { multiplyQtyByRateCents } from "./money";
import type { Country } from "./region";

export const TRADES = [
  "Plumber",
  "Electrician",
  "Handyman",
  "Painter",
  "Cleaner",
  "Gardener",
  "HVAC",
  "Carpenter",
  "Other",
] as const;
export type Trade = (typeof TRADES)[number];

export type PriceItemType = "labour" | "material" | "fee";
export type PriceItemUnit = "job" | "hour" | "item" | "m2" | "m" | "day";

export type PriceItemSeed = {
  name: string;
  type: PriceItemType;
  unit: PriceItemUnit;
  rate_cents: number;
  markup_bps: number;
};

/**
 * How a starter item is priced:
 *  - hours:   a multiple of the user's own hourly rate
 *  - fixed:   a USD amount, scaled to the user's currency (approximate, editable)
 *  - callout: the user's call-out fee, or a scaled USD fallback if they left it blank
 */
type RateSpec = { hours: number } | { fixed: number } | { callout: number };

type SeedSpec = {
  name: string;
  type: PriceItemType;
  unit: PriceItemUnit;
  rate: RateSpec;
  markup_bps?: number;
};

// Rough purchasing-power scale so a "$65 call-out" does not become "£65" or "A$65" unchanged.
const CURRENCY_SCALE: Record<Country, number> = { US: 1, UK: 0.8, AU: 1.5 };

const HOURLY: SeedSpec = { name: "Hourly labour", type: "labour", unit: "hour", rate: { hours: 1 } };
const CALLOUT = (fallback: number): SeedSpec => ({
  name: "Call-out fee",
  type: "fee",
  unit: "job",
  rate: { callout: fallback },
});

function specsFor(trade: Trade, metre: string): SeedSpec[] {
  switch (trade) {
    case "Plumber":
      return [
        HOURLY,
        CALLOUT(65),
        { name: "Tap replacement — labour", type: "labour", unit: "job", rate: { hours: 1.5 } },
        { name: "Unblock drain — labour", type: "labour", unit: "job", rate: { hours: 2 } },
        { name: `Copper pipe, per ${metre}`, type: "material", unit: "m", rate: { fixed: 12 }, markup_bps: 2000 },
      ];
    case "Electrician":
      return [
        HOURLY,
        CALLOUT(75),
        { name: "Socket or switch replacement", type: "labour", unit: "job", rate: { hours: 1 } },
        { name: "Light fitting installation", type: "labour", unit: "job", rate: { hours: 1.5 } },
        { name: `Cable, per ${metre}`, type: "material", unit: "m", rate: { fixed: 4 }, markup_bps: 2500 },
      ];
    case "Handyman":
      return [
        HOURLY,
        CALLOUT(50),
        { name: "Flat-pack assembly", type: "labour", unit: "job", rate: { hours: 1.5 } },
        { name: "Door or hinge repair", type: "labour", unit: "job", rate: { hours: 1 } },
        { name: "Fixings and sundries", type: "material", unit: "item", rate: { fixed: 15 }, markup_bps: 2500 },
      ];
    case "Painter":
      return [
        HOURLY,
        { name: "Interior wall painting", type: "labour", unit: "m2", rate: { fixed: 9 } },
        { name: "Ceiling painting", type: "labour", unit: "m2", rate: { fixed: 11 } },
        { name: "Preparation and masking", type: "labour", unit: "job", rate: { hours: 3 } },
        { name: "Paint, per litre", type: "material", unit: "item", rate: { fixed: 22 }, markup_bps: 2000 },
      ];
    case "Cleaner":
      return [
        HOURLY,
        { name: "Standard clean", type: "labour", unit: "job", rate: { hours: 3 } },
        { name: "Deep clean", type: "labour", unit: "job", rate: { hours: 6 } },
        { name: "Oven clean", type: "labour", unit: "job", rate: { fixed: 70 } },
        { name: "Cleaning supplies", type: "material", unit: "item", rate: { fixed: 15 } },
      ];
    case "Gardener":
      return [
        HOURLY,
        { name: "Lawn mowing", type: "labour", unit: "job", rate: { hours: 1 } },
        { name: "Hedge trimming", type: "labour", unit: "job", rate: { hours: 2 } },
        { name: "Garden waste removal", type: "fee", unit: "job", rate: { fixed: 60 } },
        { name: "Mulch or topsoil, per bag", type: "material", unit: "item", rate: { fixed: 9 }, markup_bps: 2000 },
      ];
    case "HVAC":
      return [
        HOURLY,
        CALLOUT(85),
        { name: "System service", type: "labour", unit: "job", rate: { hours: 2 } },
        { name: "Filter replacement — labour", type: "labour", unit: "job", rate: { hours: 0.5 } },
        { name: "Filters and consumables", type: "material", unit: "item", rate: { fixed: 25 }, markup_bps: 3000 },
      ];
    case "Carpenter":
      return [
        HOURLY,
        CALLOUT(50),
        { name: "Door fitting", type: "labour", unit: "job", rate: { hours: 2 } },
        { name: "Shelving installation", type: "labour", unit: "job", rate: { hours: 1 } },
        { name: `Timber, per ${metre}`, type: "material", unit: "m", rate: { fixed: 8 }, markup_bps: 2000 },
      ];
    case "Other":
      return [
        HOURLY,
        CALLOUT(50),
        { name: "Day rate", type: "labour", unit: "day", rate: { hours: 8 } },
        { name: "Small job minimum", type: "labour", unit: "job", rate: { hours: 1 } },
        { name: "Materials, per item", type: "material", unit: "item", rate: { fixed: 25 }, markup_bps: 2000 },
      ];
  }
}

function scaledFixedCents(usd: number, country: Country): number {
  return Math.max(1, Math.round(usd * CURRENCY_SCALE[country])) * 100;
}

/** Exactly five starter price-book items for a trade, priced from the user's own rates. */
export function tradeSeedItems(input: {
  trade: string;
  country: Country;
  hourlyRateCents: number;
  calloutFeeCents: number;
}): PriceItemSeed[] {
  const trade = (TRADES as readonly string[]).includes(input.trade) ? (input.trade as Trade) : "Other";
  const metre = input.country === "US" ? "meter" : "metre";

  return specsFor(trade, metre).map((spec) => {
    let rate_cents: number;
    if ("hours" in spec.rate) {
      rate_cents = multiplyQtyByRateCents(spec.rate.hours, input.hourlyRateCents);
    } else if ("callout" in spec.rate) {
      rate_cents =
        input.calloutFeeCents > 0 ? input.calloutFeeCents : scaledFixedCents(spec.rate.callout, input.country);
    } else {
      rate_cents = scaledFixedCents(spec.rate.fixed, input.country);
    }
    return { name: spec.name, type: spec.type, unit: spec.unit, rate_cents, markup_bps: spec.markup_bps ?? 0 };
  });
}
