import { Button, Text } from "@react-email/components";
import { COLORS, EmailLayout, buttonStyle, muted, paragraph } from "./layout";

export type InvoiceToCustomerProps = {
  businessName: string;
  logoUrl: string | null;
  customerName: string | null;
  number: string;
  /** The invoice total. */
  totalText: string;
  /** Set when part of it is already paid: the amount still owed. */
  balanceDueText: string | null;
  dueDateText: string;
  link: string;
  /** Show the Tradeslip footer (free and trial plans). */
  branding: boolean;
};

export function InvoiceToCustomerEmail(p: InvoiceToCustomerProps) {
  const first = (p.customerName ?? "").trim().split(/\s+/)[0];
  const owed = p.balanceDueText ?? p.totalText;
  return (
    <EmailLayout
      preview={`Invoice ${p.number} from ${p.businessName}: ${owed} due ${p.dueDateText}`}
      businessName={p.businessName}
      logoUrl={p.logoUrl}
      footer={p.branding ? "Sent with Tradeslip" : p.businessName}
    >
      <Text style={paragraph}>{first ? `Hi ${first},` : "Hi,"}</Text>
      <Text style={paragraph}>Thanks for your business. Your invoice is ready. You can look it over and see how to pay from your phone.</Text>
      <Text style={{ ...muted, marginTop: 16 }}>Invoice #{p.number}</Text>
      <Text style={{ ...muted, marginTop: 4 }}>{p.balanceDueText ? "Balance due" : "Total due"}</Text>
      <Text style={{ fontSize: 30, lineHeight: "36px", fontWeight: 700, color: COLORS.accent, margin: "0 0 4px" }}>{owed}</Text>
      {p.balanceDueText ? <Text style={{ ...muted, marginBottom: 4 }}>Invoice total {p.totalText}</Text> : null}
      <Text style={{ ...muted, marginBottom: 20 }}>Due {p.dueDateText}</Text>
      <Button href={p.link} style={buttonStyle}>
        View invoice
      </Button>
      <Text style={{ ...muted, marginTop: 20 }}>If the button does not work, copy this link into your browser: {p.link}</Text>
      <Text style={{ ...muted, marginTop: 8 }}>Questions? Just reply to this email.</Text>
    </EmailLayout>
  );
}
