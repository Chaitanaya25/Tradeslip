"use client";

import { SectionCard } from "@/components/settings/section-card";
import { useSectionForm } from "@/components/settings/use-section-form";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { paymentLinkSchema, type PaymentLinkInput } from "@/lib/schemas/settings";
import { updatePaymentLink } from "@/server/actions/settings";

export function PaymentLinkForm({ initial }: { initial: PaymentLinkInput }) {
  const { register, submit, pending, formError, formState } = useSectionForm<PaymentLinkInput>({
    schema: paymentLinkSchema,
    defaultValues: initial,
    save: updatePaymentLink,
    successMessage: "Payment link saved.",
  });

  return (
    <SectionCard
      title="Payment link"
      description="Customers get a Pay button on invoices (and for deposits) that opens this link. Leave it blank to remove it."
      onSubmit={submit}
      pending={pending}
      formError={formError}
    >
      <FormField
        id="payment_link_url"
        label="Payment link"
        error={formState.errors.payment_link_url?.message}
        hint="Paste a Stripe, PayPal or Square payment link. It must start with https://"
      >
        <Input
          id="payment_link_url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://buy.stripe.com/..."
          {...register("payment_link_url")}
        />
      </FormField>
    </SectionCard>
  );
}
