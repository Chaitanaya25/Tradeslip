import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { QuoteDocData } from "@/lib/quote-document";

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
Font.registerHyphenationCallback((word) => [word]);

const C = { text: "#1C1917", muted: "#78716C", border: "#E7E5E0", accent: "#E8590C", soft: "#FDEDE3", softBorder: "#F6C3A3", surface: "#F5F4F1" };

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, color: C.text, paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48, lineHeight: 1.4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  mark: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  logo: { width: 44, height: 44, borderRadius: 22, objectFit: "contain" },
  monogram: { fontSize: 15, fontWeight: 600, color: C.muted },
  bizName: { fontSize: 15, fontWeight: 600 },
  muted: { color: C.muted, fontSize: 9.5 },
  title: { fontSize: 22, fontWeight: 600, marginTop: 20 },
  meta: { color: C.muted, marginTop: 2 },
  draft: { fontSize: 9, fontWeight: 600, color: C.muted, marginTop: 4 },
  block: { marginTop: 16 },
  label: { fontSize: 9, color: C.muted, marginBottom: 2 },
  customerName: { fontSize: 12, fontWeight: 500 },
  tableHead: { flexDirection: "row", backgroundColor: C.surface, paddingVertical: 6, paddingHorizontal: 8, marginTop: 20, borderRadius: 4 },
  row: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 36, textAlign: "center" },
  cRate: { width: 74, textAlign: "right" },
  cAmount: { width: 78, textAlign: "right" },
  th: { fontSize: 9, fontWeight: 500, color: C.muted },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, marginTop: 6, paddingTop: 8 },
  grandLabel: { fontSize: 14, fontWeight: 600 },
  grandValue: { fontSize: 20, fontWeight: 600, color: C.accent },
  deposit: { marginTop: 16, backgroundColor: C.soft, borderWidth: 1, borderColor: C.softBorder, borderRadius: 6, padding: 12 },
  depositRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  depositAmount: { fontSize: 14, fontWeight: 600, color: C.accent },
  notesTitle: { fontSize: 11, fontWeight: 600, marginBottom: 3 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  photo: { width: 160, height: 120, objectFit: "cover", borderRadius: 4 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, textAlign: "center", color: C.muted, fontSize: 9 },
});

/** The printable quote. Same structure as the public page. */
export function QuoteDocument({ data }: { data: QuoteDocData }) {
  const d = data;
  return (
    <Document title={`${d.word} ${d.number} from ${d.business.name}`} author={d.business.name} creator="Tradeslip">
      <Page size={d.pageSize} style={s.page}>
        <View style={s.header}>
          {d.business.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
            <Image src={d.business.logoUrl} style={s.logo} />
          ) : (
            <View style={s.mark}>
              <Text style={s.monogram}>{d.business.monogram}</Text>
            </View>
          )}
          <View>
            <Text style={s.bizName}>{d.business.name}</Text>
            {d.business.contactLine ? <Text style={s.muted}>{d.business.contactLine}</Text> : null}
            {d.business.licenceLine ? <Text style={s.muted}>{d.business.licenceLine}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>
          {d.word} for {d.customer.name}
        </Text>
        <Text style={s.meta}>
          #{d.number}
          {d.validUntil ? `  ·  Valid until ${d.validUntil}` : ""}
        </Text>
        {d.isDraft ? <Text style={s.draft}>DRAFT PREVIEW</Text> : null}

        {d.customer.address ? (
          <View style={s.block}>
            <Text style={s.label}>Job address</Text>
            <Text>{d.customer.address}</Text>
          </View>
        ) : null}
        {d.title ? <Text style={{ ...s.customerName, marginTop: 14 }}>{d.title}</Text> : null}

        <View style={s.tableHead}>
          <Text style={{ ...s.th, ...s.cDesc }}>Description</Text>
          <Text style={{ ...s.th, ...s.cQty }}>Qty</Text>
          <Text style={{ ...s.th, ...s.cRate }}>Rate</Text>
          <Text style={{ ...s.th, ...s.cAmount }}>Amount</Text>
        </View>
        {d.items.map((item, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cDesc}>{item.description}</Text>
            <Text style={s.cQty}>{item.qtyText}</Text>
            <Text style={s.cRate}>{item.rateText}</Text>
            <Text style={s.cAmount}>{item.amountText}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: C.muted }}>Subtotal</Text>
            <Text>{d.subtotal}</Text>
          </View>
          {d.tax ? (
            <View style={s.totalRow}>
              <Text style={{ color: C.muted }}>{d.tax.label}</Text>
              <Text>{d.tax.amount}</Text>
            </View>
          ) : null}
          <View style={s.grand}>
            <Text style={s.grandLabel}>Total</Text>
            <Text style={s.grandValue}>{d.total}</Text>
          </View>
        </View>

        {d.deposit ? (
          <View style={s.deposit} wrap={false}>
            <View style={s.depositRow}>
              <Text style={{ fontWeight: 500 }}>{d.deposit.label}</Text>
              <Text style={s.depositAmount}>{d.deposit.amount}</Text>
            </View>
            <Text style={{ ...s.muted, marginTop: 3 }}>The remaining balance of {d.deposit.remaining} is due on completion.</Text>
          </View>
        ) : null}

        {d.notes ? (
          <View style={s.block} wrap={false}>
            <Text style={s.notesTitle}>Notes</Text>
            <Text>{d.notes}</Text>
          </View>
        ) : null}

        {d.photos.length > 0 ? (
          <View style={s.block}>
            <Text style={s.notesTitle}>Job photos</Text>
            <View style={s.photos}>
              {d.photos.map((p, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                <Image key={i} src={p.url} style={s.photo} />
              ))}
            </View>
          </View>
        ) : null}

        {d.branding ? <Text style={s.footer} fixed>{d.branding}</Text> : null}
      </Page>
    </Document>
  );
}
