import type { LimitKind } from "./plans";

/** Return type for server actions: never throws for expected failures. */
export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string>;
      /** Set when a plan limit is the reason, so the UI can show the upgrade dialog instead of plain text. */
      limit?: LimitKind;
    };

export const failure = (message: string, fieldErrors?: Record<string, string>) =>
  ({ ok: false, message, fieldErrors }) as const;

/** A refusal because of the plan (the server enforces it; the UI uses `limit` to offer an upgrade). */
export const limitFailure = (limit: LimitKind, message: string) => ({ ok: false, message, limit }) as const;
