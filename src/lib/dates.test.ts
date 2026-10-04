import { describe, expect, it } from "vitest";
import { formatDateOnly, formatDateTime, formatShortDate } from "./dates";

describe("date formatting", () => {
  it("formats date-only values per locale without timezone drift", () => {
    expect(formatDateOnly("2026-10-28", "en-GB")).toBe("28 Oct 2026");
    expect(formatDateOnly("2026-10-28", "en-US")).toBe("Oct 28, 2026");
    expect(formatDateOnly("2026-01-01", "en-AU")).toBe("1 Jan 2026");
    expect(formatDateOnly(null, "en-US")).toBe("");
  });
  it("formats timestamps in the business timezone", () => {
    expect(formatShortDate("2026-10-14T03:30:00Z", "en-US", "America/New_York")).toBe("Oct 13");
    expect(formatShortDate("2026-10-14T03:30:00Z", "en-GB", "Europe/London")).toBe("14 Oct");
    expect(formatShortDate(undefined, "en-US", "UTC")).toBe("");
  });
  it("includes the time for activity entries", () => {
    expect(formatDateTime("2026-10-14T13:30:00Z", "en-US", "America/New_York")).toMatch(/Oct 14.*9:30\s?AM/);
  });
});
