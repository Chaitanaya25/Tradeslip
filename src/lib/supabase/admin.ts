import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { requireEnv, supabaseUrl } from "./env";

/**
 * Service-role client. BYPASSES RLS — server code only, and only for the
 * whitelisted public-page reads, webhooks and cron jobs.
 */
export function createAdminClient() {
  return createClient<Database>(
    supabaseUrl(),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
