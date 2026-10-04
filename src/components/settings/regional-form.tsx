"use client";

import { useEffect } from "react";
import { Controller, useWatch } from "react-hook-form";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionForm } from "@/components/settings/use-section-form";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PercentInput } from "@/components/ui/money-input";
import { Toggle } from "@/components/ui/toggle";
import { REGIONS, taxRegistrationLabel, type Country } from "@/lib/region";
import { regionalSchema, type RegionalInput } from "@/lib/schemas/settings";
import { updateRegional } from "@/server/actions/settings";

export function RegionalForm({ country, initial }: { country: Country; initial: RegionalInput }) {
  const region = REGIONS[country];
  const { register, control, submit, pending, formError, formState, getValues, setValue } =
    useSectionForm<RegionalInput>({
      schema: regionalSchema,
      defaultValues: initial,
      save: updateRegional,
      successMessage: "Regional and tax settings saved.",
    });
  const errors = formState.errors;
  const enabled = useWatch({ control, name: "tax_enabled" });

  // Suggest the usual rate the first time tax is switched on.
  useEffect(() => {
    if (enabled && getValues("tax_rate") === "" && region.defaultTaxBps > 0) {
      setValue("tax_rate", String(region.defaultTaxBps / 100));
    }
  }, [enabled, getValues, setValue, region.defaultTaxBps]);

  return (
    <SectionCard
      title="Regional and tax"
      description="Currency and tax wording follow your country."
      onSubmit={submit}
      pending={pending}
      formError={formError}
    >
      <div>
        <p className="text-label mb-1.5 text-text-muted">Country</p>
        <p className="text-body-strong">
          {region.name} <span className="text-body font-normal text-text-muted">({region.currency})</span>
        </p>
        <p className="text-small mt-1 text-text-muted">To change your country, contact support.</p>
      </div>

      <Controller
        control={control}
        name="tax_enabled"
        render={({ field }) => (
          <Toggle
            id="tax_enabled"
            label={taxRegistrationLabel(country)}
            description={`Adds ${region.taxLabel} to your quotes and invoices.`}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="tax_label" label="Tax name on documents" error={errors.tax_label?.message}>
          <Input id="tax_label" {...register("tax_label")} />
        </FormField>
        {enabled ? (
          <FormField id="tax_rate" label="Rate" error={errors.tax_rate?.message}>
            <PercentInput id="tax_rate" placeholder="8" {...register("tax_rate")} />
          </FormField>
        ) : null}
      </div>

      <FormField id="tax_number" label={region.businessIdLabel} error={errors.tax_number?.message}>
        <Input id="tax_number" autoComplete="off" {...register("tax_number")} />
      </FormField>
    </SectionCard>
  );
}
