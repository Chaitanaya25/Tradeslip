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
 * `{ "items.0.rate": "msg" }` -> `{ items: [ { rate: { type, message } } ] }`, the shape
 * react-hook-form expects for nested objects and field arrays.
 */
export function nestFieldErrors(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const keys = path.split(".");
    let node: Record<string, unknown> | unknown[] = root;
    keys.forEach((key, i) => {
      const last = i === keys.length - 1;
      const slot: string | number = Array.isArray(node) ? Number(key) : key;
      if (last) {
        (node as Record<string | number, unknown>)[slot] = { type: "validation", message };
        return;
      }
      const container = (node as Record<string | number, unknown>)[slot];
      if (container === undefined) {
        (node as Record<string | number, unknown>)[slot] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      }
      node = (node as Record<string | number, unknown>)[slot] as Record<string, unknown> | unknown[];
    });
  }
  return root;
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

    return {
      values: {},
      errors: nestFieldErrors(fieldErrorsFromIssues(result.error.issues)) as FieldErrors<TInput>,
    };
  };
}
