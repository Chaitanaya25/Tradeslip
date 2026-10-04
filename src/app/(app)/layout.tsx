import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/session";

// Everything in the (app) group needs a signed-in user. The proxy is only an
// optimistic check, so verify here too.
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <ToastProvider>{children}</ToastProvider>;
}
