import "server-only";
import type { PaddleEventLike } from "@/lib/billing";
import { paddleProvider } from "./paddle";

/**
 * The billing provider behind one small interface, so Paddle can be swapped. Everything outside server/billing/
 * talks to this, never to the provider's SDK.
 */
export interface BillingProvider {
  /** True when the environment has everything checkout needs. */
  isConfigured(): boolean;
  /**
   * Verify a webhook against its signature and return the event, or null when the signature is missing,
   * wrong or too old. Unverified bodies are never parsed or processed.
   */
  verifyWebhook(rawBody: string, signature: string | null): Promise<PaddleEventLike | null>;
  /** The provider's customer for this business: created with our business id in its custom data, or the existing one for the email. */
  createOrFindCustomer(input: { email: string; name: string; businessId: string }): Promise<{ customerId: string }>;
  /** A link to the provider-hosted page where the customer manages payment method, invoices and cancellation. */
  createPortalSession(customerId: string, subscriptionIds: string[]): Promise<{ url: string }>;
}

export function getProvider(): BillingProvider {
  return paddleProvider;
}
