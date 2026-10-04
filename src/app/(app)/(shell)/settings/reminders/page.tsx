import { RecentReminders } from "@/components/settings/recent-reminders";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { requireBusiness } from "@/lib/auth/session";
import { defaultTemplates, planAllowsReminders } from "@/lib/reminders";
import { quoteWord } from "@/lib/region";
import { REGIONS } from "@/lib/region";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reminders · Settings · Tradeslip" };

export default async function ReminderSettingsPage() {
  const business = await requireBusiness();
  const supabase = await createClient();
  const { data: log } = await supabase
    .from("reminder_log")
    .select("id, created_at, entity_type, entity_id, kind, status, reason, number")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <ReminderSettingsForm
        allowed={planAllowsReminders(business.plan)}
        businessName={business.name}
        businessEmail={business.email}
        quoteWord={quoteWord(business.country)}
        defaults={defaultTemplates(business.country)}
        initial={{
          enabled: business.reminders_enabled,
          quote_followup_enabled: business.quote_followup_enabled,
          quote_followup_days: String(business.quote_followup_days),
          invoice_reminders_enabled: business.invoice_reminders_enabled,
          invoice_reminder_1_days: String(business.invoice_reminder_1_days),
          invoice_reminder_2_days: String(business.invoice_reminder_2_days),
          quote_followup_template: business.quote_followup_template ?? "",
          invoice_reminder_1_template: business.invoice_reminder_1_template ?? "",
          invoice_reminder_2_template: business.invoice_reminder_2_template ?? "",
        }}
      />
      <RecentReminders
        rows={log ?? []}
        locale={REGIONS[business.country].locale}
        timezone={business.timezone}
        quotePrefix={business.quote_prefix}
        invoicePrefix={business.invoice_prefix}
      />
    </div>
  );
}
