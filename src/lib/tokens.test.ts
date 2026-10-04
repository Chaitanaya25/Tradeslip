import { describe, expect, it } from "vitest";
import { generatePublicToken, isWellFormedToken } from "./tokens";

describe("generatePublicToken", () => {
  it("is at least 32 characters of base64url", () => {
    const t = generatePublicToken();
    expect(t.length).toBeGreaterThanOrEqual(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 2000 }, generatePublicToken));
    expect(tokens.size).toBe(2000);
  });
  it("passes its own shape check", () => {
    expect(isWellFormedToken(generatePublicToken())).toBe(true);
  });
});

describe("isWellFormedToken", () => {
  it("accepts the DB default hex token", () => {
    expect(isWellFormedToken("a".repeat(64))).toBe(true);
  });
  it.each(["", "short", "has space ".repeat(5), "../../etc/passwd", "a".repeat(129), "tok!".repeat(10), null, undefined, 42])(
    "rejects %j",
    (value) => {
      expect(isWellFormedToken(value)).toBe(false);
    },
  );
});
