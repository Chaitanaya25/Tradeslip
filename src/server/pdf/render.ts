import "server-only";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { invoicePdfFilename, type InvoiceDocData } from "@/lib/invoice-document";
import { quotePdfFilename, type QuoteDocData } from "@/lib/quote-document";
import { InvoiceDocument } from "./InvoiceDocument";
import { QuoteDocument } from "./QuoteDocument";

type PdfElement = Parameters<typeof renderToBuffer>[0];

/** Render a quote to PDF bytes. */
export async function renderQuotePdfBuffer(data: QuoteDocData): Promise<Buffer> {
  return renderToBuffer(createElement(QuoteDocument, { data }) as PdfElement);
}

/** Render an invoice to PDF bytes. */
export async function renderInvoicePdfBuffer(data: InvoiceDocData): Promise<Buffer> {
  return renderToBuffer(createElement(InvoiceDocument, { data }) as PdfElement);
}

/** A PDF shown inline in the browser. */
export async function pdfResponse(render: () => Promise<Buffer>, filename: string): Promise<Response> {
  const buffer = await render();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/** Named like `Estimate-1047.pdf`. */
export function quotePdfResponse(data: QuoteDocData, number: number): Promise<Response> {
  return pdfResponse(() => renderQuotePdfBuffer(data), quotePdfFilename(data.word, number));
}

/** Named like `Invoice-1001.pdf`. */
export function invoicePdfResponse(data: InvoiceDocData, number: number): Promise<Response> {
  return pdfResponse(() => renderInvoicePdfBuffer(data), invoicePdfFilename(number));
}
