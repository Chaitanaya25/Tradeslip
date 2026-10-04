"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const emailSchema = z.object({
  email: z.email("Enter a full email address, like name@example.com."),
});

async function appUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return (await headers()).get("origin") ?? "http://localhost:3000";
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({ email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }
  const email = parsed.data.email.toLowerCase();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await appUrl()}/auth/callback`, shouldCreateUser: true },
  });

  if (error) {
    // Server-side only. Booleans, never values.
    console.error("[sendMagicLink] signInWithOtp failed", {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    });
    const rateLimited = error.status === 429 || /rate limit|too many/i.test(error.message);
    return {
      status: "error",
      message: rateLimited
        ? "Too many sign-in emails just now. Wait a minute, then try again."
        : "We couldn't send the link. Check the address and try again.",
    };
  }

  return { status: "sent", email };
}

export async function signInWithGoogle(): Promise<void> {
  if (process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH !== "true") redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await appUrl()}/auth/callback` },
  });

  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
