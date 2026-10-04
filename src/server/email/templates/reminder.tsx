import { Button, Link, Text } from "@react-email/components";
import { COLORS, EmailLayout, buttonStyle, muted, paragraph } from "./layout";

export type ReminderEmailProps = {
  businessName: string;
  logoUrl: string | null;
  /** The message after token replacement, as plain paragraphs. Rendered as text, never as HTML. */
  paragraphs: string[];
  /** "estimate", "quote" or "invoice" (lower case). */
  documentWord: string;
  link: string;
  unsubscribeUrl: string;
  /** Set for a part-paid invoice: what is still owed. */
  partialBalanceText?: string | null;
  /** Show the Tradeslip footer (free and trial plans). */
  branding: boolean;
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function ReminderEmail(p: ReminderEmailProps & { preview: string }) {
  const word = p.documentWord;
  return (
    <EmailLayout preview={p.preview} businessName={p.businessName} logoUrl={p.logoUrl} footer={p.branding ? "Sent with Tradeslip" : p.businessName}>
      {p.paragraphs.map((text, i) => (
        <Text key={i} style={{ ...paragraph, whiteSpace: "pre-line" }}>
          {text}
        </Text>
      ))}
      {p.partialBalanceText ? (
        <>
          <Text style={{ ...muted, marginTop: 8 }}>Balance still due</Text>
          <Text style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, color: COLORS.accent, margin: "0 0 12px" }}>{p.partialBalanceText}</Text>
        </>
      ) : null}
      <Button href={p.link} style={{ ...buttonStyle, marginTop: 8 }}>
        View {word}
      </Button>
      <Text style={{ ...muted, marginTop: 20 }}>
        You received this because {p.businessName} sent you {article(word)} {word}.{" "}
        <Link href={p.unsubscribeUrl} style={{ color: COLORS.muted, textDecoration: "underline" }}>
          Stop these reminders
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

/** One polite follow-up for an unanswered quote or estimate. */
export function QuoteFollowupEmail(p: ReminderEmailProps) {
  return <ReminderEmail {...p} preview={`Following up on your ${p.documentWord} from ${p.businessName}`} />;
}

/** Payment reminder (gentle first, firmer but polite second: the tone comes from the editable text). */
export function InvoiceReminderEmail(p: ReminderEmailProps) {
  return <ReminderEmail {...p} preview={`A reminder about your invoice from ${p.businessName}`} />;
}
