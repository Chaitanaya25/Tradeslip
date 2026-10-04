import { Text } from "@react-email/components";
import { COLORS, EmailLayout, muted, paragraph } from "./layout";

export type OtpCodeEmailProps = {
  businessName: string;
  logoUrl: string | null;
  customerName: string | null;
  /** "Estimate" or "Quote". */
  quoteWord: string;
  number: string;
  code: string;
  expiresMinutes: number;
};

/** The one-time code a customer types to accept a quote. Short and clear. */
export function OtpCodeEmail(p: OtpCodeEmailProps) {
  const first = (p.customerName ?? "").trim().split(/\s+/)[0];
  const word = p.quoteWord.toLowerCase();
  return (
    <EmailLayout
      preview={`Your code to accept ${word} #${p.number} from ${p.businessName}`}
      businessName={p.businessName}
      logoUrl={p.logoUrl}
      footer={`Sent for ${p.businessName}`}
    >
      <Text style={paragraph}>{first ? `Hi ${first},` : "Hi,"}</Text>
      <Text style={paragraph}>
        Use this code to accept {word} #{p.number} from {p.businessName}:
      </Text>
      <Text
        style={{
          fontSize: 36,
          lineHeight: "44px",
          fontWeight: 700,
          letterSpacing: "8px",
          textAlign: "center",
          color: COLORS.text,
          backgroundColor: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "12px 0",
          margin: "8px 0 16px",
        }}
      >
        {p.code}
      </Text>
      <Text style={muted}>The code expires in {p.expiresMinutes} minutes.</Text>
      <Text style={{ ...muted, marginTop: 8 }}>If you did not request this, ignore this email. Nothing will be accepted.</Text>
    </EmailLayout>
  );
}
