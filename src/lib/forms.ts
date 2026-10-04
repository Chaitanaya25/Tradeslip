import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/** Flatten zod issues to `{ field: message }` (first message per field). */
export function fieldErrorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Minimal zod resolver for react-hook-form (flat forms). Keeps us off the extra
 * @hookform/resolvers dependency. Valid input returns the parsed (transformed) output.
 */
export function zodResolver<TInput extends FieldValues, TOutput>(
  schema: ZodType<TOutput, unknown>,
): Resolver<TInput, unknown, TOutput> {
  return async (values) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }

    const errors: Record<string, { type: string; message: string }> = {};
    for (const [key, message] of Object.entries(fieldErrorsFromIssues(result.error.issues))) {
      errors[key] = { type: "validation", message };
    }
    return { values: {}, errors: errors as FieldErrors<TInput> };
  };
}
