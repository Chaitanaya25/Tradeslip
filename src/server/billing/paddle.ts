import "server-only";
import { ApiError, Environment, Paddle, Webhooks } from "@paddle/paddle-node-sdk";
import type { PaddleEventLike } from "@/lib/billing";
import { readBillingConfig } from "@/lib/billing-config";
import type { BillingProvider } from "./provider";

/** Paddle implementation. The only file that imports the Paddle SDK. */

function client(): Paddle {
  const config = readBillingConfig();
  if (!config) throw new Error("billing_not_configured");
  return new Paddle(config.apiKey, { environment: config.environment === "production" ? Environment.production : Environment.sandbox });
}

export const paddleProvider: BillingProvider = {
  isConfigured: () => readBillingConfig() !== null,

  async verifyWebhook(rawBody, signature) {
    const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
    if (!secret || !signature) return null;
    try {
      const event = await new Webhooks().unmarshal(rawBody, secret, signature);
      return { eventId: event.eventId, eventType: event.eventType, occurredAt: event.occurredAt, data: event.data } satisfies PaddleEventLike;
    } catch {
      return null;
    }
  },

  async createOrFindCustomer({ email, name, businessId }) {
    const paddle = client();
    try {
      const created = await paddle.customers.create({ email, name, customData: { business_id: businessId } });
      return { customerId: created.id };
    } catch (error) {
      // Paddle refuses a second customer with the same email and names the existing one.
      if (error instanceof ApiError && error.code === "customer_already_exists") {
        const fromDetail = /ctm_[a-z0-9]+/i.exec(error.detail ?? "")?.[0];
        if (fromDetail) return { customerId: fromDetail };
        const found = await paddle.customers.list({ email: [email] }).next();
        if (found[0]) return { customerId: found[0].id };
      }
      throw error;
    }
  },

  async createPortalSession(customerId, subscriptionIds) {
    const session = await client().customerPortalSessions.create(customerId, subscriptionIds);
    return { url: session.urls.general.overview };
  },
};
