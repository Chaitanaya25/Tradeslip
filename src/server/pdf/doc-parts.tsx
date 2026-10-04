import path from "node:path";
import type { ReactNode } from "react";
import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CommonDocData } from "@/lib/quote-document";

// Inter is bundled in /public/fonts (next.config traces these files into the PDF routes).
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Inter-Medium.ttf"), fontWeight: 500 },
    { src: path.join(FONT_DIR, "Inter-SemiBold.ttf"), fontWeight: 600 },
  ],
});
// Keep normal words whole, but let absurdly long unbroken strings wrap instead of running off the page.
Font.registerHyphenationCallback((word) => (word.length > 22 ? (word.match(/.{1,12}/g) ?? [word]) : [word]));

// DESIGN.md tokens.
export const C = {
  text: "#1C1917",
  muted: "#78716C",
  border: "#E7E5E0",
  surface: "#F5F4F1",
  accent: "#E8590C",
  soft: "#FDEDE3",
  softBorder: "#F6C3A3",
  good: "#1E7B43",
};

const MARGIN = 40;

/**
 * Layout rules that keep text from overlapping: every Text sets its own fontSize,
 * lineHeight and bottom margin, columns are Views with flex, and nothing has a fixed
 * height except the round logo mark (which holds no text that can grow).
 */
export const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10, lineHeight: 1.4, color: C.text, paddingTop: MARGIN, paddingBottom: 64, paddingHorizontal: MARGIN },

  // Top band
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  brand: { flexDirection: "row", alignItems: "flex-start", flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 20 },
  mark: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", marginRight: 12 },
  logo: { width: 46, height: 46, borderRadius: 23, objectFit: "contain", marginRight: 12 },
  monogram: { fontSize: 15, lineHeight: 1.2, fontWeight: 600, color: C.muted },
  brandText: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  bizName: { fontSize: 15, lineHeight: 1.25, fontWeight: 600, marginBottom: 4 },
  small: { fontSize: 9.5, lineHeight: 1.4, color: C.muted, marginBottom: 2 },
  docInfo: { alignItems: "flex-end", flexShrink: 0, width: 150 },
  docWord: { fontSize: 22, lineHeight: 1.2, fontWeight: 600, marginBottom: 6, textAlign: "right" },
  docNumber: { fontSize: 11, lineHeight: 1.3, fontWeight: 500, marginBottom: 3, textAlign: "right" },
  draft: { fontSize: 8.5, lineHeight: 1.3, fontWeight: 600, color: C.accent, marginTop: 4, textAlign: "right" },
  paid: { fontSize: 9, lineHeight: 1.3, fontWeight: 600, color: C.good, marginTop: 4, textAlign: "right" },

  // Customer + address
  parties: { flexDirection: "row", marginTop: 18 },
  party: { flexGrow: 1, flexBasis: 0, paddingRight: 16 },
  label: { fontSize: 8.5, lineHeight: 1.3, fontWeight: 500, color: C.muted, marginBottom: 4 },
  partyName: { fontSize: 12, lineHeight: 1.3, fontWeight: 600, marginBottom: 2 },
  partyText: { fontSize: 10, lineHeight: 1.45, marginBottom: 2 },
  jobTitle: { fontSize: 11, lineHeight: 1.35, fontWeight: 500, marginTop: 16, marginBottom: 0 },

  // Items table
  table: { marginTop: 18 },
  th: { flexDirection: "row", backgroundColor: C.surface, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 8 },
  thText: { fontSize: 8.5, lineHeight: 1.3, fontWeight: 500, color: C.muted },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  cDesc: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 10 },
  cQty: { width: 38, textAlign: "center" },
  cRate: { width: 78, textAlign: "right" },
  cAmount: { width: 82, textAlign: "right" },
  cell: { fontSize: 10, lineHeight: 1.4 },

  // Totals
  totals: { marginTop: 14, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 10, lineHeight: 1.4, color: C.muted },
  totalValue: { fontSize: 10, lineHeight: 1.4, textAlign: "right" },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, marginTop: 6, paddingTop: 10 },
  grandLabel: { fontSize: 15, lineHeight: 1.3, fontWeight: 600 },
  grandValue: { fontSize: 22, lineHeight: 1.2, fontWeight: 600, color: C.accent, textAlign: "right" },
  balance: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 8 },
  balanceLabel: { fontSize: 12, lineHeight: 1.3, fontWeight: 600 },
  balanceValue: { fontSize: 15, lineHeight: 1.25, fontWeight: 600, textAlign: "right" },

  // Deposit + notes
  deposit: { marginTop: 18, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14 },
  depositRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  depositLabel: { fontSize: 11, lineHeight: 1.35, fontWeight: 500, flexGrow: 1, flexShrink: 1, paddingRight: 12 },
  depositAmount: { fontSize: 14, lineHeight: 1.25, fontWeight: 600, color: C.accent, textAlign: "right" },
  notes: { marginTop: 20 },
  notesTitle: { fontSize: 11, lineHeight: 1.3, fontWeight: 600, marginBottom: 4 },
  notesText: { fontSize: 10, lineHeight: 1.5 },
  photoTitle: { fontSize: 11, lineHeight: 1.3, fontWeight: 600, marginBottom: 6 },
  photos: { flexDirection: "row", flexWrap: "wrap" },
  photo: { width: 160, height: 120, objectFit: "cover", borderRadius: 4, marginRight: 8, marginBottom: 8 },

  // Footer on every page
  footer: { position: "absolute", bottom: 26, left: MARGIN, right: MARGIN, fontSize: 8.5, lineHeight: 1.3, color: C.muted },
});

export function TableHeader() {
  return (
    <View style={s.th}>
      <Text style={{ ...s.thText, ...s.cDesc }}>Description</Text>
      <Text style={{ ...s.thText, ...s.cQty }}>Qty</Text>
      <Text style={{ ...s.thText, ...s.cRate }}>Rate</Text>
      <Text style={{ ...s.thText, ...s.cAmount }}>Amount</Text>
    </View>
  );
}

/** Logo or monogram + business name and contact on the left, `info` (title, number, dates) on the right. */
export function TopBand({ business, info }: { business: CommonDocData["business"]; info: ReactNode }) {
  return (
    <View style={s.top}>
      <View style={s.brand}>
        {business.logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
          <Image src={business.logoUrl} style={s.logo} />
        ) : (
          <View style={s.mark}>
            <Text style={s.monogram}>{business.monogram}</Text>
          </View>
        )}
        <View style={s.brandText}>
          <Text style={s.bizName}>{business.name}</Text>
          {business.contactLine ? <Text style={s.small}>{business.contactLine}</Text> : null}
          {business.licenceLine ? <Text style={s.small}>{business.licenceLine}</Text> : null}
        </View>
      </View>
      <View style={s.docInfo}>{info}</View>
    </View>
  );
}

/** "Prepared for" + optional address, then the job title. */
export function Parties({ customer, addressLabel, title }: { customer: CommonDocData["customer"]; addressLabel: string; title: string | null }) {
  return (
    <>
      <View style={s.parties}>
        <View style={s.party}>
          <Text style={s.label}>Prepared for</Text>
          <Text style={s.partyName}>{customer.name}</Text>
        </View>
        {customer.address ? (
          <View style={s.party}>
            <Text style={s.label}>{addressLabel}</Text>
            <Text style={s.partyText}>{customer.address}</Text>
          </View>
        ) : null}
      </View>
      {title ? <Text style={s.jobTitle}>{title}</Text> : null}
    </>
  );
}

/** Items table with a header that repeats after a page break; rows never split across pages. */
export function ItemsTable({ items }: { items: CommonDocData["items"] }) {
  return (
    <View style={s.table}>
      <View fixed>
        <TableHeader />
      </View>
      {items.map((item, i) => (
        <View key={i} style={s.row} wrap={false}>
          <Text style={{ ...s.cell, ...s.cDesc }}>{item.description}</Text>
          <Text style={{ ...s.cell, ...s.cQty }}>{item.qtyText}</Text>
          <Text style={{ ...s.cell, ...s.cRate }}>{item.rateText}</Text>
          <Text style={{ ...s.cell, ...s.cAmount }}>{item.amountText}</Text>
        </View>
      ))}
    </View>
  );
}

/** Subtotal, tax and the big Total; `children` adds rows below (amount paid, balance due). */
export function Totals({ d, children }: { d: CommonDocData; children?: ReactNode }) {
  return (
    <View style={s.totals} wrap={false}>
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Subtotal</Text>
        <Text style={s.totalValue}>{d.subtotal}</Text>
      </View>
      {d.tax ? (
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{d.tax.label}</Text>
          <Text style={s.totalValue}>{d.tax.amount}</Text>
        </View>
      ) : null}
      <View style={s.grand}>
        <Text style={s.grandLabel}>Total</Text>
        <Text style={s.grandValue}>{d.total}</Text>
      </View>
      {children}
    </View>
  );
}

export function NotesBlock({ notes }: { notes: string | null }) {
  if (!notes) return null;
  return (
    <View style={s.notes} wrap={false}>
      <Text style={s.notesTitle}>Notes</Text>
      <Text style={s.notesText}>{notes}</Text>
    </View>
  );
}

export function DocFooter({ d }: { d: CommonDocData }) {
  return (
    <Text style={s.footer} fixed>
      {d.branding ?? d.business.name}
    </Text>
  );
}
