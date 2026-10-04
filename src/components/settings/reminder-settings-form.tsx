"use client";

import { useState, useTransition } from "react";
import { Controller, useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { SectionCard } from "@/components/settings/section-card";
import { useSectionForm } from "@/components/settings/use-section-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  MAX_TEMPLATE_LENGTH,
  SAMPLE_VALUES,
  TEMPLATE_TOKENS,
  TEMPLATE_TOKEN_HELP,
  bodyParagraphs,
  replaceTokens,
  templateOrDefault,
  type DefaultTemplates,
  type ReminderKind,
} from "@/lib/reminders";
import { reminderSettingsSchema, type ReminderSettingsFormValues } from "@/lib/schemas/reminders";
import { saveReminderSettings, sendTestReminder } from "@/server/actions/reminders";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ value: String(from + i), label: `${from + i} ${from + i === 1 ? "day" : "days"}` }));
const QUOTE_DAYS = range(1, 14);
const FIRST_DAYS = range(1, 14);
const SECOND_DAYS = range(3, 30);

type TemplateField = "quote_followup_template" | "invoice_reminder_1_template" | "invoice_reminder_2_template";

const TEMPLATES: { field: TemplateField; kind: ReminderKind; title: string; hint: string }[] = [
  { field: "quote_followup_template", kind: "quote_followup", title: "Quote follow-up", hint: "Sent once, a few days after you send a quote that hasn't been answered." },
  { field: "invoice_reminder_1_template", kind: "invoice_reminder_1", title: "First invoice reminder", hint: "A gentle nudge soon after the due date." },
  { field: "invoice_reminder_2_template", kind: "invoice_reminder_2", title: "Second invoice reminder", hint: "Firmer, but still polite. The last one." },
];

type TestState = { status: "idle" } | { status: "sending" } | { status: "ok"; message: string } | { status: "error"; message: string };

function TemplateEditor({
  field,
  kind,
  title,
  hint,
  control,
  setValue,
  register,
  error,
  defaults,
  businessName,
  quoteWord,
  disabled,
}: {
  field: TemplateField;
  kind: ReminderKind;
  title: string;
  hint: string;
  control: Control<ReminderSettingsFormValues>;
  setValue: UseFormSetValue<ReminderSettingsFormValues>;
  register: ReturnType<typeof useSectionForm<ReminderSettingsFormValues>>["register"];
  error?: string;
  defaults: DefaultTemplates;
  businessName: string;
  quoteWord: string;
  disabled: boolean;
}) {
  const value = useWatch({ control, name: field }) ?? "";
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const preview = bodyParagraphs(
    replaceTokens(templateOrDefault(value, defaults[kind]), { ...SAMPLE_VALUES, business_name: businessName, document_word: kind === "quote_followup" ? quoteWord.toLowerCase() : "invoice" }, { escape: false }),
  );

  function sendTest() {
    setTest({ status: "sending" });
    startTransition(async () => {
      const result = await sendTestReminder(kind, value);
      setTest(result.ok ? { status: "ok", message: result.message } : { status: "error", message: result.message });
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-body-strong">{title}</h3>
          <p className="text-small text-text-muted">{hint}</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => setValue(field, "", { shouldDirty: true })} disabled={disabled || value.trim() === ""}>
          Reset to default
        </Button>
      </div>

      <FormField id={field} label="Message" error={error} hint={value.trim() === "" ? "Using the default message shown in the preview. Type here to write your own." : undefined}>
        <Textarea id={field} rows={6} maxLength={MAX_TEMPLATE_LENGTH + 100} disabled={disabled} placeholder={defaults[kind]} {...register(field)} />
      </FormField>

      <div className="rounded-lg bg-surface-muted p-4">
        <p className="text-label mb-2 text-text-muted">Preview with sample details</p>
        <div className="space-y-2 text-[15px] leading-[22px]">
          {preview.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={sendTest} disabled={disabled || pending}>
          <Send /> {test.status === "sending" ? "Sending..." : "Send me a test reminder"}
        </Button>
        {test.status === "ok" ? (
          <p role="status" className="text-small flex gap-2 text-status-good-text">
            <CircleCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {test.message}
          </p>
        ) : null}
        {test.status === "error" ? (
          <p role="alert" className="text-small flex gap-2 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {test.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ReminderSettingsForm({
  initial,
  defaults,
  businessName,
  quoteWord,
  allowed,
  businessEmail,
}: {
  initial: ReminderSettingsFormValues;
  defaults: DefaultTemplates;
  businessName: string;
  quoteWord: string;
  /** False on the free plan: the controls are disabled and the server refuses to switch anything on. */
  allowed: boolean;
  businessEmail: string | null;
}) {
  const { register, control, setValue, submit, pending, formError, formState } = useSectionForm<ReminderSettingsFormValues>({
    schema: reminderSettingsSchema,
    defaultValues: initial,
    save: saveReminderSettings,
    successMessage: "Reminder settings saved.",
  });
  const errors = formState.errors;
  const master = useWatch({ control, name: "enabled" });
  const disabled = !allowed;
  const off = disabled || !master;

  return (
    <SectionCard
      title="Reminders"
      description="Polite automatic emails to your customers. Each is sent once, between 8am and 6pm in your timezone, and never for paid, accepted or declined items."
      onSubmit={submit}
      pending={pending || disabled}
      formError={formError}
    >
      {disabled ? (
        <p role="status" className="rounded-lg border border-accent-border bg-accent-soft px-4 py-3 text-[15px]">
          Automatic reminders are part of the Pro plan and the free trial. Upgrade to switch them on. You can still send a reminder by hand once you&apos;re on a paid plan.
        </p>
      ) : null}

      <Controller
        control={control}
        name="enabled"
        render={({ field }) => (
          <Toggle id="enabled" label="Send automatic reminders" description="The master switch for everything below." checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
        )}
      />

      <div className="space-y-4 border-t border-border pt-5">
        <Controller
          control={control}
          name="quote_followup_enabled"
          render={({ field }) => (
            <Toggle id="quote_followup_enabled" label={`Follow up on unanswered ${quoteWord.toLowerCase()}s`} description="One polite email if the customer hasn't replied." checked={field.value} onCheckedChange={field.onChange} disabled={off} />
          )}
        />
        <FormField id="quote_followup_days" label="Wait before following up" error={errors.quote_followup_days?.message} className="max-w-xs">
          <Controller control={control} name="quote_followup_days" render={({ field }) => <SelectField id="quote_followup_days" value={field.value} onChange={field.onChange} options={QUOTE_DAYS} disabled={off} />} />
        </FormField>
      </div>

      <div className="space-y-4 border-t border-border pt-5">
        <Controller
          control={control}
          name="invoice_reminders_enabled"
          render={({ field }) => (
            <Toggle id="invoice_reminders_enabled" label="Remind customers about overdue invoices" description="Up to two emails, counted from the due date." checked={field.value} onCheckedChange={field.onChange} disabled={off} />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="invoice_reminder_1_days" label="First reminder, after the due date" error={errors.invoice_reminder_1_days?.message}>
            <Controller control={control} name="invoice_reminder_1_days" render={({ field }) => <SelectField id="invoice_reminder_1_days" value={field.value} onChange={field.onChange} options={FIRST_DAYS} disabled={off} />} />
          </FormField>
          <FormField id="invoice_reminder_2_days" label="Second reminder, after the due date" error={errors.invoice_reminder_2_days?.message}>
            <Controller control={control} name="invoice_reminder_2_days" render={({ field }) => <SelectField id="invoice_reminder_2_days" value={field.value} onChange={field.onChange} options={SECOND_DAYS} disabled={off} />} />
          </FormField>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <p className="text-label mb-2 text-text-muted">Words you can use in a message</p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {TEMPLATE_TOKENS.map((t) => (
            <li key={t} className="text-small">
              <code className="rounded bg-surface-muted px-1">{`{${t}}`}</code> <span className="text-text-muted">{TEMPLATE_TOKEN_HELP[t]}</span>
            </li>
          ))}
        </ul>
        <p className="text-small mt-3 text-text-muted">Plain text only. Leave a message empty to use the default. Every email also has a button to the {quoteWord.toLowerCase()} or invoice and a link to stop reminders.</p>
      </div>

      {TEMPLATES.map((t) => (
        <TemplateEditor
          key={t.field}
          {...t}
          control={control}
          setValue={setValue}
          register={register}
          error={errors[t.field]?.message}
          defaults={defaults}
          businessName={businessName}
          quoteWord={quoteWord}
          disabled={disabled}
        />
      ))}

      <p className="text-small text-text-muted">Test reminders go to {businessEmail ? <strong>{businessEmail}</strong> : "your business email (add one in Business profile)"} only, up to 3 an hour.</p>
    </SectionCard>
  );
}
