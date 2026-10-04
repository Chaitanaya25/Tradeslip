import { describe, expect, it } from "vitest";
import { canEdit, canMarkPaid, canSend, canVoid, getInvoiceSendProblems, hasPublicLink, shouldRecordInvoiceView } from "./invoice-send";

const item = { description: "Fit tap", unit_rate_cents: 9500 };
const customer = { name: "Sarah", email: "s@example.com", phone: null };
const dates = { issueDate: "2026-06-01", dueDate: "2026-06-15" };

describe("getInvoiceSendProblems", () => {
  it("is empty when ready", () => {
    expect(getInvoiceSendProblems([item], customer, dates)).toEqual([]);
  });
  it("needs an item, priced and described", () => {
    expect(getInvoiceSendProblems([], customer, dates)).toContain("Add at least one item.");
    expect(getInvoiceSendProblems([{ description: " ", unit_rate_cents: 100 }], customer, dates)).toContain("1 item needs a description.");
    expect(getInvoiceSendProblems([{ description: "x", unit_rate_cents: 0 }], customer, dates)).toContain("1 item needs a price.");
    expect(getInvoiceSendProblems([{ description: "x", unit_rate_cents: 500, needs_price: true }], customer, dates)).toEqual(["1 item needs a price."]);
  });
  it("needs a customer name and a way to reach them", () => {
    expect(getInvoiceSendProblems([item], { name: "", email: "a@b.co", phone: null }, dates)).toContain("Add the customer's name.");
    expect(getInvoiceSendProblems([item], { name: "S", email: null, phone: null }, dates).length).toBe(1);
    expect(getInvoiceSendProblems([item], { name: "S", email: null, phone: "+1 413 555 0182" }, dates)).toEqual([]);
  });
  it("rejects a due date before the issue date", () => {
    expect(getInvoiceSendProblems([item], customer, { issueDate: "2026-06-10", dueDate: "2026-06-09" })).toEqual([
      "The due date can't be before the issue date.",
    ]);
    expect(getInvoiceSendProblems([item], customer, { issueDate: "2026-06-10", dueDate: "2026-06-10" })).toEqual([]);
    expect(getInvoiceSendProblems([item], customer, { issueDate: "2026-06-10", dueDate: null })).toEqual(["Choose a due date."]);
  });
});

describe("state rules", () => {
  it("canSend: draft first send, sent/viewed resend, never paid or void", () => {
    expect(["draft", "sent", "viewed"].every((s) => canSend(s as never))).toBe(true);
    expect(canSend("paid")).toBe(false);
    expect(canSend("void")).toBe(false);
  });
  it("canMarkPaid needs a sent invoice with a balance", () => {
    expect(canMarkPaid("sent", 100)).toBe(true);
    expect(canMarkPaid("viewed", 100)).toBe(true);
    expect(canMarkPaid("sent", 0)).toBe(false);
    expect(canMarkPaid("draft", 100)).toBe(false);
    expect(canMarkPaid("void", 100)).toBe(false);
    expect(canMarkPaid("paid", 0)).toBe(false);
  });
  it("canVoid only with nothing paid", () => {
    expect(canVoid("draft", 0)).toBe(true);
    expect(canVoid("sent", 0)).toBe(true);
    expect(canVoid("sent", 100)).toBe(false);
    expect(canVoid("paid", 0)).toBe(false);
    expect(canVoid("void", 0)).toBe(false);
  });
  it("canEdit is drafts only; links exist once sent", () => {
    expect(canEdit("draft")).toBe(true);
    expect(canEdit("sent")).toBe(false);
    expect(hasPublicLink("draft")).toBe(false);
    expect(hasPublicLink("void")).toBe(false);
    expect(hasPublicLink("sent")).toBe(true);
  });
  it("view only counts the first time on a sent invoice", () => {
    expect(shouldRecordInvoiceView("sent", null)).toBe(true);
    expect(shouldRecordInvoiceView("sent", "2026-06-01T00:00:00Z")).toBe(false);
    expect(shouldRecordInvoiceView("viewed", null)).toBe(false);
  });
});
