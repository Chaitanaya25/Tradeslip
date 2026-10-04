import "server-only";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { quotePdfFilename, type QuoteDocData } from "@/lib/quote-document";
import { QuoteDocument } from "./QuoteDocument";

/** Render a quote to PDF bytes. */
export async function renderQuotePdfBuffer(data: QuoteDocData): Promise<Buffer> {
  return renderToBuffer(createElement(QuoteDocument, { data }) as Parameters<typeof renderToBuffer>[0]);
}

/** A PDF response shown inline in the browser, named like `Estimate-1047.pdf`. */
export async function quotePdfResponse(data: QuoteDocData, number: number): Promise<Response> {
  const buffer = await renderQuotePdfBuffer(data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotePdfFilename(data.word, number)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
