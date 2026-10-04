import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { postprocessDraft, type DraftResult } from "@/lib/ai/postprocess";
import { aiDraftLimit, effectivePlanOf, limitReachedMessage, usagePeriod } from "@/lib/plans";
import { escapeLikePattern } from "@/lib/quote-helpers";
import { MAX_AUDIO_BYTES, isValidVoicePath, mimeForPath } from "@/lib/voice";
import { actionBusinessContext } from "@/server/actions/context";
import { DraftError, FRIENDLY_MESSAGES, draftFromAudio, type DraftErrorKind } from "@/server/ai/draft-quote";
import { createGeminiClient } from "@/server/ai/gemini-client";
import { buildSystemPrompt } from "@/server/ai/prompt";
import { hitRateLimit, refundAiDraft, reserveAiDraft } from "@/server/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ voiceNotePath: z.string().min(1).max(200) });

export type DraftApiResponse = DraftResult & { voiceNotePath: string; degraded: boolean };

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const STATUS_BY_KIND: Record<DraftErrorKind, number> = {
  rate_limit: 429,
  bad_audio: 422,
  too_large: 413,
  model: 503,
  config: 503,
  timeout: 504,
  upstream: 502,
};

/**
 * POST { voiceNotePath } -> a draft quote from a voice note already uploaded to
 * the private voice-notes bucket. Nothing is saved to quotes here.
 */
export async function POST(request: NextRequest) {
  if (process.env.AI_DRAFTING_ENABLED === "false") {
    return fail(503, "disabled", "Voice drafting is switched off. You can still fill the quote in by hand.");
  }

  // 1. Who is asking, and for which business (user client, RLS applies).
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return fail(401, "unauthenticated", ctx.error.message);
  const { supabase, user, business } = ctx;

  // 2. The request: the path must be inside this business's folder, and the object must exist.
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "That request wasn't valid.");
  const path = parsed.data.voiceNotePath;
  const mimeType = mimeForPath(path);
  if (!isValidVoicePath(path, business.id) || !mimeType) return fail(400, "bad_path", "That recording isn't valid.");

  const gemini = createGeminiClient();
  if (!gemini) return fail(503, "not_configured", FRIENDLY_MESSAGES.config);

  const { data: audioBlob, error: downloadError } = await supabase.storage.from("voice-notes").download(path);
  if (downloadError || !audioBlob) return fail(400, "not_found", "We couldn't find that recording. Record it again.");
  if (audioBlob.size > MAX_AUDIO_BYTES) return fail(413, "too_large", FRIENDLY_MESSAGES.too_large);

  // 3. Limits. These counters need the service role (owners cannot write them), so they run only now,
  //    after the user, business and path have been verified.
  const limit = await hitRateLimit(user.id);
  if (!limit.allowed) {
    return fail(429, "rate_limited", "You're drafting too fast. Wait a minute and try again.");
  }

  const period = usagePeriod(business.timezone);
  const reservation = await reserveAiDraft(business.id, period, aiDraftLimit(effectivePlanOf(business)));
  if (reservation.error) return fail(503, "usage_unavailable", FRIENDLY_MESSAGES.upstream);
  if (!reservation.ok) return fail(402, "limit_reached", limitReachedMessage(effectivePlanOf(business)));

  // 4. The price book the model may match against (active items only).
  const { data: priceItems } = await supabase
    .from("price_items")
    .select("id, name, type, unit, rate_cents, markup_bps")
    .eq("business_id", business.id)
    .eq("archived", false)
    .order("name")
    .limit(1000);
  const book = priceItems ?? [];

  // 5. Ask Gemini. A failure before any result gives the reserved draft back.
  let outcome;
  try {
    outcome = await draftFromAudio({
      client: gemini,
      audio: { bytes: new Uint8Array(await audioBlob.arrayBuffer()), mimeType },
      systemPrompt: buildSystemPrompt(
        { trade: business.trade, country: business.country, currency: business.currency, taxLabel: business.tax_label },
        book,
      ),
    });
  } catch (error) {
    await refundAiDraft(business.id, period);
    const kind: DraftErrorKind = error instanceof DraftError ? error.kind : "upstream";
    if (!(error instanceof DraftError)) console.error("[ai] unexpected draft error");
    return fail(STATUS_BY_KIND[kind], kind, FRIENDLY_MESSAGES[kind]);
  }

  // 6. Deterministic post-processing (the AI never sets prices of known items).
  const spokenName = outcome.output.customer.name;
  const { data: candidates } = spokenName
    ? await supabase
        .from("customers")
        .select("id, name, phone, postcode")
        .eq("business_id", business.id)
        .ilike("name", escapeLikePattern(spokenName))
        .limit(25)
    : { data: [] };

  const draft = postprocessDraft(outcome.output, {
    priceBook: book,
    customers: candidates ?? [],
    business: {
      calloutFeeCents: business.callout_fee_cents,
      taxEnabled: business.tax_enabled,
      taxRateBps: business.tax_rate_bps,
    },
  });

  const response: DraftApiResponse = { ...draft, voiceNotePath: path, degraded: outcome.degraded };
  return NextResponse.json(response);
}
