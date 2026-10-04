import { Button, Text } from "@react-email/components";
import { COLORS, EmailLayout, buttonStyle, muted, paragraph } from "./layout";

export type OwnerNotificationProps =
  | { kind: "invoice_viewed"; number: string; customerName: string | null; link: string; businessName: string; quoteWord?: never }
  | { kind: "viewed"; quoteWord: string; number: string; customerName: string | null; link: string; businessName: string }
  | {
      kind: "accepted";
      quoteWord: string;
      number: string;
      customerName: string | null;
      acceptedName: string;
      /** True when the customer proved they own the email address on file with a code. */
      verified: boolean;
      totalText: string;
      depositText: string | null;
      link: string;
      businessName: string;
    }
  | { kind: "declined"; quoteWord: string; number: string; customerName: string | null; reason: string | null; link: string; businessName: string };

export function ownerNotificationSubject(p: OwnerNotificationProps): string {
  const who = p.customerName?.trim() || "Your customer";
  if (p.kind === "invoice_viewed") return `${who} viewed invoice #${p.number}`;
  if (p.kind === "viewed") return `${who} viewed ${p.quoteWord.toLowerCase()} #${p.number}`;
  if (p.kind === "accepted") return `${who} accepted ${p.quoteWord.toLowerCase()} #${p.number}`;
  return `${who} declined ${p.quoteWord.toLowerCase()} #${p.number}`;
}

/** Short note to the business owner when a customer views, accepts or declines. */
export function OwnerNotificationEmail(p: OwnerNotificationProps) {
  const who = p.customerName?.trim() || "Your customer";
  const word = p.kind === "invoice_viewed" ? "invoice" : p.quoteWord.toLowerCase();

  return (
    <EmailLayout preview={ownerNotificationSubject(p)} businessName={p.businessName} footer="You get this because it is your Tradeslip account.">
      {p.kind === "invoice_viewed" ? (
        <Text style={paragraph}>
          {who} just opened invoice #{p.number}. It is not marked as paid yet.
        </Text>
      ) : null}

      {p.kind === "viewed" ? (
        <Text style={paragraph}>
          {who} just opened {word} #{p.number}. No reply yet.
        </Text>
      ) : null}

      {p.kind === "accepted" ? (
        <>
          <Text style={paragraph}>
            Good news: {who} accepted {word} #{p.number}. They signed as {p.acceptedName}.
          </Text>
          <Text style={{ ...muted, marginTop: 8 }}>Total</Text>
          <Text style={{ fontSize: 24, fontWeight: 700, color: COLORS.accent, margin: "0 0 8px" }}>{p.totalText}</Text>
          <Text style={{ ...muted, marginBottom: 8 }}>
            {p.verified ? "Verified by email: they entered a code sent to the address you have on file." : "Not verified: this customer has no email on file, so no code was sent."}
          </Text>
          {p.depositText ? <Text style={paragraph}>Deposit requested: {p.depositText}</Text> : null}
        </>
      ) : null}

      {p.kind === "declined" ? (
        <>
          <Text style={paragraph}>
            {who} declined {word} #{p.number}.
          </Text>
          {p.reason ? <Text style={{ ...paragraph, color: COLORS.muted }}>Their reason: {p.reason}</Text> : null}
        </>
      ) : null}

      <Button href={p.link} style={{ ...buttonStyle, marginTop: 12 }}>
        Open {word}
      </Button>
    </EmailLayout>
  );
}
