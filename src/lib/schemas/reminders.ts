import { z } from "zod";
import { MAX_TEMPLATE_LENGTH } from "../reminders";
import { Check } from "./fields";

/** Settings > Reminders form. Raw strings in (selects hold text), numbers and null-for-default out. */
export const reminderSettingsSchema = z
  .object({
    enabled: z.boolean(),
    quote_followup_enabled: z.boolean(),
    quote_followup_days: z.string(),
    invoice_reminders_enabled: z.boolean(),
    invoice_reminder_1_days: z.string(),
    invoice_reminder_2_days: z.string(),
    quote_followup_template: z.string(),
    invoice_reminder_1_template: z.string(),
    invoice_reminder_2_template: z.string(),
  })
  .transform((v, ctx) => {
    const c = new Check();

    const range = (path: string, value: string, min: number, max: number, label: string): number => {
      const n = Number(value);
      if (!/^\d{1,2}$/.test(value.trim()) || n < min || n > max) {
        c.fail(path, `Choose ${label} between ${min} and ${max}.`);
        return min;
      }
      return n;
    };

    /** Blank means "use the default". No HTML: a template is plain text with {tokens}. */
    const template = (path: string, value: string): string | null => {
      const text = value.replace(/\r\n/g, "\n").trim();
      if (text === "") return null;
      if (text.length > MAX_TEMPLATE_LENGTH) c.fail(path, `That is too long (max ${MAX_TEMPLATE_LENGTH} characters).`);
      else if (/[<>]/.test(text)) c.fail(path, "Use plain text only: no < or > characters.");
      return text;
    };

    const first = range("invoice_reminder_1_days", v.invoice_reminder_1_days, 1, 14, "the days for the first reminder");
    const second = range("invoice_reminder_2_days", v.invoice_reminder_2_days, 3, 30, "the days for the second reminder");
    if (second <= first) c.fail("invoice_reminder_2_days", "The second reminder must come after the first.");

    const out = {
      enabled: v.enabled,
      quote_followup_enabled: v.quote_followup_enabled,
      quote_followup_days: range("quote_followup_days", v.quote_followup_days, 1, 14, "the days to wait"),
      invoice_reminders_enabled: v.invoice_reminders_enabled,
      invoice_reminder_1_days: first,
      invoice_reminder_2_days: second,
      quote_followup_template: template("quote_followup_template", v.quote_followup_template),
      invoice_reminder_1_template: template("invoice_reminder_1_template", v.invoice_reminder_1_template),
      invoice_reminder_2_template: template("invoice_reminder_2_template", v.invoice_reminder_2_template),
    };
    return c.done(ctx, out);
  });

export type ReminderSettingsFormValues = z.input<typeof reminderSettingsSchema>;
export type ReminderSettingsInput = z.output<typeof reminderSettingsSchema>;
