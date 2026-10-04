import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The verified signed-in user, or null. Cached per request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** For server pages and actions: redirects to /login when signed out. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** The signed-in user's business (RLS only lets them see their own), or null. */
export const getBusiness = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, onboarded_at")
    .maybeSingle();
  return data;
});
