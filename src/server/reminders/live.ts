import "server-only";
import { resolveUnsubscribeSecret } from "@/lib/reminder-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/server/email/send";
import { deliverReminder, type DeliverIo, type ReminderTarget } from "./deliver";
import type { RunDeps } from "./run";

/** The real pieces behind the cron route and the manual action: the service-role client (server only) and Resend. */

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function liveDeliverIo(): DeliverIo {
  const admin = createAdminClient();
  return {
    appUrl: appUrl(),
    unsubscribeSecret: resolveUnsubscribeSecret(),
    claim: async (entity, id, kind) => {
      const { data, error } = await admin.rpc("claim_reminder", { p_entity_type: entity, p_entity_id: id, p_kind: kind });
      return error || typeof data !== "string" ? null : data;
    },
    finalize: async (claimId, status, reason, messageId) => {
      const { data, error } = await admin.rpc("finalize_reminder", { p_claim_id: claimId, p_status: status, p_reason: reason, p_message_id: messageId });
      return !error && data === true;
    },
    send: (input) => sendEmail({ ...input, react: input.react as never }),
  };
}

export function liveRunDeps(): RunDeps {
  const admin = createAdminClient();
  const io = liveDeliverIo();
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    expire: async () => {
      const { data, error } = await admin.rpc("expire_due_quotes", { p_limit: 500 });
      if (error) throw new Error("expire failed");
      return typeof data === "number" ? data : 0;
    },
    listQuotes: async (now, limit) => {
      const { data, error } = await admin.rpc("list_due_quote_followups", { p_now: now.toISOString(), p_limit: limit });
      if (error) throw new Error("list quotes failed");
      return data ?? [];
    },
    listInvoices: async (now, limit) => {
      const { data, error } = await admin.rpc("list_due_invoice_reminders", { p_now: now.toISOString(), p_limit: limit });
      if (error) throw new Error("list invoices failed");
      return data ?? [];
    },
    deliver: (target: ReminderTarget) => deliverReminder(target, io),
  };
}
