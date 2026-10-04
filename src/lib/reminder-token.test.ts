import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, resolveUnsubscribeSecret, verifyUnsubscribeToken } from "./reminder-token";

const SECRET = "test-secret-with-enough-length-1234567890";
const BIZ = "11111111-1111-4111-8111-111111111111";

describe("unsubscribe tokens", () => {
  it("round-trips the business and a lower-cased address", () => {
    const token = createUnsubscribeToken(BIZ, " Sarah@Example.COM ", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ businessId: BIZ, email: "sarah@example.com" });
  });
  it("is stable, and different for different addresses or businesses", () => {
    expect(createUnsubscribeToken(BIZ, "a@b.co", SECRET)).toBe(createUnsubscribeToken(BIZ, "A@B.CO", SECRET));
    expect(createUnsubscribeToken(BIZ, "a@b.co", SECRET)).not.toBe(createUnsubscribeToken(BIZ, "c@b.co", SECRET));
    expect(createUnsubscribeToken(BIZ, "a@b.co", SECRET)).not.toBe(createUnsubscribeToken("22222222-2222-4222-8222-222222222222", "a@b.co", SECRET));
  });
  it("is valid whenever it is opened (no expiry)", () => {
    const token = createUnsubscribeToken(BIZ, "a@b.co", SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).not.toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    expect(verifyUnsubscribeToken(createUnsubscribeToken(BIZ, "a@b.co", "another-secret-of-sufficient-length"), SECRET)).toBeNull();
  });
  it("rejects tampering with the payload or the signature", () => {
    const token = createUnsubscribeToken(BIZ, "a@b.co", SECRET);
    const [payload, mac] = token.split(".");
    const otherPayload = Buffer.from(`${BIZ}|victim@x.co`).toString("base64url");
    expect(verifyUnsubscribeToken(`${otherPayload}.${mac}`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.${mac.slice(0, -1)}A`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`.${mac}`, SECRET)).toBeNull();
  });
  it("rejects junk without throwing", () => {
    for (const bad of [undefined, null, 42, "", "abc", "a.b.c", "x".repeat(2000), "has space.sig", "../..", {}]) {
      expect(verifyUnsubscribeToken(bad, SECRET)).toBeNull();
    }
  });
  it("rejects a correctly signed payload that is not a business id and address", () => {
    const payload = Buffer.from("not-a-uuid|a@b.co").toString("base64url");
    const mac = createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 32);
    expect(verifyUnsubscribeToken(`${payload}.${mac}`, SECRET)).toBeNull();
  });
});

describe("resolveUnsubscribeSecret", () => {
  it("uses the configured secret", () => {
    expect(resolveUnsubscribeSecret({ REMINDER_UNSUBSCRIBE_SECRET: SECRET, NODE_ENV: "production" })).toBe(SECRET);
  });
  it("is required in production", () => {
    expect(resolveUnsubscribeSecret({ NODE_ENV: "production" })).toBeNull();
    expect(resolveUnsubscribeSecret({ REMINDER_UNSUBSCRIBE_SECRET: "short", NODE_ENV: "production" })).toBeNull();
  });
  it("falls back to a clearly named dev secret outside production", () => {
    expect(resolveUnsubscribeSecret({ NODE_ENV: "development" })).toContain("dev-only");
  });
});
