import { describe, expect, it } from "vitest";
import { formatScheduleTime, isReasonableScheduleDate, isScheduledToday, scheduleInputSchema, utcToZonedParts, zonedToUtc } from "./schedule";

describe("zonedToUtc", () => {
  it("converts a wall time in the business timezone to UTC", () => {
    expect(zonedToUtc("2026-10-14", "09:30", "America/New_York").toISOString()).toBe("2026-10-14T13:30:00.000Z"); // EDT, UTC-4
    expect(zonedToUtc("2026-12-14", "09:30", "America/New_York").toISOString()).toBe("2026-12-14T14:30:00.000Z"); // EST, UTC-5
    expect(zonedToUtc("2026-10-14", "09:30", "Europe/London").toISOString()).toBe("2026-10-14T08:30:00.000Z"); // BST
    expect(zonedToUtc("2026-10-14", "09:30", "Australia/Sydney").toISOString()).toBe("2026-10-13T22:30:00.000Z"); // AEDT, UTC+11
    expect(zonedToUtc("2026-10-14", "09:30", "UTC").toISOString()).toBe("2026-10-14T09:30:00.000Z");
  });
  it("is correct on either side of a DST change", () => {
    // US clocks go forward on 8 March 2026 at 02:00.
    expect(zonedToUtc("2026-03-08", "01:30", "America/New_York").toISOString()).toBe("2026-03-08T06:30:00.000Z"); // EST
    expect(zonedToUtc("2026-03-08", "03:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z"); // EDT
    // and back on 1 November.
    expect(zonedToUtc("2026-11-01", "00:30", "America/New_York").toISOString()).toBe("2026-11-01T04:30:00.000Z"); // EDT
    expect(zonedToUtc("2026-11-01", "03:30", "America/New_York").toISOString()).toBe("2026-11-01T08:30:00.000Z"); // EST
  });
});

describe("round trip and display", () => {
  it("utcToZonedParts undoes zonedToUtc", () => {
    for (const tz of ["America/New_York", "Europe/London", "Australia/Sydney", "Pacific/Auckland"]) {
      const utc = zonedToUtc("2026-10-14", "17:45", tz);
      expect(utcToZonedParts(utc, tz)).toEqual({ date: "2026-10-14", time: "17:45" });
    }
  });
  it("formats the time per region", () => {
    expect(formatScheduleTime("2026-10-14T13:30:00Z", "America/New_York", "en-US")).toMatch(/9:30\s?AM/i);
    expect(formatScheduleTime("2026-10-14T08:30:00Z", "Europe/London", "en-GB")).toMatch(/^0?9:30$/);
  });
  it("knows whether a job is today in the business timezone", () => {
    expect(isScheduledToday("2026-10-14T13:30:00Z", "2026-10-14", "America/New_York")).toBe(true);
    expect(isScheduledToday("2026-10-14T13:30:00Z", "2026-10-15", "America/New_York")).toBe(false);
    // 23:30 UTC on the 14th is already the 15th in Sydney.
    expect(isScheduledToday("2026-10-14T23:30:00Z", "2026-10-15", "Australia/Sydney")).toBe(true);
    expect(isScheduledToday(null, "2026-10-14", "UTC")).toBe(false);
  });
});

describe("scheduleInputSchema and range", () => {
  it("accepts a real date and 24-hour time", () => {
    expect(scheduleInputSchema.safeParse({ date: "2026-10-14", time: "09:30" }).success).toBe(true);
    expect(scheduleInputSchema.safeParse({ date: "2026-10-14", time: " 23:59 " }).success).toBe(true);
  });
  it("rejects bad dates and times", () => {
    for (const bad of [{ date: "", time: "09:30" }, { date: "2026-02-30", time: "09:30" }, { date: "2026-10-14", time: "9:30" }, { date: "2026-10-14", time: "24:00" }, { date: "2026-10-14", time: "09:60" }, { date: "2026-10-14", time: "" }]) {
      expect(scheduleInputSchema.safeParse(bad).success).toBe(false);
    }
  });
  it("limits the date to a year back and two years ahead", () => {
    expect(isReasonableScheduleDate("2026-10-14", "2026-10-14")).toBe(true);
    expect(isReasonableScheduleDate("2025-10-14", "2026-10-14")).toBe(true);
    expect(isReasonableScheduleDate("2025-10-13", "2026-10-14")).toBe(false);
    expect(isReasonableScheduleDate("2028-10-13", "2026-10-14")).toBe(true);
    expect(isReasonableScheduleDate("2028-11-01", "2026-10-14")).toBe(false);
  });
});
