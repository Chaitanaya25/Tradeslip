import { z } from "zod";
import { parseMoneyToCents, parsePercentToBps } from "@/lib/money-input";

/**
 * Validation toolkit shared by the onboarding, price-book and settings schemas.
 *
 * Forms hold raw strings. Each schema is `z.object({ ...strings }).transform(fn)`
 * where `fn` runs one `Check` over every field, so ALL errors are reported in a
 * single pass (not one batch, then another after the user fixes the first).
 */

export const MONEY_HINT = "Enter an amount, like 95 or 95.50.";
export const PAYMENT_TERMS_OPTIONS = [7, 14, 30] as const;
export const QUOTE_VALIDITY_OPTIONS = [14, 30] as const;

const PHONE = /^\+?[\d\s().-]{7,20}$/;
const PREFIX = /^[A-Za-z0-9#_-]*$/;

export class Check {
  readonly issues: { path: string; message: string }[] = [];

  fail(path: string, message: string): void {
    if (!this.issues.some((i) => i.path === path)) this.issues.push({ path, message });
  }

  /** Trimmed text. `label` reads like "your business name" in messages. */
  text(path: string, value: string, opts: { label: string; required?: boolean; max?: number }): string {
    const v = value.trim();
    const max = opts.max ?? 120;
    if (opts.required && v === "") this.fail(path, `Enter ${opts.label}.`);
    else if (v.length > max) this.fail(path, `That is too long (max ${max} characters).`);
    return v;
  }

  email(path: string, value: string, opts: { required?: boolean } = {}): string {
    const v = value.trim();
    if (v === "") {
      if (opts.required) this.fail(path, "Enter an email address.");
      return v;
    }
    if (v.length > 254 || !z.email().safeParse(v).success) {
      this.fail(path, "Enter a full email address, like name@example.com.");
    }
    return v;
  }

  phone(path: string, value: string, opts: { required?: boolean } = {}): string {
    const v = value.trim();
    if (v === "") {
      if (opts.required) this.fail(path, "Enter a phone number customers can call.");
      return v;
    }
    if (!PHONE.test(v)) this.fail(path, "Enter a phone number, like (413) 555-0182.");
    return v;
  }

  oneOf<T extends string>(path: string, value: string, allowed: readonly T[], message: string): T {
    if (!(allowed as readonly string[]).includes(value)) {
      this.fail(path, message);
      return allowed[0];
    }
    return value as T;
  }

  /** Whole-number option stored as text in a select ("14"), restricted to `allowed`. */
  days(path: string, value: string, allowed: readonly number[], message: string): number {
    const n = Number(value);
    if (!allowed.includes(n)) {
      this.fail(path, message);
      return allowed[0];
    }
    return n;
  }

  /** Money in cents. Blank is allowed only when `required` is false (then 0). */
  money(path: string, value: string, opts: { minCents?: number; required?: boolean }): number {
    if (value.trim() === "" && !opts.required) return 0;
    const cents = parseMoneyToCents(value);
    if (cents === null || cents < (opts.minCents ?? 0)) {
      this.fail(path, MONEY_HINT);
      return 0;
    }
    return cents;
  }

  /** Percent text to basis points (0..maxPercent). Blank is 0 unless `required`. */
  percent(
    path: string,
    value: string,
    opts: { maxPercent?: number; required?: boolean; mustBePositive?: boolean; message?: string },
  ): number {
    const message = opts.message ?? "Enter a percentage, like 8 or 8.5.";
    if (value.trim() === "" && !opts.required) return 0;
    const bps = parsePercentToBps(value, opts.maxPercent ?? 100);
    if (bps === null || (opts.mustBePositive && bps <= 0)) {
      this.fail(path, message);
      return 0;
    }
    return bps;
  }

  /** Blank -> null. Otherwise an https:// URL with a real host. */
  httpsUrl(path: string, value: string): string | null {
    const v = value.trim();
    if (v === "") return null;
    try {
      const url = new URL(v);
      if (url.protocol !== "https:" || !url.hostname.includes(".") || v.length > 500) throw new Error("bad");
      return url.toString();
    } catch {
      this.fail(path, "Enter a full link that starts with https://");
      return null;
    }
  }

  prefix(path: string, value: string): string {
    const v = value.trim();
    if (v.length > 10) this.fail(path, "Use 10 characters or fewer.");
    else if (!PREFIX.test(v)) this.fail(path, "Use letters, numbers, # - or _ only.");
    return v;
  }

  /** Report every collected issue and abort the transform, or pass the value through. */
  done<T>(ctx: z.RefinementCtx, value: T): T {
    if (this.issues.length === 0) return value;
    for (const issue of this.issues) {
      ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
    return z.NEVER;
  }
}
