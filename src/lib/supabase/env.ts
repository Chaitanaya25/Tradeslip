/**
 * Env reader with a clear error. Callers pass the value read from a literal
 * `process.env.NAME` so Next can inline NEXT_PUBLIC_* vars in client bundles.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * The project root, e.g. https://<ref>.supabase.co. Pasting the REST endpoint
 * (.../rest/v1/) or adding a trailing slash breaks auth, so keep only the origin.
 */
export function supabaseUrl(): string {
  const raw = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
    return url.origin;
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Use the project URL from Supabase, like https://<ref>.supabase.co",
    );
  }
}

export function supabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
