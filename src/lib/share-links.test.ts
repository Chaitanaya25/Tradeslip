import { describe, expect, it } from "vitest";
import { buildPublicUrl, buildShareMessage, mailtoLink, normalizePhoneDigits, smsLink, whatsappLink } from "./share-links";

describe("buildPublicUrl", () => {
  it("joins the app url and token without double slashes", () => {
    expect(buildPublicUrl("http://localhost:3000", "abc")).toBe("http://localhost:3000/q/abc");
    expect(buildPublicUrl("https://app.tradeslip.com/", "abc")).toBe("https://app.tradeslip.com/q/abc");
  });
});

describe("normalizePhoneDigits", () => {
  it.each([
    ["(413) 555-0182", "US", "14135550182"],
    ["413-555-0182", "US", "14135550182"],
    ["1 413 555 0182", "US", "14135550182"],
    ["+1 (413) 555-0182", "US", "14135550182"],
    ["07911 123456", "UK", "447911123456"],
    ["+44 7911 123456", "UK", "447911123456"],
    ["0044 7911 123456", "UK", "447911123456"],
    ["0412 345 678", "AU", "61412345678"],
    ["+61 412 345 678", "AU", "61412345678"],
    ["61412345678", "AU", "61412345678"],
  ] as const)("%s (%s) -> %s", (input, country, expected) => {
    expect(normalizePhoneDigits(input, country)).toBe(expected);
  });
  it.each([null, undefined, "", "   ", "12345", "abc", "555-0182"])("returns null for %j", (input) => {
    expect(normalizePhoneDigits(input, "US")).toBeNull();
  });
  it("does not guess a country code for a number that does not fit", () => {
    expect(normalizePhoneDigits("4135550182999", "US")).toBeNull();
  });
});

describe("share message and links", () => {
  const message = buildShareMessage({ customerName: "Sarah Thompson", quoteWord: "Estimate", businessName: "Miller Plumbing", link: "https://x.test/q/abc?x=1&y=2" });

  it("greets by first name", () => {
    expect(message).toBe("Hi Sarah, here is your Estimate from Miller Plumbing: https://x.test/q/abc?x=1&y=2");
    expect(buildShareMessage({ customerName: null, quoteWord: "Quote", businessName: "B", link: "L" })).toBe("Hi, here is your Quote from B: L");
  });
  it("encodes the message for sms and WhatsApp", () => {
    const sms = smsLink("14135550182", message)!;
    expect(sms.startsWith("sms:+14135550182?&body=")).toBe(true);
    expect(sms).toContain("Hi%20Sarah%2C");
    expect(sms).toContain(encodeURIComponent("https://x.test/q/abc?x=1&y=2"));
    expect(sms).not.toContain(" ");
    const wa = whatsappLink("14135550182", message)!;
    expect(wa.startsWith("https://wa.me/14135550182?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("?text=")[1])).toBe(message);
  });
  it("returns null without a phone", () => {
    expect(smsLink(null, message)).toBeNull();
    expect(whatsappLink(null, message)).toBeNull();
  });
  it("builds a mailto link or null", () => {
    expect(mailtoLink("a@b.co", "Hi & bye", "Line 1\nLine 2")).toBe("mailto:a@b.co?subject=Hi%20%26%20bye&body=Line%201%0ALine%202");
    expect(mailtoLink(" ", "s", "b")).toBeNull();
    expect(mailtoLink(null, "s", "b")).toBeNull();
  });
});
