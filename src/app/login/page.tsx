import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/shell/logo";
import { Card } from "@/components/ui/card";
import { getUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · Tradeslip" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Enter your email to get a new one.",
  google: "Google sign-in didn't work. Try again, or use an email link instead.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, user] = await Promise.all([searchParams, getUser()]);
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card>
          <LoginForm
            googleEnabled={process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true"}
            initialError={error ? ERRORS[error] : undefined}
          />
        </Card>
      </div>
    </main>
  );
}
