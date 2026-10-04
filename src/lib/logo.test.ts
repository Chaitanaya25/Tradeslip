import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, isOwnLogoPath, logoPathFor, validateLogoFile } from "./logo";

const ID = "6f1c2c1e-0000-4000-8000-000000000001";

describe("validateLogoFile", () => {
  it("accepts png, jpg and webp up to 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateLogoFile({ type, size: 1000 })).toBeNull();
    }
    expect(validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES })).toBeNull();
  });
  it("rejects other types, oversize and empty files", () => {
    expect(validateLogoFile({ type: "image/svg+xml", size: 100 })).toMatch(/PNG, JPG or WebP/);
    expect(validateLogoFile({ type: "application/pdf", size: 100 })).toMatch(/PNG, JPG or WebP/);
    expect(validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toMatch(/2 MB/);
    expect(validateLogoFile({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("logo paths", () => {
  it("builds a path under the business folder", () => {
    expect(logoPathFor(ID, "image/jpeg", 1700000000000)).toBe(`${ID}/logo-1700000000000.jpg`);
    expect(logoPathFor(ID, "image/gif")).toBeNull();
  });
  it("only accepts the business's own logo paths", () => {
    expect(isOwnLogoPath(`${ID}/logo-1700000000000.png`, ID)).toBe(true);
    expect(isOwnLogoPath(`other-id/logo-1.png`, ID)).toBe(false);
    expect(isOwnLogoPath(`${ID}/../x/logo-1.png`, ID)).toBe(false);
    expect(isOwnLogoPath(`${ID}/evil.png`, ID)).toBe(false);
    expect(isOwnLogoPath(`${ID}/logo-1.svg`, ID)).toBe(false);
  });
});
