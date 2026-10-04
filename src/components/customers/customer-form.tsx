"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fieldErrorsFromIssues } from "@/lib/forms";
import { REGIONS, type Country } from "@/lib/region";
import { customerInputSchema, type CustomerFormValues } from "@/lib/schemas/customer";
import { createCustomer, updateCustomer } from "@/server/actions/customers";

/** New and edit customer. Validates in the browser for speed; the server action validates again. */
export function CustomerForm({ customerId, initialValues, country }: { customerId: string | null; initialValues: CustomerFormValues; country: Country }) {
  const router = useRouter();
  const toast = useToast();
  const labels = REGIONS[country].address;
  const [values, setValues] = useState<CustomerFormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setDuplicate(null);
  };

  function submit(allowDuplicate: boolean) {
    setFormError(null);
    const payload: CustomerFormValues = { ...values, allow_duplicate: allowDuplicate };
    const check = customerInputSchema.safeParse(payload);
    if (!check.success) {
      setErrors(fieldErrorsFromIssues(check.error.issues));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = customerId ? await updateCustomer(customerId, payload) : await createCustomer(payload);
      if (!result.ok) {
        if (result.duplicate) return setDuplicate(result.duplicate);
        setErrors(result.fieldErrors ?? {});
        setFormError(result.message);
        return;
      }
      toast.success(customerId ? "Customer saved." : "Customer added.");
      router.push(`/customers/${result.customerId}`);
    });
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={customerId ? `/customers/${customerId}` : "/customers"}
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft className="size-6" strokeWidth={1.5} />
        </Link>
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em]">{customerId ? "Edit customer" : "Add customer"}</h1>
      </div>

      <form
        noValidate
        className="max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <Card className="space-y-5">
          <FormField id="name" label="Name" error={errors.name}>
            <Input id="name" autoComplete="off" value={values.name} onChange={set("name")} aria-invalid={Boolean(errors.name) || undefined} />
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="phone" label="Phone" error={errors.phone}>
              <Input id="phone" type="tel" autoComplete="off" value={values.phone} onChange={set("phone")} aria-invalid={Boolean(errors.phone) || undefined} />
            </FormField>
            <FormField id="email" label="Email" error={errors.email}>
              <Input id="email" type="email" autoComplete="off" value={values.email} onChange={set("email")} aria-invalid={Boolean(errors.email) || undefined} />
            </FormField>
          </div>

          <FormField id="address_line1" label="Address" error={errors.address_line1}>
            <Input id="address_line1" autoComplete="off" value={values.address_line1} onChange={set("address_line1")} />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField id="city" label="City" error={errors.city}>
              <Input id="city" autoComplete="off" value={values.city} onChange={set("city")} />
            </FormField>
            <FormField id="region" label={labels.regionLabel.replace(" (optional)", "")} error={errors.region}>
              <Input id="region" autoComplete="off" value={values.region} onChange={set("region")} />
            </FormField>
            <FormField id="postcode" label={labels.postcodeLabel} error={errors.postcode}>
              <Input id="postcode" autoComplete="off" value={values.postcode} onChange={set("postcode")} />
            </FormField>
          </div>

          <FormField id="notes" label="Notes" error={errors.notes} hint="Gate codes, pets, parking: anything that helps on the day.">
            <Textarea id="notes" rows={4} value={values.notes} onChange={set("notes")} />
          </FormField>

          {duplicate ? (
            <div role="alert" className="rounded-lg border border-accent-border bg-accent-soft p-4">
              <p className="text-body-strong">A customer with this name and phone already exists.</p>
              <p className="text-small mt-1 text-text-muted">
                <Link href={`/customers/${duplicate.id}`} className="font-medium text-accent hover:underline">
                  Open {duplicate.name}
                </Link>{" "}
                instead, or save this as a separate customer.
              </p>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => submit(true)} disabled={pending}>
                Save anyway
              </Button>
            </div>
          ) : null}

          {formError && !duplicate ? (
            <p role="alert" className="text-small text-destructive">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button asChild variant="secondary">
              <Link href={customerId ? `/customers/${customerId}` : "/customers"}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : customerId ? "Save changes" : "Add customer"}
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
