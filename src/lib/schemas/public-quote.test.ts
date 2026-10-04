import { describe, expect, it } from "vitest";
import { generatePublicToken } from "@/lib/tokens";
import { acceptInputSchema, declineInputSchema } from "./public-quote";

const token = generatePublicToken();

describe("acceptInputSchema", () => {
  it("accepts a full name with the box ticked and trims it", () => {
    expect(acceptInputSchema.parse({ token, name: "  Sarah Thompson ", confirmed: true }).name).toBe("Sarah Thompson");
  });
  it("rejects names that are too short or too long", () => {
    expect(acceptInputSchema.safeParse({ token, name: "S", confirmed: true }).success).toBe(false);
    expect(acceptInputSchema.safeParse({ token, name: " ", confirmed: true }).success).toBe(false);
    expect(acceptInputSchema.safeParse({ token, name: "a".repeat(101), confirmed: true }).success).toBe(false);
    expect(acceptInputSchema.safeParse({ token, name: "a".repeat(100), confirmed: true }).success).toBe(true);
  });
  it("requires the confirmation to be exactly true", () => {
    for (const confirmed of [false, "true", 1, undefined, null]) {
      expect(acceptInputSchema.safeParse({ token, name: "Sarah Thompson", confirmed }).success).toBe(false);
    }
  });
  it("rejects a malformed token before anything reaches the database", () => {
    for (const bad of ["", "short", "../../x", "a b ".repeat(20)]) {
      expect(acceptInputSchema.safeParse({ token: bad, name: "Sarah Thompson", confirmed: true }).success).toBe(false);
    }
  });
});

describe("declineInputSchema", () => {
  it("makes the reason optional and trims it", () => {
    expect(declineInputSchema.parse({ token }).reason).toBeUndefined();
    expect(declineInputSchema.parse({ token, reason: "  too dear " }).reason).toBe("too dear");
  });
  it("caps the reason at 500 characters", () => {
    expect(declineInputSchema.safeParse({ token, reason: "a".repeat(500) }).success).toBe(true);
    expect(declineInputSchema.safeParse({ token, reason: "a".repeat(501) }).success).toBe(false);
  });
  it("rejects a malformed token", () => {
    expect(declineInputSchema.safeParse({ token: "nope" }).success).toBe(false);
  });
});
