"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, ExternalLink, LoaderCircle } from "lucide-react";
import { PlanCards } from "@/components/billing/plan-cards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type Status } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { openCheckout } from "@/lib/paddle-client";
import { PLANS, usageProgress, yearlySavingPercent, type BillingInterval, type PlanCurrency, type PlanKey } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { createCheckout, getBillingStatus, getCustomerPortalUrl } from "@/server/actions/billing";

export type BillingViewProps = {
  configured: boolean;
  currency: PlanCurrency;
  /** The plan in force (from effectivePlan). */
  plan: PlanKey;
  /** Raw subscription state, for wording only. */
  status: "none" | "trialing" | "active" | "past_due" | "paused" | "canceled";
  subscribedPlan: "pro" | "business" | null;
  cancelAtPeriodEnd: boolean;
  /** Pre-formatted dates (business timezone and locale). */
  trialEndsOn: string | null;
  trialDaysLeft: number | null;
  periodEndOn: string | null;
  hasCustomer: boolean;
  usage: { quotesSent: number; aiDrafts: number; quoteLimit: number | null; aiLimit: number; quoteWord: string };
  returnedFromCheckout: boolean;
};

const POLL_MS = 3000;
const POLL_FOR_MS = 30_000;

function pillFor(plan: PlanKey, status: BillingViewProps["status"]): { status: Status; label: string } {
  if (status === "past_due") return { status: "overdue", label: "Payment issue" };
  if (status === "canceled") return { status: "expired", label: plan === "free" ? "Ended" : "Cancelled" };
  if (status === "paused") return { status: "awaiting", label: "Paused" };
  if (plan === "trial") return { status: "viewed", label: "Free trial" };
  if (plan === "free") return { status: "draft", label: "Free" };
  return { status: "paid", label: "Active" };
}

function ProgressBar({ label, used, limit, detail }: { label: string; used: number; limit: number | null; detail: string }) {
  const p = usageProgress(used, limit);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body-strong">{label}</p>
        <p className="tabular text-small text-text-muted">{detail}</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? 100}
        aria-valuenow={limit === null ? 0 : Math.min(p.used, limit)}
        aria-valuetext={detail}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className={cn("h-full rounded-full", p.state === "full" ? "bg-status-bad-text" : p.state === "near" ? "bg-status-warn-text" : "bg-accent")} style={{ width: `${p.percent}%` }} />
      </div>
    </div>
  );
}

export function BillingView(props: BillingViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [pending, startTransition] = useTransition();
  const [sync, setSync] = useState<"idle" | "waiting" | "slow">(props.returnedFromCheckout ? "waiting" : "idle");
  const startedFrom = useRef({ plan: props.plan, status: props.status });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = yearlySavingPercent("pro", props.currency);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  /** Poll the server (webhook-fed) for up to 30 seconds. The browser callback itself never changes anything. */
  const startPolling = useCallback(() => {
    stopPolling();
    const deadline = Date.now() + POLL_FOR_MS;
    const tick = async () => {
      const result = await getBillingStatus();
      if (result.ok && (result.plan !== startedFrom.current.plan || result.status !== startedFrom.current.status)) {
        setSync("idle");
        toast.success("Your plan is updated.");
        router.refresh();
        return;
      }
      if (Date.now() >= deadline) return setSync("slow");
      pollTimer.current = setTimeout(tick, POLL_MS);
    };
    pollTimer.current = setTimeout(tick, POLL_MS);
  }, [router, stopPolling, toast]);

  useEffect(() => {
    if (props.returnedFromCheckout) startPolling();
    return stopPolling;
  }, [props.returnedFromCheckout, startPolling, stopPolling]);

  function upgrade(plan: "pro" | "business") {
    startTransition(async () => {
      const result = await createCheckout(plan, plan === "business" ? "month" : interval);
      if (!result.ok) return void toast.error(result.message);
      try {
        await openCheckout(result.checkout, (event) => {
          if (event.name === "checkout.completed") {
            startedFrom.current = { plan: props.plan, status: props.status };
            setSync("waiting");
            startPolling();
          }
        });
      } catch {
        toast.error("We couldn't open the payment window. Check your connection and try again.");
      }
    });
  }

  function openPortal() {
    startTransition(async () => {
      const result = await getCustomerPortalUrl();
      if (!result.ok) return void toast.error(result.message);
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  const pill = pillFor(props.plan, props.status);
  const subscribed = props.status === "active" || props.status === "trialing" || props.status === "past_due";
  const planName = PLANS[props.plan].name;
  const quoteDetail = props.usage.quoteLimit === null ? `${props.usage.quotesSent} sent, no limit` : `${props.usage.quotesSent} of ${props.usage.quoteLimit}`;

  return (
    <div className="space-y-6">
      {!props.configured ? (
        <p role="status" className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-[15px]">
          Billing is not configured yet. Everything else in Tradeslip works as normal.
        </p>
      ) : null}

      {sync !== "idle" ? (
        <div role="status" className="flex gap-3 rounded-lg border border-accent-border bg-accent-soft p-4">
          {sync === "waiting" ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-accent" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />}
          <div>
            <p className="text-body-strong">{sync === "waiting" ? "Payment received, updating your plan" : "Still updating your plan"}</p>
            <p className="text-small text-text-muted">
              {sync === "waiting" ? "This usually takes a few seconds." : "Your payment went through. It can take a minute for the confirmation to arrive."}
            </p>
            {sync === "slow" ? (
              <Button type="button" variant="secondary" className="mt-3" onClick={() => router.refresh()}>
                Check again
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-h2">{planName}</h2>
            <StatusPill status={pill.status}>{pill.label}</StatusPill>
          </div>
          {props.hasCustomer && props.configured ? (
            <Button type="button" variant="secondary" onClick={openPortal} disabled={pending}>
              <ExternalLink /> Manage subscription
            </Button>
          ) : null}
        </div>

        <div className="mt-3 space-y-1 text-body text-text-muted">
          {props.plan === "trial" && props.trialDaysLeft !== null ? (
            <p>
              {props.trialDaysLeft === 0 ? "Your free trial ends today" : props.trialDaysLeft === 1 ? "Your free trial ends in 1 day" : `Your free trial ends in ${props.trialDaysLeft} days`}
              {props.trialEndsOn ? ` (${props.trialEndsOn})` : ""}. You have Pro features until then, with no card needed.
            </p>
          ) : null}
          {props.plan === "free" && props.status === "none" ? <p>You&apos;re on the free plan. Upgrade any time for unlimited quotes and automatic reminders.</p> : null}
          {subscribed && props.periodEndOn ? (
            <p>{props.cancelAtPeriodEnd ? `Your subscription ends on ${props.periodEndOn}. You keep your plan until then.` : `Renews on ${props.periodEndOn}.`}</p>
          ) : null}
          {props.status === "canceled" && props.periodEndOn ? (
            <p>{props.plan === "free" ? `Your subscription ended on ${props.periodEndOn}. You're on the free plan.` : `Your subscription is cancelled. You keep your plan until ${props.periodEndOn}.`}</p>
          ) : null}
          {props.status === "paused" ? <p>Your subscription is paused, so you&apos;re on the free plan until it resumes.</p> : null}
        </div>

        {props.status === "past_due" ? (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-border bg-accent-soft p-4">
            <p className="text-body max-w-xl">
              We couldn&apos;t take your last payment. Your plan stays active for a few days while you update your payment method.
            </p>
            {props.configured && props.hasCustomer ? (
              <Button type="button" onClick={openPortal} disabled={pending}>
                Update payment method
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-h2 mb-4">Usage this month</h2>
        <div className="space-y-5">
          <ProgressBar label={`Sent ${props.usage.quoteWord.toLowerCase()}s`} used={props.usage.quotesSent} limit={props.usage.quoteLimit} detail={quoteDetail} />
          <ProgressBar label="Voice drafts" used={props.usage.aiDrafts} limit={props.usage.aiLimit} detail={`${props.usage.aiDrafts} of ${props.usage.aiLimit}`} />
        </div>
      </Card>

      <section aria-labelledby="plans-heading" id="plans" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-h2">
            Plans
          </h2>
          <div role="group" aria-label="Billing period" className="flex gap-2">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={interval === i}
                onClick={() => setInterval(i)}
                className={cn(
                  "text-label h-9 rounded-lg border px-3 transition-colors duration-150",
                  interval === i ? "border-accent-border bg-accent-soft text-accent" : "border-border-strong bg-surface text-text hover:bg-surface-muted",
                )}
              >
                {i === "month" ? "Monthly" : saving ? `Yearly (save ${saving}%)` : "Yearly"}
              </button>
            ))}
          </div>
        </div>

        <PlanCards
          currency={props.currency}
          interval={interval}
          current={props.plan === "trial" ? undefined : props.plan}
          action={(key) => {
            if (key === "free") return <Button type="button" variant="secondary" disabled className="w-full">{props.plan === "free" ? "Your current plan" : "Free forever"}</Button>;
            const paid = key as "pro" | "business";
            if (subscribed && props.subscribedPlan === paid) {
              return (
                <Button type="button" variant="secondary" className="w-full" onClick={openPortal} disabled={pending || !props.configured}>
                  Manage subscription
                </Button>
              );
            }
            if (subscribed) {
              return (
                <Button type="button" variant="secondary" className="w-full" onClick={openPortal} disabled={pending || !props.configured}>
                  Change in billing portal
                </Button>
              );
            }
            return (
              <Button type="button" className="w-full" onClick={() => upgrade(paid)} disabled={pending || !props.configured}>
                {pending ? "Opening..." : `Upgrade to ${PLANS[paid].name}`}
              </Button>
            );
          }}
        />
        <p className="text-small flex items-start gap-2 text-text-muted">
          <CircleCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Prices exclude any local sales tax or VAT, which Paddle adds at checkout. Cancel any time: you keep your plan until the end of the period you paid for.
        </p>
      </section>
    </div>
  );
}
