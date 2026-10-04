import "server-only";
import { isBillingOutcome, mapPaddleEvent, type BillingFields, type BillingOutcome } from "@/lib/billing";
import type { BillingConfig } from "@/lib/billing-config";
import type { BillingProvider } from "./provider";

/**
 * The webhook, with everything external injected so tests use fakes (no Paddle, no database).
 * Order matters: verify the signature first, and only then read anything from the body.
 */

export type ApplyEvent = (args: {
  eventId: string;
  eventType: string;
  businessId: string | null;
  fields: BillingFields | Record<string, never>;
  occurredAt: string;
  summary: Record<string, string | null>;
}) => Promise<{ outcome: BillingOutcome } | { error: true }>;

export type WebhookResult = { status: 200 | 400 | 500 | 503; body?: { received: true } };

export async function handlePaddleWebhook(input: {
  rawBody: string;
  signature: string | null;
  provider: Pick<BillingProvider, "verifyWebhook">;
  config: Pick<BillingConfig, "prices"> | null;
  apply: ApplyEvent;
  log?: (message: string, meta: Record<string, string>) => void;
}): Promise<WebhookResult> {
  const log = input.log ?? ((message, meta) => console.info(message, meta));

  // 1. Never touch an unverified body.
  const event = await input.provider.verifyWebhook(input.rawBody, input.signature);
  if (!event) return { status: 400 };

  // 2. Without our price ids nothing can be mapped; ask Paddle to retry later.
  if (!input.config) return { status: 503 };

  const mapped = mapPaddleEvent(event, input.config);
  const result = await input.apply({
    eventId: mapped.eventId,
    eventType: mapped.eventType,
    businessId: mapped.kind === "apply" ? mapped.businessId : null,
    fields: mapped.kind === "apply" ? mapped.fields : {},
    occurredAt: mapped.occurredAt,
    summary: mapped.summary,
  });

  // 3. A transient failure is a 500 so Paddle retries; everything else (processed, duplicate, ignored) is a quick 200.
  if ("error" in result) {
    log("[billing] event failed", { event: mapped.eventId, type: mapped.eventType });
    return { status: 500 };
  }
  if (!isBillingOutcome(result.outcome)) {
    log("[billing] unexpected outcome", { event: mapped.eventId, type: mapped.eventType });
    return { status: 500 };
  }
  log("[billing] event", { event: mapped.eventId, type: mapped.eventType, outcome: result.outcome, mapped: mapped.kind });
  return { status: 200, body: { received: true } };
}
