import { describe, expect, it } from "vitest";
import {
  canAccept,
  canDecline,
  canSend,
  decideAccept,
  decideDecline,
  effectiveStatus,
  getSendProblems,
  isExpired,
  shouldRecordView,
} from "./quote-send";

const item = (o: Partial<{ description: string; unit_rate_cents: number; needs_price: boolean }> = {}) => ({
  description: "Fix tap",
  unit_rate_cents: 6500,
  needs_price: false,
  ...o,
});
const customer = { name: "Sarah Thompson", email: "sarah@example.com", phone: null };

describe("getSendProblems", () => {
  it("is empty for a complete quote", () => {
    expect(getSendProblems([item()], customer)).toEqual([]);
  });
  it("accepts a phone instead of an email", () => {
    expect(getSendProblems([item()], { name: "Tom", email: null, phone: "(413) 555-0182" })).toEqual([]);
  });
  it("needs at least one item", () => {
    expect(getSendProblems([], customer)).toEqual(["Add at least one item."]);
  });
  it("counts unpriced items (zero rate or flagged)", () => {
    expect(getSendProblems([item({ unit_rate_cents: 0 }), item({ needs_price: true }), item()], customer)).toEqual(["2 items need a price."]);
    expect(getSendProblems([item({ unit_rate_cents: 0 })], customer)).toEqual(["1 item needs a price."]);
  });
  it("flags missing descriptions separately", () => {
    expect(getSendProblems([item({ description: "  " }), item()], customer)).toEqual(["1 item needs a description."]);
  });
  it("needs a customer name and a way to reach them", () => {
    expect(getSendProblems([item()], null)).toEqual(["Add the customer's name.", "Add a customer email or phone number so they can be sent the link."]);
    expect(getSendProblems([item()], { name: "Sarah", email: " ", phone: "" })).toEqual(["Add a customer email or phone number so they can be sent the link."]);
  });
  it("rejects a valid-until date in the past when dates are supplied", () => {
    expect(getSendProblems([item()], customer, { validUntil: "2026-10-01", today: "2026-10-04" })).toEqual([
      "The valid-until date has already passed. Choose a later date.",
    ]);
    expect(getSendProblems([item()], customer, { validUntil: "2026-10-04", today: "2026-10-04" })).toEqual([]);
    expect(getSendProblems([item()], customer, { validUntil: null, today: "2026-10-04" })).toEqual([]);
  });
  it("lists every problem at once", () => {
    expect(getSendProblems([], { name: "", email: null, phone: null })).toHaveLength(3);
  });
});

describe("statuses and dates", () => {
  it("canSend only for draft, sent and viewed", () => {
    expect(canSend("draft")).toBe(true);
    expect(canSend("sent")).toBe(true);
    expect(canSend("viewed")).toBe(true);
    for (const s of ["accepted", "declined", "expired"] as const) expect(canSend(s)).toBe(false);
  });
  it("a quote is valid through its last day", () => {
    expect(isExpired("2026-10-28", "2026-10-28")).toBe(false);
    expect(isExpired("2026-10-28", "2026-10-29")).toBe(true);
    expect(isExpired(null, "2030-01-01")).toBe(false);
  });
  it("canAccept / canDecline need an open, unexpired quote", () => {
    for (const f of [canAccept, canDecline]) {
      expect(f("sent", "2026-11-01", "2026-10-04")).toBe(true);
      expect(f("viewed", null, "2026-10-04")).toBe(true);
      expect(f("sent", "2026-10-01", "2026-10-04")).toBe(false);
      expect(f("draft", null, "2026-10-04")).toBe(false);
      expect(f("accepted", null, "2026-10-04")).toBe(false);
      expect(f("declined", null, "2026-10-04")).toBe(false);
    }
  });
  it("effectiveStatus turns lapsed open quotes into expired", () => {
    expect(effectiveStatus("sent", "2026-10-01", "2026-10-04")).toBe("expired");
    expect(effectiveStatus("viewed", "2026-10-01", "2026-10-04")).toBe("expired");
    expect(effectiveStatus("accepted", "2026-10-01", "2026-10-04")).toBe("accepted");
    expect(effectiveStatus("sent", "2026-12-01", "2026-10-04")).toBe("sent");
  });
});

describe("state machine edge cases", () => {
  const today = "2026-10-04";
  it("accept: ok once, then already_accepted", () => {
    expect(decideAccept("sent", "2026-11-01", today)).toBe("ok");
    expect(decideAccept("viewed", null, today)).toBe("ok");
    expect(decideAccept("accepted", "2026-11-01", today)).toBe("already_accepted");
  });
  it("accept after decline is not allowed", () => {
    expect(decideAccept("declined", "2026-11-01", today)).toBe("not_allowed");
  });
  it("accept after expiry is refused", () => {
    expect(decideAccept("sent", "2026-10-01", today)).toBe("expired");
    expect(decideAccept("expired", null, today)).toBe("expired");
  });
  it("drafts cannot be accepted or declined", () => {
    expect(decideAccept("draft", null, today)).toBe("not_allowed");
    expect(decideDecline("draft", null, today)).toBe("not_allowed");
  });
  it("decline: ok once, then already_declined; not after accept", () => {
    expect(decideDecline("sent", null, today)).toBe("ok");
    expect(decideDecline("declined", null, today)).toBe("already_declined");
    expect(decideDecline("accepted", null, today)).toBe("not_allowed");
    expect(decideDecline("sent", "2026-10-01", today)).toBe("expired");
  });
  it("a view only counts the first time and only while sent", () => {
    expect(shouldRecordView("sent", null)).toBe(true);
    expect(shouldRecordView("sent", "2026-10-04T10:00:00Z")).toBe(false);
    expect(shouldRecordView("viewed", null)).toBe(false);
    expect(shouldRecordView("accepted", null)).toBe(false);
    expect(shouldRecordView("draft", null)).toBe(false);
  });
});
