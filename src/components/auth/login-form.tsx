"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signInWithGoogle, type LoginState } from "@/server/actions/auth";

const IDLE: LoginState = { status: "idle" };

export function LoginForm({
  googleEnabled,
  initialError,
}: {
  googleEnabled: boolean;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(sendMagicLink, IDLE);
  const [changingEmail, setChangingEmail] = useState(false);

  if (state.status === "sent" && !changingEmail) {
    return (
      <div className="space-y-4" role="status">
        <h1 className="text-h2">Check your email</h1>
        <p className="text-body text-text-muted">
          We sent a sign-in link to <span className="text-body-strong text-text">{state.email}</span>. Open it on
          this device to finish signing in.
        </p>
        <Button variant="secondary" className="w-full" onClick={() => setChangingEmail(true)}>
          Use a different email
        </Button>
      </div>
    );
  }

  const errorMessage = state.status === "error" ? state.message : initialError;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-h2">Sign in to Tradeslip</h1>
        <p className="text-body text-text-muted">
          Enter your email and we will send you a sign-in link. No password needed.
        </p>
      </div>

      <form action={formAction} onSubmit={() => setChangingEmail(false)} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            required
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? "login-error" : undefined}
          />
          {errorMessage ? (
            <p id="login-error" role="alert" className="text-small mt-1.5 text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending link..." : "Email me a sign-in link"}
        </Button>
      </form>

      {googleEnabled ? (
        <form action={signInWithGoogle}>
          <Button type="submit" variant="secondary" className="w-full">
            Continue with Google
          </Button>
        </form>
      ) : null}
    </div>
  );
}
