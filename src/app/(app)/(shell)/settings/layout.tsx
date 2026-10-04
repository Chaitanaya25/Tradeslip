import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/shell/page-header";
import { requireBusiness } from "@/lib/auth/session";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireBusiness();

  return (
    <>
      <PageHeader title="Settings" description="Your business, tax and defaults." />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,720px)]">
        <SettingsNav />
        <div className="space-y-6">{children}</div>
      </div>
    </>
  );
}
