import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateOtpCode, hashOtp, maskEmail, resolvePepper } from "./otp";
import { OTP_LENGTH, isValidCode, normalizeCode } from "./otp-format";

describe("generateOtpCode", () => {
  it("is always exactly 6 digits, including leading zeros", () => {
    for (let i = 0; i < 2000; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
    expect(OTP_LENGTH).toBe(6);
  });
  it("looks random: lots of different codes, some starting with 0", () => {
    const codes = Array.from({ length: 3000 }, generateOtpCode);
    expect(new Set(codes).size).toBeGreaterThan(2900);
    expect(codes.some((c) => c.startsWith("0"))).toBe(true);
  });
});

describe("hashOtp", () => {
  it("is deterministic hex sha256 of code + pepper", () => {
    const h = hashOtp("123456", "pepper-pepper-pepper");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp("123456", "pepper-pepper-pepper")).toBe(h);
  });
  it("changes with the code and with the pepper, and never contains the code", () => {
    const h = hashOtp("123456", "pepper-pepper-pepper");
    expect(hashOtp("123457", "pepper-pepper-pepper")).not.toBe(h);
    expect(hashOtp("123456", "other-pepper-other-pepper")).not.toBe(h);
    expect(h).not.toContain("123456");
  });
});

describe("resolvePepper", () => {
  it("uses a configured pepper of 16+ characters", () => {
    expect(resolvePepper({ NODE_ENV: "production", OTP_PEPPER: "a-very-long-random-string" })).toBe("a-very-long-random-string");
  });
  it("refuses in production when missing or too short", () => {
    expect(resolvePepper({ NODE_ENV: "production" })).toBeNull();
    expect(resolvePepper({ NODE_ENV: "production", OTP_PEPPER: "short" })).toBeNull();
    expect(resolvePepper({ NODE_ENV: "production", OTP_PEPPER: "   " })).toBeNull();
  });
  it("falls back to a dev-only value outside production", () => {
    expect(resolvePepper({ NODE_ENV: "development" })).toMatch(/dev-only/);
    expect(resolvePepper({})).toMatch(/dev-only/);
  });
});

describe("maskEmail", () => {
  it.each([
    ["jane.doe@gmail.com", "j***@gmail.com"],
    ["a@b.co", "a***@b.co"],
    ["John@Example.COM", "J***@Example.COM"],
    ["tom+work@mail.example.org", "t***@mail.example.org"],
  ])("masks %s", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });
  it("never leaks the local part and handles garbage", () => {
    expect(maskEmail("jane.doe@gmail.com")).not.toContain("jane");
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
  });
});

describe("code input handling", () => {
  it("normalises spaces and dashes", () => {
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
  });
  it("validates exactly six digits", () => {
    expect(isValidCode("123456")).toBe(true);
    expect(isValidCode("000000")).toBe(true);
    for (const bad of ["12345", "1234567", "12345a", "", "12 3456", "١٢٣٤٥٦"]) expect(isValidCode(bad)).toBe(false);
  });
});
