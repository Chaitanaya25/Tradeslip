import { describe, expect, it } from "vitest";
import { EMAIL_DELIVERED, EMAIL_MESSAGES, mapResendError } from "./email-errors";

describe("mapResendError", () => {
  it("recognises an unverified sending domain (testing-only sender)", () => {
    expect(
      mapResendError({
        name: "validation_error",
        statusCode: 403,
        message: "You can only send testing emails to your own email address (me@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.",
      }),
    ).toBe("unverified_domain");
    expect(mapResendError({ name: "validation_error", statusCode: 403, message: "The mail.tradeslip.com domain is not verified." })).toBe("unverified_domain");
  });
  it("maps missing and invalid keys to not_configured", () => {
    expect(mapResendError({ name: "missing_api_key", statusCode: 401, message: "Missing API key" })).toBe("not_configured");
    expect(mapResendError({ name: "invalid_api_key", statusCode: 403, message: "API key is invalid" })).toBe("not_configured");
    expect(mapResendError({ statusCode: 401, message: "Unauthorized" })).toBe("not_configured");
  });
  it("maps rate limits", () => {
    expect(mapResendError({ name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" })).toBe("rate_limited");
    expect(mapResendError({ statusCode: 429, message: "x" })).toBe("rate_limited");
  });
  it("maps bad recipient addresses", () => {
    expect(mapResendError({ name: "invalid_to_address", statusCode: 422, message: "Invalid `to` field." })).toBe("invalid_address");
    expect(mapResendError({ name: "validation_error", statusCode: 422, message: "Invalid email address" })).toBe("invalid_address");
  });
  it("falls back to a generic failure", () => {
    expect(mapResendError({ name: "application_error", statusCode: 500, message: "Something broke" })).toBe("failed");
    expect(mapResendError(null)).toBe("failed");
    expect(mapResendError(undefined)).toBe("failed");
  });
});

describe("wording", () => {
  it("has a message for every reason, none of them mentioning test mode as the normal case", () => {
    for (const message of Object.values(EMAIL_MESSAGES)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message.toLowerCase()).not.toContain("test mode");
    }
    expect(Object.keys(EMAIL_MESSAGES).sort()).toEqual(["failed", "invalid_address", "not_configured", "rate_limited", "unverified_domain"]);
  });
  it("keeps the delivered line honest about spam folders", () => {
    expect(EMAIL_DELIVERED).toBe("Delivered to the mail server. If the customer can't find it, ask them to check spam.");
  });
});
