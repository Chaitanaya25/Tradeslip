"use client";

import { Controller } from "react-hook-form";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionForm } from "@/components/settings/use-section-form";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { profileSchema, type ProfileInput } from "@/lib/schemas/settings";
import { TRADES } from "@/lib/trade-seeds";
import { updateProfile } from "@/server/actions/settings";

const tradeOptions = TRADES.map((t) => ({ value: t, label: t }));

export function ProfileForm({
  initial,
  regionLabel,
  postcodeLabel,
}: {
  initial: ProfileInput;
  regionLabel: string;
  postcodeLabel: string;
}) {
  const { register, control, submit, pending, formError, formState } = useSectionForm<ProfileInput>({
    schema: profileSchema,
    defaultValues: initial,
    save: updateProfile,
    successMessage: "Business profile saved.",
  });
  const errors = formState.errors;

  return (
    <SectionCard
      title="Business profile"
      description="How your business appears to customers."
      onSubmit={submit}
      pending={pending}
      formError={formError}
    >
      <FormField id="owner_name" label="Your name" error={errors.owner_name?.message} hint="Shown in the menu at the bottom of the sidebar.">
        <Input id="owner_name" autoComplete="name" {...register("owner_name")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="name" label="Business name" error={errors.name?.message}>
          <Input id="name" autoComplete="organization" {...register("name")} />
        </FormField>
        <FormField id="trade" label="Trade" error={errors.trade?.message}>
          <Controller
            control={control}
            name="trade"
            render={({ field }) => (
              <SelectField id="trade" value={field.value} onChange={field.onChange} options={tradeOptions} placeholder="Choose your trade" />
            )}
          />
        </FormField>
        <FormField id="phone" label="Phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" {...register("phone")} />
        </FormField>
        <FormField id="email" label="Business email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" inputMode="email" {...register("email")} />
        </FormField>
      </div>
      <FormField id="address_line1" label="Address" error={errors.address_line1?.message}>
        <Input id="address_line1" autoComplete="address-line1" {...register("address_line1")} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-3">
        <FormField id="city" label="City" error={errors.city?.message}>
          <Input id="city" autoComplete="address-level2" {...register("city")} />
        </FormField>
        <FormField id="region" label={regionLabel} error={errors.region?.message}>
          <Input id="region" autoComplete="address-level1" {...register("region")} />
        </FormField>
        <FormField id="postcode" label={postcodeLabel} error={errors.postcode?.message}>
          <Input id="postcode" autoComplete="postal-code" {...register("postcode")} />
        </FormField>
      </div>
    </SectionCard>
  );
}
