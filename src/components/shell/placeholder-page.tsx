import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/server/actions/auth";

/** Temporary page body for routes whose real UI arrives in a later phase. */
export function PlaceholderPage({
  title,
  email,
  children,
}: {
  title: string;
  email: string | undefined;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-8">
      <Logo className="mb-8" />
      <Card className="space-y-5">
        <div>
          <h1 className="text-display">{title}</h1>
          <p className="text-body text-text-muted">
            Signed in as <span className="text-body-strong text-text">{email ?? "unknown"}</span>
          </p>
        </div>
        {children}
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </Card>
    </main>
  );
}
