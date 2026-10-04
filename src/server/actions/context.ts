import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Business } from "@/lib/supabase/tables";
import { failure } from "@/lib/action-result";

/**
 * Common start for every server action: the signed-in user's Supabase client
 * (RLS applies) and their business. Business id always comes from here, never
 * from the request body.
 */
export async function actionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: failure("Your session has ended. Sign in again.") };
  return { ok: true as const, supabase, user };
}

export async function actionBusinessContext() {
  const ctx = await actionContext();
  if (!ctx.ok) return ctx;

  const { data } = await ctx.supabase.from("businesses").select("*").maybeSingle();
  const business: Business | null = data;
  if (!business) return { ok: false as const, error: failure("Finish setting up your business first.") };
  return { ...ctx, business };
}
