import { Button, Text } from "@react-email/components";
import { COLORS, EmailLayout, buttonStyle, muted, paragraph } from "./layout";

export type QuoteToCustomerProps = {
  businessName: string;
  logoUrl: string | null;
  customerName: string | null;
  /** "Estimate" or "Quote". */
  quoteWord: string;
  number: string;
  totalText: string;
  validUntilText: string | null;
  link: string;
  /** Show the Tradeslip footer (free and trial plans). */
  branding: boolean;
};

export function QuoteToCustomerEmail(p: QuoteToCustomerProps) {
  const first = (p.customerName ?? "").trim().split(/\s+/)[0];
  const word = p.quoteWord.toLowerCase();
  return (
    <EmailLayout
      preview={`Your ${word} from ${p.businessName}: ${p.totalText}`}
      businessName={p.businessName}
      logoUrl={p.logoUrl}
      footer={p.branding ? "Sent with Tradeslip" : p.businessName}
    >
      <Text style={paragraph}>{first ? `Hi ${first},` : "Hi,"}</Text>
      <Text style={paragraph}>
        Thanks for getting in touch. Here is your {word} for the work we talked about. You can look it over and accept it
        from your phone. No sign-up needed.
      </Text>
      <Text style={{ ...muted, marginTop: 16 }}>
        {p.quoteWord} #{p.number}
      </Text>
      <Text style={{ fontSize: 30, lineHeight: "36px", fontWeight: 700, color: COLORS.accent, margin: "0 0 4px" }}>{p.totalText}</Text>
      {p.validUntilText ? <Text style={{ ...muted, marginBottom: 20 }}>Valid until {p.validUntilText}</Text> : null}
      <Button href={p.link} style={buttonStyle}>
        View {word}
      </Button>
      <Text style={{ ...muted, marginTop: 20 }}>
        If the button does not work, copy this link into your browser: {p.link}
      </Text>
      <Text style={{ ...muted, marginTop: 8 }}>Questions? Just reply to this email.</Text>
    </EmailLayout>
  );
}
