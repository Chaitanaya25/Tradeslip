import type { Country } from "./region";

/** Public link and share deep links (SMS, WhatsApp, mailto). Pure and unit tested. */

export function buildPublicUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/q/${token}`;
}

const DIAL_CODE: Record<Country, string> = { US: "1", UK: "44", AU: "61" };

/**
 * Phone number as digits with the country code, no plus: "(413) 555-0182" -> "14135550182".
 * Returns null when there are too few digits to be a real number.
 */
export function normalizePhoneDigits(phone: string | null | undefined, country: Country): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;

  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 7) return null;
  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;

  const dial = DIAL_CODE[country];
  if (country === "US") {
    if (digits.length === 10) return dial + digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits;
    return null;
  }
  // UK / AU national format starts with a trunk 0.
  if (digits.startsWith("0")) return dial + digits.slice(1);
  if (digits.startsWith(dial)) return digits;
  return null;
}

/** "Hi Sarah, here is your Estimate from Miller Plumbing: https://..." */
export function buildShareMessage(input: { customerName: string | null; quoteWord: string; businessName: string; link: string }): string {
  const first = (input.customerName ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  return `${greeting} here is your ${input.quoteWord} from ${input.businessName}: ${input.link}`;
}

/** `sms:` link. The `?&body=` form works on both iOS and Android. */
export function smsLink(digits: string | null, message: string): string | null {
  if (!digits) return null;
  return `sms:+${digits}?&body=${encodeURIComponent(message)}`;
}

export function whatsappLink(digits: string | null, message: string): string | null {
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function mailtoLink(to: string | null | undefined, subject: string, body: string): string | null {
  if (!to?.trim()) return null;
  return `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
