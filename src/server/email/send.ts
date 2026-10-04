import "server-only";
import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";

export type SendResult = { ok: true } | { ok: false; reason: "not_configured" | "failed" };

export const EMAIL_NOT_CONFIGURED = "Email isn't set up yet. You can still share the link by text message or copy it.";
export const EMAIL_FAILED = "We couldn't send that email. Check the address and try again, or share the link instead.";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** The bare address from EMAIL_FROM, which may be written as `Name <a@b.co>` or just `a@b.co`. */
export function fromAddress(): string {
  const raw = (process.env.EMAIL_FROM ?? "").trim() || "quotes@mail.tradeslip.com";
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/** `"Miller Plumbing via Tradeslip" <quotes@mail.tradeslip.com>`; the name is stripped of characters that break headers. */
export function formatFrom(businessName: string): string {
  const safe = businessName.replace(/["<>\r\n,;]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Tradeslip";
  return `"${safe} via Tradeslip" <${fromAddress()}>`;
}

/**
 * Send one email. Never throws into the caller's flow: failures come back as a result.
 * Only error codes are logged, never addresses or message bodies.
 */
export async function sendEmail(input: {
  businessName: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  react: ReactElement;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, reason: "not_configured" };

  try {
    const [html, text] = await Promise.all([render(input.react), render(input.react, { plainText: true })]);
    const { error } = await new Resend(key).emails.send({
      from: formatFrom(input.businessName),
      to: input.to,
      replyTo: input.replyTo || undefined,
      subject: input.subject,
      html,
      text,
    });
    if (error) {
      console.warn("[email] send failed", { name: error.name, status: (error as { statusCode?: number }).statusCode });
      return { ok: false, reason: "failed" };
    }
    return { ok: true };
  } catch {
    console.warn("[email] send threw");
    return { ok: false, reason: "failed" };
  }
}
