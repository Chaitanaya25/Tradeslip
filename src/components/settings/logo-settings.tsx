"use client";

import { useState, useTransition } from "react";
import { LogoPicker } from "@/components/onboarding/logo-picker";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { logoPublicUrl } from "@/lib/supabase/storage";
import { uploadLogo } from "@/lib/supabase/logo-upload";
import { setLogoPath } from "@/server/actions/settings";

/** Logo replace/remove. Saves on its own, separate from the profile form. */
export function LogoSettings({
  businessId,
  businessName,
  initialLogoPath,
}: {
  businessId: string;
  businessName: string;
  initialLogoPath: string | null;
}) {
  const toast = useToast();
  const [logoPath, setPath] = useState<string | null>(initialLogoPath);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <h2 className="text-h2">Logo</h2>
      <p className="text-body mb-5 text-text-muted">Shown on your quotes, invoices and customer pages.</p>
      <LogoPicker
        name={businessName}
        currentUrl={logoPublicUrl(logoPath)}
        file={null}
        busy={pending}
        onSelect={(file) =>
          startTransition(async () => {
            const result = await uploadLogo(file, businessId);
            if (result.ok) {
              setPath(result.path);
              toast.success("Logo updated.");
            } else {
              toast.error(result.message);
            }
          })
        }
        onRemove={() =>
          startTransition(async () => {
            const result = await setLogoPath(null);
            if (result.ok) {
              setPath(null);
              toast.success("Logo removed.");
            } else {
              toast.error(result.message);
            }
          })
        }
      />
    </Card>
  );
}
