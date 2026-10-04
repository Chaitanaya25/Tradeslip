import { describe, expect, it } from "vitest";
import {
  MAX_MONEY_CENTS,
  formatBpsAsPercent,
  formatCentsForInput,
  parseMoneyToCents,
  parsePercentToBps,
} from "./money-input";

describe("parseMoneyToCents", () => {
  it.each([
    ["95", 9500],
    ["95.5", 9550],
    ["95.50", 9550],
    ["0", 0],
    ["0.05", 5],
    [".5", 50],
    ["19.99", 1999],
    ["$120.00", 12000],
    ["£45", 4500],
    ["1,234.50", 123450],
    ["  75  ", 7500],
    ["A$10", 1000],
  ])("parses %s as %i cents", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it("never goes through floats (0.1 + 0.2 style cases)", () => {
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("1.15")).toBe(115);
    expect(parseMoneyToCents("4.35")).toBe(435);
    expect(parseMoneyToCents("1.005")).toBeNull();
  });

  it.each(["", "   ", "abc", "-5", "12.345", "1.2.3", "12,5x", "--1", "1e3"])("rejects %j", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });

  it("rejects amounts above the cap", () => {
    expect(parseMoneyToCents("10000000.00")).toBe(MAX_MONEY_CENTS);
    expect(parseMoneyToCents("10000000.01")).toBeNull();
    expect(parseMoneyToCents("99999999999999999999")).toBeNull();
  });
});

describe("formatCentsForInput", () => {
  it("formats with two decimals and no grouping", () => {
    expect(formatCentsForInput(9500)).toBe("95.00");
    expect(formatCentsForInput(5)).toBe("0.05");
    expect(formatCentsForInput(0)).toBe("0.00");
    expect(formatCentsForInput(123456)).toBe("1234.56");
  });
  it("round-trips with parseMoneyToCents", () => {
    for (const cents of [0, 1, 99, 100, 1999, 12345, 999999]) {
      expect(parseMoneyToCents(formatCentsForInput(cents))).toBe(cents);
    }
  });
});

describe("percent helpers", () => {
  it("parses percent into basis points", () => {
    expect(parsePercentToBps("8")).toBe(800);
    expect(parsePercentToBps("8.5")).toBe(850);
    expect(parsePercentToBps("20%")).toBe(2000);
    expect(parsePercentToBps("0")).toBe(0);
    expect(parsePercentToBps("7.25")).toBe(725);
  });
  it("rejects bad or out-of-range percentages", () => {
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("-1")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("100.01")).toBeNull();
    expect(parsePercentToBps("5.555")).toBeNull();
    expect(parsePercentToBps("150", 1000)).toBe(15000);
    expect(parsePercentToBps("1001", 1000)).toBeNull();
  });
  it("formats basis points as a percent string", () => {
    expect(formatBpsAsPercent(800)).toBe("8");
    expect(formatBpsAsPercent(850)).toBe("8.5");
    expect(formatBpsAsPercent(725)).toBe("7.25");
    expect(formatBpsAsPercent(2000)).toBe("20");
    expect(formatBpsAsPercent(0)).toBe("0");
    expect(formatBpsAsPercent(5)).toBe("0.05");
  });
});
