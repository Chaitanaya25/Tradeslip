import "server-only";
import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { EMAIL_MESSAGES, mapResendError, type EmailFailure } from "@/lib/email-errors";

export { EMAIL_MESSAGES };
export type { EmailFailure };

/** `id` is Resend's message id. Success is only reported when Resend returned one. */
export type SendResult = { ok: true; id: string } | { ok: false; reason: EmailFailure };

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
 * Send one email and report what really happened. Never throws into the caller's flow.
 * Only error names and status codes are logged, never addresses, codes or message bodies.
 */
export async function sendEmail(input: {
  businessName: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  react: ReactElement;
  /** Extra message headers, e.g. List-Unsubscribe on reminders. */
  headers?: Record<string, string>;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, reason: "not_configured" };

  try {
    const [html, text] = await Promise.all([render(input.react), render(input.react, { plainText: true })]);
    const { data, error } = await new Resend(key).emails.send({
      from: formatFrom(input.businessName),
      to: input.to,
      replyTo: input.replyTo || undefined,
      subject: input.subject,
      html,
      text,
      ...(input.headers ? { headers: input.headers } : {}),
    });

    if (error) {
      const reason = mapResendError(error);
      console.warn("[email] send rejected", { reason, name: error.name, status: (error as { statusCode?: number | null }).statusCode ?? null });
      return { ok: false, reason };
    }
    // No id means Resend did not accept the message, whatever else came back.
    if (!data?.id) {
      console.warn("[email] send returned no id");
      return { ok: false, reason: "failed" };
    }
    return { ok: true, id: data.id };
  } catch {
    console.warn("[email] send threw");
    return { ok: false, reason: "failed" };
  }
}
