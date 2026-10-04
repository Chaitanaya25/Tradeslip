"use client";

import { Controller, useWatch } from "react-hook-form";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionForm } from "@/components/settings/use-section-form";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { SelectField } from "@/components/ui/select-field";
import { PAYMENT_TERMS_OPTIONS, QUOTE_VALIDITY_OPTIONS } from "@/lib/schemas/fields";
import { numberingSchema, type NumberingInput } from "@/lib/schemas/settings";
import { updateNumbering } from "@/server/actions/settings";

const terms = PAYMENT_TERMS_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` }));
const validity = QUOTE_VALIDITY_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` }));

export function NumberingForm({
  initial,
  currency,
  quoteWord,
  nextQuoteNumber,
  nextInvoiceNumber,
}: {
  initial: NumberingInput;
  currency: string;
  /** "Estimate" or "Quote", from the business's region. */
  quoteWord: string;
  nextQuoteNumber: number;
  nextInvoiceNumber: number;
}) {
  const { register, control, submit, pending, formError, formState } = useSectionForm<NumberingInput>({
    schema: numberingSchema,
    defaultValues: initial,
    save: updateNumbering,
    successMessage: "Numbering and defaults saved.",
  });
  const errors = formState.errors;
  const quotePrefix = (useWatch({ control, name: "quote_prefix" }) ?? "").trim();
  const invoicePrefix = (useWatch({ control, name: "invoice_prefix" }) ?? "").trim();

  return (
    <SectionCard
      title="Numbering and defaults"
      description="Prefixes for document numbers, and the values new quotes start with."
      onSubmit={submit}
      pending={pending}
      formError={formError}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="quote_prefix"
          label={`${quoteWord} prefix`}
          error={errors.quote_prefix?.message}
          hint={`Your next ${quoteWord.toLowerCase()} is ${quotePrefix}${nextQuoteNumber}.`}
        >
          <Input id="quote_prefix" autoComplete="off" placeholder="None" {...register("quote_prefix")} />
        </FormField>
        <FormField
          id="invoice_prefix"
          label="Invoice prefix"
          error={errors.invoice_prefix?.message}
          hint={`Your next invoice is ${invoicePrefix}${nextInvoiceNumber}.`}
        >
          <Input id="invoice_prefix" autoComplete="off" {...register("invoice_prefix")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="hourly_rate" label="Hourly rate" error={errors.hourly_rate?.message}>
          <MoneyInput id="hourly_rate" currency={currency} {...register("hourly_rate")} />
        </FormField>
        <FormField id="callout_fee" label="Call-out fee (optional)" error={errors.callout_fee?.message}>
          <MoneyInput id="callout_fee" currency={currency} {...register("callout_fee")} />
        </FormField>
        <FormField id="payment_terms_days" label="Payment terms" error={errors.payment_terms_days?.message}>
          <Controller
            control={control}
            name="payment_terms_days"
            render={({ field }) => (
              <SelectField id="payment_terms_days" value={field.value} onChange={field.onChange} options={terms} />
            )}
          />
        </FormField>
        <FormField id="quote_validity_days" label={`${quoteWord} valid for`} error={errors.quote_validity_days?.message}>
          <Controller
            control={control}
            name="quote_validity_days"
            render={({ field }) => (
              <SelectField id="quote_validity_days" value={field.value} onChange={field.onChange} options={validity} />
            )}
          />
        </FormField>
      </div>
    </SectionCard>
  );
}
