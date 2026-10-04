import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the magic link and Google sign-in: swaps the one-time code
// for a session cookie, then sends the user to onboarding or the dashboard.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.redirect(`${origin}/login?error=link`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=link`);

  // RLS means this can only ever return the signed-in user's own business.
  const { data: business } = await supabase
    .from("businesses")
    .select("onboarded_at")
    .maybeSingle();

  const destination = business?.onboarded_at ? "/dashboard" : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
