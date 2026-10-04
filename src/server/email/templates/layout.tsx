import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";

// Email clients ignore CSS variables, so the design tokens are repeated as plain values.
export const COLORS = {
  bg: "#FAF9F7",
  surface: "#FFFFFF",
  border: "#E7E5E0",
  text: "#1C1917",
  muted: "#78716C",
  accent: "#E8590C",
  accentSoft: "#FDEDE3",
} as const;

export const FONT = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Shared frame: business name (and logo) on top, content card, small footer. */
export function EmailLayout({
  preview,
  businessName,
  logoUrl,
  children,
  footer,
}: {
  preview: string;
  businessName: string;
  logoUrl?: string | null;
  children: ReactNode;
  footer?: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: COLORS.bg, margin: 0, padding: "24px 12px", fontFamily: FONT, color: COLORS.text }}>
        <Container style={{ maxWidth: 480, margin: "0 auto" }}>
          <Section style={{ padding: "0 4px 16px" }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={businessName} height={40} style={{ display: "inline-block", borderRadius: 8 }} />
            ) : null}
            <Text style={{ fontSize: 18, fontWeight: 600, margin: logoUrl ? "8px 0 0" : 0, color: COLORS.text }}>{businessName}</Text>
          </Section>
          <Section
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 24 }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: "transparent", margin: "8px 0" }} />
          <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: "center", margin: 0 }}>{footer ?? "Sent with Tradeslip"}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const paragraph = { fontSize: 15, lineHeight: "22px", margin: "0 0 12px", color: COLORS.text } as const;
export const muted = { fontSize: 13, lineHeight: "18px", margin: "0 0 4px", color: COLORS.muted } as const;
export const buttonStyle = {
  backgroundColor: COLORS.accent,
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 8,
  padding: "12px 20px",
  textDecoration: "none",
  display: "block",
  textAlign: "center",
} as const;
