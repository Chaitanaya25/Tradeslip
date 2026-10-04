import { NextResponse, type NextRequest } from "next/server";
import { readBillingConfig } from "@/lib/billing-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/server/billing/provider";
import { handlePaddleWebhook, type ApplyEvent } from "@/server/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Writes the event through the service-role-only SQL function (the only thing that changes plan or subscription state). */
const apply: ApplyEvent = async ({ eventId, eventType, businessId, fields, occurredAt, summary }) => {
  const { data, error } = await createAdminClient().rpc("apply_billing_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_business_id: businessId,
    p_fields: fields,
    p_occurred_at: occurredAt,
    p_summary: summary,
  });
  if (error || typeof data !== "string") return { error: true };
  return { outcome: data as never };
};

/**
 * Paddle webhook. Reads the RAW body (the signature covers the exact bytes), verifies the signature, and returns
 * 400 for anything unverified. Logs event ids and types only, never payloads or emails.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handlePaddleWebhook({
    rawBody,
    signature: request.headers.get("paddle-signature"),
    provider: getProvider(),
    config: readBillingConfig(),
    apply,
  });
  return result.body ? NextResponse.json(result.body, { status: result.status }) : new NextResponse(null, { status: result.status });
}
