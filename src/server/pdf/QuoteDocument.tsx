import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { QuoteDocData } from "@/lib/quote-document";
import { DocFooter, ItemsTable, NotesBlock, Parties, TopBand, Totals, s } from "./doc-parts";

/** The printable quote. Same structure as the public page. */
export function QuoteDocument({ data }: { data: QuoteDocData }) {
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
              {d.validUntil ? <Text style={{ ...s.small, textAlign: "right" }}>Valid until {d.validUntil}</Text> : null}
              {d.isDraft ? <Text style={s.draft}>DRAFT PREVIEW</Text> : null}
            </>
          }
        />
        <Parties customer={d.customer} addressLabel="Job address" title={d.title} />
        <ItemsTable items={d.items} />
        <Totals d={d} />

        {d.deposit ? (
          <View style={s.deposit} wrap={false}>
            <View style={s.depositRow}>
              <Text style={s.depositLabel}>{d.deposit.label}</Text>
              <Text style={s.depositAmount}>{d.deposit.amount}</Text>
            </View>
            <Text style={{ ...s.small, marginBottom: 0 }}>The remaining balance of {d.deposit.remaining} is due on completion.</Text>
          </View>
        ) : null}

        <NotesBlock notes={d.notes} />

        {d.photos.length > 0 ? (
          <View style={s.notes}>
            <Text style={s.photoTitle}>Job photos</Text>
            <View style={s.photos}>
              {d.photos.map((p, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                <Image key={i} src={p.url} style={s.photo} />
              ))}
            </View>
          </View>
        ) : null}

        <DocFooter d={d} />
      </Page>
    </Document>
  );
}
