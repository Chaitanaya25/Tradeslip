"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setQuoteSchedule } from "@/server/actions/quote-schedule";

/** Job date and time for an accepted quote, in the business timezone. Shows on the dashboard on the day. */
export function ScheduleField({ quoteId, initial, timezone }: { quoteId: string; initial: { date: string; time: string } | null; timezone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "09:00");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function save(clear: boolean) {
    setErrors({});
    startTransition(async () => {
      const result = await setQuoteSchedule(quoteId, clear ? null : { date, time });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? { date: result.message });
        return void toast.error(result.message);
      }
      if (clear) {
        setDate("");
        setTime("09:00");
      }
      toast.success(clear ? "Schedule cleared." : "Job scheduled.");
      router.refresh();
    });
  }

  return (
    <Card>
      <h2 className="text-h2 mb-1">Schedule the job</h2>
      <p className="text-small mb-4 text-text-muted">Times are in your business timezone ({timezone.replace(/_/g, " ")}).</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="job-date" label="Date" error={errors.date}>
          <Input id="job-date" type="date" className="tabular" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date) || undefined} />
        </FormField>
        <FormField id="job-time" label="Time" error={errors.time}>
          <Input id="job-time" type="time" className="tabular" value={time} onChange={(e) => setTime(e.target.value)} aria-invalid={Boolean(errors.time) || undefined} />
        </FormField>
      </div>
      <div className="mt-4 flex gap-3">
        <Button type="button" onClick={() => save(false)} disabled={pending || !date || !time}>
          {pending ? "Saving..." : "Save schedule"}
        </Button>
        {initial ? (
          <Button type="button" variant="secondary" onClick={() => save(true)} disabled={pending}>
            Clear
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
