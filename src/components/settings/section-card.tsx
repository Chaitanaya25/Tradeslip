import type { FormEventHandler, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** A settings section: title, fields, and its own Save button. */
export function SectionCard({
  title,
  description,
  onSubmit,
  pending,
  formError,
  children,
}: {
  title: string;
  description?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  formError?: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <h2 className="text-h2">{title}</h2>
          {description ? <p className="text-body text-text-muted">{description}</p> : null}
        </div>
        {children}
        {formError ? (
          <p role="alert" className="text-small text-destructive">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
