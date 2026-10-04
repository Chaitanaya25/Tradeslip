import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Browser client (anon key, RLS applies). Safe for client components. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
