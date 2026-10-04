/** Return type for server actions: never throws for expected failures. */
export type ActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const failure = (message: string, fieldErrors?: Record<string, string>) =>
  ({ ok: false, message, fieldErrors }) as const;
