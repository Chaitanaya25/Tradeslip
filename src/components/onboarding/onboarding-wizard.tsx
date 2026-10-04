"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { LogoPicker } from "@/components/onboarding/logo-picker";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MoneyInput, PercentInput } from "@/components/ui/money-input";
import { SelectField } from "@/components/ui/select-field";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { zodResolver } from "@/lib/forms";
import { REGIONS, taxRegistrationLabel, type Country } from "@/lib/region";
import {
  COUNTRIES,
  regionDefaults,
  step1Schema,
  step2Schema,
  step3Schema,
  type OnboardingInput,
} from "@/lib/schemas/onboarding";
import { PAYMENT_TERMS_OPTIONS, QUOTE_VALIDITY_OPTIONS } from "@/lib/schemas/fields";
import { uploadLogo } from "@/lib/supabase/logo-upload";
import { TRADES } from "@/lib/trade-seeds";
import { completeOnboarding, saveBusinessStep } from "@/server/actions/onboarding";

const STEPS = [
  { title: "Your business", description: "Tell us who your customers are hiring." },
  { title: "Pricing defaults", description: "These pre-fill your quotes. You can change them any time." },
  { title: "Payment link", description: "Optional. Customers get a Pay button when you add one." },
] as const;

const STEP_FIELDS: Record<1 | 2 | 3, (keyof OnboardingInput)[]> = {
  1: ["name", "trade", "country", "phone", "email"],
  2: ["hourly_rate", "callout_fee", "tax_registered", "tax_rate", "tax_number", "payment_terms_days", "quote_validity_days"],
  3: ["payment_link_url"],
};

type StepNumber = 1 | 2 | 3;

const tradeOptions = TRADES.map((t) => ({ value: t, label: t }));
const countryOptions = COUNTRIES.map((c) => ({ value: c, label: REGIONS[c].name }));
const termsOptions = PAYMENT_TERMS_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` }));
const validityOptions = QUOTE_VALIDITY_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` }));

function stepOfField(field: string): StepNumber {
  for (const step of [1, 2, 3] as StepNumber[]) {
    if ((STEP_FIELDS[step] as string[]).includes(field)) return step;
  }
  return 1;
}

export function OnboardingWizard({
  initialValues,
  initialLogoUrl,
}: {
  initialValues: OnboardingInput;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<StepNumber>(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // One resolver per step, so each screen validates only its own fields.
  const resolvers = useMemo(
    () => ({
      1: zodResolver(step1Schema),
      2: zodResolver(step2Schema),
      3: zodResolver(step3Schema),
    }),
    [],
  );

  const form = useForm<OnboardingInput>({
    defaultValues: initialValues,
    resolver: resolvers[step] as unknown as Resolver<OnboardingInput>,
    mode: "onSubmit",
    reValidateMode: "onBlur",
  });
  const { register, control, handleSubmit, setValue, getValues, setError, formState } = form;
  const errors = formState.errors;

  const country = useWatch({ control, name: "country" }) as Country;
  const region = REGIONS[country] ?? REGIONS.US;
  const taxRegistered = useWatch({ control, name: "tax_registered" });
  const businessName = useWatch({ control, name: "name" });

  // Capture the browser timezone once; the server validates it.
  useEffect(() => {
    setValue("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, [setValue]);

  // Suggest the region's usual tax rate when the toggle or country changes.
  const lastDefault = useRef(regionDefaults(country).taxRatePercent);
  useEffect(() => {
    const next = regionDefaults(country).taxRatePercent;
    const current = getValues("tax_rate");
    if (current === "" || current === lastDefault.current) setValue("tax_rate", taxRegistered ? next : current);
    lastDefault.current = next;
  }, [country, taxRegistered, getValues, setValue]);

  const idLabel = region.businessIdLabel.toLowerCase().includes("optional")
    ? region.businessIdLabel
    : `${region.businessIdLabel} (optional)`;

  function applyServerErrors(fieldErrors: Record<string, string> | undefined, message: string) {
    setFormError(message);
    if (!fieldErrors) return;
    let earliest: StepNumber = 3;
    for (const [field, text] of Object.entries(fieldErrors)) {
      setError(field as keyof OnboardingInput, { type: "server", message: text });
      earliest = Math.min(earliest, stepOfField(field)) as StepNumber;
    }
    setStep(earliest);
  }

  const continueFromStep1 = handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const values = getValues();
      const saved = await saveBusinessStep({
        name: values.name,
        trade: values.trade,
        country: values.country,
        phone: values.phone,
        email: values.email,
        timezone: values.timezone,
      });
      if (!saved.ok) return applyServerErrors(saved.fieldErrors, saved.message);

      if (logoFile) {
        const uploaded = await uploadLogo(logoFile, saved.businessId);
        if (uploaded.ok) {
          setLogoFile(null);
        } else {
          toast.error(`${uploaded.message} You can add your logo later in Settings.`);
        }
      }
      setStep(2);
    });
  });

  const continueFromStep2 = handleSubmit(() => {
    setFormError(null);
    setStep(3);
  });

  function finish() {
    setFormError(null);
    startTransition(async () => {
      const result = await completeOnboarding(getValues());
      if (!result.ok) return applyServerErrors(result.fieldErrors, result.message);
      router.replace("/dashboard");
      router.refresh();
    });
  }

  const finishFromStep3 = handleSubmit(() => finish());

  function skipPaymentLink() {
    setValue("payment_link_url", "");
    finish();
  }

  function back() {
    setFormError(null);
    setStep((s) => (s > 1 ? ((s - 1) as StepNumber) : s));
  }

  const current = STEPS[step - 1];
  const onSubmit = step === 1 ? continueFromStep1 : step === 2 ? continueFromStep2 : finishFromStep3;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="mb-4" role="group" aria-label="Setup progress">
          <p className="text-label mb-2 text-text-muted">
            Step {step} of {STEPS.length}
          </p>
          <div
            className="flex gap-2"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step}
            aria-valuetext={`Step ${step} of ${STEPS.length}: ${current.title}`}
          >
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-border-strong"}`}
              />
            ))}
          </div>
        </div>

        <Card>
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div>
              <h1 className="text-h2">{current.title}</h1>
              <p className="text-body text-text-muted">{current.description}</p>
            </div>

            {step === 1 ? (
              <>
                <FormField id="name" label="Business name" error={errors.name?.message}>
                  <Input id="name" autoComplete="organization" placeholder="Miller Plumbing" {...register("name")} />
                </FormField>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="trade" label="Trade" error={errors.trade?.message}>
                    <Controller
                      control={control}
                      name="trade"
                      render={({ field }) => (
                        <SelectField
                          id="trade"
                          value={field.value}
                          onChange={field.onChange}
                          options={tradeOptions}
                          placeholder="Choose your trade"
                          invalid={Boolean(errors.trade)}
                        />
                      )}
                    />
                  </FormField>
                  <FormField id="country" label="Country" error={errors.country?.message}>
                    <Controller
                      control={control}
                      name="country"
                      render={({ field }) => (
                        <SelectField
                          id="country"
                          value={field.value}
                          onChange={field.onChange}
                          options={countryOptions}
                          invalid={Boolean(errors.country)}
                        />
                      )}
                    />
                  </FormField>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="phone" label="Phone" error={errors.phone?.message}>
                    <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(413) 555-0142" {...register("phone")} />
                  </FormField>
                  <FormField id="email" label="Business email" error={errors.email?.message}>
                    <Input id="email" type="email" autoComplete="email" inputMode="email" {...register("email")} />
                  </FormField>
                </div>

                <div>
                  <p className="text-label mb-1.5 text-text-muted">Logo (optional)</p>
                  <LogoPicker
                    name={businessName}
                    currentUrl={logoUrl}
                    file={logoFile}
                    busy={pending}
                    onSelect={(file) => setLogoFile(file)}
                    onRemove={() => {
                      setLogoFile(null);
                      setLogoUrl(null);
                    }}
                  />
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="hourly_rate" label="Hourly rate" error={errors.hourly_rate?.message}>
                    <MoneyInput id="hourly_rate" currency={region.currency} placeholder="95.00" {...register("hourly_rate")} />
                  </FormField>
                  <FormField id="callout_fee" label="Call-out fee (optional)" error={errors.callout_fee?.message}>
                    <MoneyInput id="callout_fee" currency={region.currency} placeholder="45.00" {...register("callout_fee")} />
                  </FormField>
                </div>

                <div className="space-y-4 rounded-lg border border-border bg-surface-muted p-4">
                  <Controller
                    control={control}
                    name="tax_registered"
                    render={({ field }) => (
                      <Toggle
                        id="tax_registered"
                        label={taxRegistrationLabel(country)}
                        description={`Adds ${region.taxLabel} to your quotes and invoices.`}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                  {taxRegistered ? (
                    <FormField id="tax_rate" label={`${region.taxLabel} rate`} error={errors.tax_rate?.message}>
                      <PercentInput id="tax_rate" placeholder={region.defaultTaxBps ? String(region.defaultTaxBps / 100) : "8"} {...register("tax_rate")} />
                    </FormField>
                  ) : null}
                  <FormField id="tax_number" label={idLabel} error={errors.tax_number?.message}>
                    <Input id="tax_number" autoComplete="off" {...register("tax_number")} />
                  </FormField>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="payment_terms_days" label="Payment terms" error={errors.payment_terms_days?.message}>
                    <Controller
                      control={control}
                      name="payment_terms_days"
                      render={({ field }) => (
                        <SelectField id="payment_terms_days" value={field.value} onChange={field.onChange} options={termsOptions} />
                      )}
                    />
                  </FormField>
                  <FormField id="quote_validity_days" label="Quote valid for" error={errors.quote_validity_days?.message}>
                    <Controller
                      control={control}
                      name="quote_validity_days"
                      render={({ field }) => (
                        <SelectField id="quote_validity_days" value={field.value} onChange={field.onChange} options={validityOptions} />
                      )}
                    />
                  </FormField>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <FormField
                id="payment_link_url"
                label="Payment link"
                error={errors.payment_link_url?.message}
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
            ) : null}

            {formError ? (
              <p role="alert" className="text-small text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              {step > 1 ? (
                <Button type="button" variant="secondary" onClick={back} disabled={pending}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                {step === 3 ? (
                  <Button type="button" variant="ghost" onClick={skipPaymentLink} disabled={pending}>
                    Skip for now
                  </Button>
                ) : null}
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving..." : step === 3 ? "Finish setup" : "Continue"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
