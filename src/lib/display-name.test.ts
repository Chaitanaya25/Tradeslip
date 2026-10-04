import { describe, expect, it } from "vitest";
import { displayNameFor, initialsFor } from "./display-name";

describe("displayNameFor", () => {
  it("prefers the saved full name", () => {
    expect(displayNameFor({ fullName: "  Dave Miller ", email: "x@y.z" })).toBe("Dave Miller");
  });
  it("prettifies the email local part", () => {
    expect(displayNameFor({ email: "dave.miller@example.com" })).toBe("Dave Miller");
    expect(displayNameFor({ email: "sarah_t+work@example.com" })).toBe("Sarah T");
    expect(displayNameFor({ email: "HYPERTOS@example.com" })).toBe("Hypertos");
  });
  it("falls back when nothing usable", () => {
    expect(displayNameFor({ email: "12345@example.com" })).toBe("Account");
    expect(displayNameFor({})).toBe("Account");
    expect(displayNameFor({ fullName: 42, email: null })).toBe("Account");
  });
});

describe("initialsFor", () => {
  it("uses first and last initial", () => {
    expect(initialsFor("Dave Miller")).toBe("DM");
    expect(initialsFor("dave")).toBe("D");
    expect(initialsFor("Mary Jane Watson")).toBe("MW");
    expect(initialsFor("   ")).toBe("?");
  });
});
