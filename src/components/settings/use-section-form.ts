"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver, type Path } from "react-hook-form";
import type { ZodType } from "zod";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { zodResolver } from "@/lib/forms";

/**
 * One independent settings form: validates with the shared zod schema, sends the
 * raw values to its server action, shows inline errors and a success toast.
 */
export function useSectionForm<TInput extends FieldValues>({
  schema,
  defaultValues,
  save,
  successMessage,
}: {
  schema: ZodType<unknown, TInput>;
  defaultValues: DefaultValues<TInput>;
  save: (values: TInput) => Promise<ActionResult>;
  successMessage: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const resolver = useMemo(() => zodResolver(schema) as unknown as Resolver<TInput>, [schema]);
  const form = useForm<TInput>({ resolver, defaultValues });

  const submit = form.handleSubmit(() => {
    setFormError(null);
    const raw = form.getValues();
    startTransition(async () => {
      const result = await save(raw);
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as Path<TInput>, { type: "server", message });
        }
        toast.error(result.message);
        return;
      }
      form.reset(raw);
      toast.success(successMessage);
    });
  });

  return { ...form, submit, pending, formError };
}
