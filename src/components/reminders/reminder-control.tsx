"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { SendReminderDialog } from "@/components/reminders/send-reminder-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** "Reminders" card on a quote or invoice page: what is scheduled, plus a manual send when it makes sense. */
export function ReminderControl({
  entity,
  id,
  infoText,
  canSend,
  customerName,
  label,
  settingsHref = "/settings/reminders",
}: {
  entity: "quote" | "invoice";
  id: string;
  infoText: string | null;
  canSend: boolean;
  customerName: string | null;
  label: string;
  settingsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!infoText && !canSend) return null;
  return (
    <Card>
      <h2 className="text-h2 mb-2">Reminders</h2>
      {infoText ? <p className="text-body text-text-muted">{infoText}</p> : null}
      <p className="text-small mt-1 text-text-muted">
        Change how they work in <a href={settingsHref} className="font-medium text-accent hover:underline">Settings</a>.
      </p>
      {canSend ? (
        <>
          <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setOpen(true)}>
            <BellRing /> Send reminder now
          </Button>
          <SendReminderDialog open={open} onOpenChange={setOpen} entity={entity} id={id} customerName={customerName} label={label} />
        </>
      ) : null}
    </Card>
  );
}
