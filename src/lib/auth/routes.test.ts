import { describe, expect, it } from "vitest";
import { isPublicPath } from "./routes";

describe("isPublicPath", () => {
  it.each([
    "/",
    "/login",
    "/pricing",
    "/auth/callback",
    "/q/abc123",
    "/q/abc123/pdf",
    "/i/abc123",
    "/api/cron/reminders",
    "/api/webhooks/paddle",
    "/login/",
  ])("allows %s", (path) => {
    expect(isPublicPath(path, true)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/onboarding",
    "/quotes",
    "/quotes/new",
    "/quotes/123",
    "/invoices",
    "/customers",
    "/price-book",
    "/settings",
    "/settings/billing",
    "/api/ai/draft-quote",
    "/api/pdf/quote/123",
    "/q",
    "/quotes/q/abc",
    "/authx",
    "/login-help",
    "/api/cronjob",
  ])("protects %s", (path) => {
    expect(isPublicPath(path, true)).toBe(false);
  });

  it("only exposes /dev outside production", () => {
    expect(isPublicPath("/dev/ui", false)).toBe(true);
    expect(isPublicPath("/dev/ui", true)).toBe(false);
  });
});
