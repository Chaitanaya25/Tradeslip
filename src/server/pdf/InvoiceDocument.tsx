import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { InvoiceDocData } from "@/lib/invoice-document";
import { DocFooter, ItemsTable, NotesBlock, Parties, TopBand, Totals, s } from "./doc-parts";

/** The printable invoice. Same structure as the public page and the quote PDF. */
export function InvoiceDocument({ data }: { data: InvoiceDocData }) {
  const d = data;
  return (
    <Document title={`${d.word} ${d.number} from ${d.business.name}`} author={d.business.name} creator="Tradeslip">
      <Page size={d.pageSize} style={s.page}>
        <TopBand
          business={d.business}
          info={
            <>
              <Text style={s.docWord}>{d.word}</Text>
              <Text style={s.docNumber}>#{d.number}</Text>
              <Text style={{ ...s.small, textAlign: "right" }}>Issued {d.issueDate}</Text>
              <Text style={{ ...s.small, textAlign: "right" }}>Due {d.dueDate}</Text>
              {d.paidInFull ? <Text style={s.paid}>PAID IN FULL</Text> : null}
              {d.isDraft ? <Text style={s.draft}>DRAFT PREVIEW</Text> : null}
            </>
          }
        />
        <Parties customer={d.customer} addressLabel="Address" title={d.title} />
        <ItemsTable items={d.items} />
        <Totals d={d}>
          {d.amountPaid ? (
            <>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Amount paid</Text>
                <Text style={s.totalValue}>{d.amountPaid}</Text>
              </View>
              <View style={s.balance}>
                <Text style={s.balanceLabel}>Balance due</Text>
                <Text style={s.balanceValue}>{d.balanceDue}</Text>
              </View>
            </>
          ) : null}
        </Totals>

        {d.paymentUrl ? (
          <View style={s.deposit} wrap={false}>
            <Text style={{ ...s.depositLabel, marginBottom: 4 }}>How to pay</Text>
            <Text style={{ ...s.small, marginBottom: 0, color: "#1C1917" }}>Pay online at {d.paymentUrl}</Text>
          </View>
        ) : null}

        <NotesBlock notes={d.notes} />
        <DocFooter d={d} />
      </Page>
    </Document>
  );
}
