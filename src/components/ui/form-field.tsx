import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label above, control, optional hint, then the inline error (text, not colour alone). */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-small mt-1.5 text-text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={cn("text-small mt-1.5 text-destructive")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
