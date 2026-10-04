"use server";

import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import { priceIdFor, readBillingConfig, type PaddleEnvironment } from "@/lib/billing-config";
import { effectivePlanOf, type PlanKey } from "@/lib/plans";
import { checkRateLimits, userSubject } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/server/billing/provider";
import { appUrl } from "@/server/reminders/live";
import { actionBusinessContext } from "./context";

const NOT_CONFIGURED = "Billing is not configured yet.";

const checkoutInput = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
});

export type CheckoutDetails = {
  priceId: string;
  customerId: string;
  customerEmail: string;
  customData: { business_id: string };
  successUrl: string;
  environment: PaddleEnvironment;
  clientToken: string;
};

/**
 * Everything Paddle.js needs to open the checkout overlay. The price id is looked up here from OUR allow-list
 * (never taken from the browser), and the Paddle customer is created first and stored on the business so the
 * webhook can cross-check it. Nothing here changes the plan: only the verified webhook does.
 */
export async function createCheckout(plan: string, interval: string): Promise<ActionResult<{ checkout: CheckoutDetails }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;

  const input = checkoutInput.safeParse({ plan, interval });
  if (!input.success) return failure("Choose a plan and a billing period.");

  const config = readBillingConfig();
  if (!config) return failure(NOT_CONFIGURED);

  const priceId = priceIdFor(input.data.plan, input.data.interval, config);
  if (!priceId) return failure("That plan isn't sold with that billing period.");

  const { allowed } = await checkRateLimits([{ subject: userSubject(ctx.user.id), key: "billing", limit: 10 }]);
  if (!allowed) return failure("Too many attempts. Wait a minute and try again.");

  const { business } = ctx;
  if (["active", "trialing", "past_due"].includes(business.subscription_status)) {
    return failure("You already have a subscription. Use Manage subscription to change or cancel it.");
  }
  const email = ctx.user.email?.trim();
  if (!email) return failure("Your account needs an email address before you can subscribe.");

  let customerId = business.paddle_customer_id;
  if (!customerId) {
    try {
      customerId = (await getProvider().createOrFindCustomer({ email, name: business.name, businessId: business.id })).customerId;
    } catch {
      return failure("We couldn't reach the payment provider. Try again in a moment.");
    }
    // Stored before checkout opens: the webhook only accepts events for a customer we created for this business.
    const { error } = await createAdminClient().from("businesses").update({ paddle_customer_id: customerId }).eq("id", business.id);
    if (error) return failure("We couldn't start checkout. Try again.");
  }

  // Business-level audit trail (no payment data).
  await ctx.supabase.from("activity").insert({
    business_id: business.id,
    entity_type: "business",
    entity_id: business.id,
    event: "billing.checkout_started",
    meta: { plan: input.data.plan, interval: input.data.interval },
  });

  return {
    ok: true,
    checkout: {
      priceId,
      customerId,
      customerEmail: email,
      customData: { business_id: business.id },
      successUrl: `${appUrl()}/settings/billing?checkout=success`,
      environment: config.environment,
      clientToken: config.clientToken,
    },
  };
}

/** The provider-hosted page for payment method, invoices and cancellation. Needs a customer we created. */
export async function getCustomerPortalUrl(): Promise<ActionResult<{ url: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!readBillingConfig()) return failure(NOT_CONFIGURED);

  const { allowed } = await checkRateLimits([{ subject: userSubject(ctx.user.id), key: "billing", limit: 10 }]);
  if (!allowed) return failure("Too many attempts. Wait a minute and try again.");

  const { business } = ctx;
  if (!business.paddle_customer_id) return failure("There's no subscription to manage yet.");
  try {
    const { url } = await getProvider().createPortalSession(business.paddle_customer_id, business.paddle_subscription_id ? [business.paddle_subscription_id] : []);
    return { ok: true, url };
  } catch {
    return failure("We couldn't open the billing portal. Try again in a moment.");
  }
}

/** For the "updating your plan" poll after checkout: what is in force now. The webhook, not the browser, decides it. */
export async function getBillingStatus(): Promise<ActionResult<{ plan: PlanKey; status: string }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  return { ok: true, plan: effectivePlanOf(ctx.business), status: ctx.business.subscription_status };
}
