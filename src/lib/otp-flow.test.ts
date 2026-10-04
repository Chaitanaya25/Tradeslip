import { describe, expect, it } from "vitest";
import { decideIssue, decideUnverifiedAccept, decideVerifiedAccept, type AcceptContext } from "./otp-flow";

const open: AcceptContext = { status: "sent", lapsed: false, hasEmail: true, nameOk: true };
const good = { code: { expired: false, attempts: 0, matches: true } };

describe("decideVerifiedAccept", () => {
  it("accepts with the right, fresh code", () => {
    expect(decideVerifiedAccept(open, good)).toEqual({ result: "ok" });
    expect(decideVerifiedAccept({ ...open, status: "viewed" }, good)).toEqual({ result: "ok" });
  });
  it("counts wrong codes and locks on the fifth", () => {
    const wrong = (attempts: number) => decideVerifiedAccept(open, { code: { expired: false, attempts, matches: false } });
    expect(wrong(0)).toEqual({ result: "wrong_code", attemptsLeft: 4 });
    expect(wrong(3)).toEqual({ result: "wrong_code", attemptsLeft: 1 });
    expect(wrong(4)).toEqual({ result: "locked" });
  });
  it("stays locked even with the right code once 5 attempts are used", () => {
    expect(decideVerifiedAccept(open, { code: { expired: false, attempts: 5, matches: true } })).toEqual({ result: "locked" });
  });
  it("refuses expired, used or missing codes", () => {
    expect(decideVerifiedAccept(open, { code: { expired: true, attempts: 0, matches: true } })).toEqual({ result: "expired_code" });
    expect(decideVerifiedAccept(open, { code: null })).toEqual({ result: "expired_code" });
  });
  it("is idempotent after acceptance and respects the quote's state", () => {
    expect(decideVerifiedAccept({ ...open, status: "accepted" }, good)).toEqual({ result: "already_accepted" });
    expect(decideVerifiedAccept({ ...open, status: "declined" }, good)).toEqual({ result: "not_allowed" });
    expect(decideVerifiedAccept({ ...open, status: "expired" }, good)).toEqual({ result: "expired" });
    expect(decideVerifiedAccept({ ...open, lapsed: true }, good)).toEqual({ result: "expired" });
    expect(decideVerifiedAccept({ ...open, status: "draft" }, good)).toEqual({ result: "not_found" });
    expect(decideVerifiedAccept({ ...open, nameOk: false }, good)).toEqual({ result: "invalid" });
  });
});

describe("decideUnverifiedAccept", () => {
  it("is refused whenever the customer has an email, so the code cannot be bypassed", () => {
    expect(decideUnverifiedAccept(open)).toBe("not_allowed");
  });
  it("works for customers with no email, and stays idempotent", () => {
    expect(decideUnverifiedAccept({ ...open, hasEmail: false })).toBe("ok");
    expect(decideUnverifiedAccept({ ...open, hasEmail: false, status: "accepted" })).toBe("already_accepted");
    expect(decideUnverifiedAccept({ ...open, hasEmail: false, nameOk: false })).toBe("invalid");
    expect(decideUnverifiedAccept({ ...open, hasEmail: false, status: "declined" })).toBe("not_allowed");
    expect(decideUnverifiedAccept({ ...open, hasEmail: false, lapsed: true })).toBe("expired");
  });
});

describe("decideIssue", () => {
  const base = { status: "sent" as const, lapsed: false, hasEmail: true, secondsSinceLastCode: null, codesInLastHour: 0 };
  it("issues a first code", () => {
    expect(decideIssue(base)).toBe("ok");
  });
  it("enforces a 60 second cooldown", () => {
    expect(decideIssue({ ...base, secondsSinceLastCode: 30, codesInLastHour: 1 })).toBe("cooldown");
    expect(decideIssue({ ...base, secondsSinceLastCode: 61, codesInLastHour: 1 })).toBe("ok");
  });
  it("allows at most 3 codes an hour", () => {
    expect(decideIssue({ ...base, secondsSinceLastCode: 120, codesInLastHour: 2 })).toBe("ok");
    expect(decideIssue({ ...base, secondsSinceLastCode: 120, codesInLastHour: 3 })).toBe("too_many");
  });
  it("needs an open quote with an email on file", () => {
    expect(decideIssue({ ...base, hasEmail: false })).toBe("not_allowed");
    expect(decideIssue({ ...base, status: "accepted" })).toBe("not_allowed");
    expect(decideIssue({ ...base, lapsed: true })).toBe("not_allowed");
    expect(decideIssue({ ...base, status: "draft" })).toBe("not_found");
  });
});
