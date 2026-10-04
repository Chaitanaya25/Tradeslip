"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOGO_ACCEPT, validateLogoFile } from "@/lib/logo";

/**
 * Logo chooser: preview, Upload/Replace and Remove. It only picks a file; the
 * caller decides when to upload (immediately in Settings, after the business is
 * saved in onboarding).
 */
export function LogoPicker({
  name,
  currentUrl,
  file,
  busy,
  onSelect,
  onRemove,
}: {
  name: string;
  /** Already-saved logo URL, if any. */
  currentUrl: string | null;
  /** Newly picked file waiting to upload (shows a local preview). */
  file: File | null;
  busy?: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  // Revoke any object URL when the picker goes away.
  const localUrlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  }, []);

  const previewUrl = (file ? localUrl : null) ?? currentUrl;
  const monogram = (name.trim()[0] ?? "T").toUpperCase();

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted text-[20px] font-semibold text-text-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase storage
            <img src={previewUrl} alt={`${name || "Business"} logo`} className="size-full object-contain" />
          ) : (
            <span aria-hidden="true">{monogram}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus /> {previewUrl ? "Replace logo" : "Upload logo"}
          </Button>
          {previewUrl ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a logo image"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            const problem = validateLogoFile(picked);
            setError(problem);
            if (problem) return;
            if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
            const url = URL.createObjectURL(picked);
            localUrlRef.current = url;
            setLocalUrl(url);
            onSelect(picked);
          }}
        />
      </div>
      <p className="text-small mt-2 text-text-muted">PNG, JPG or WebP, up to 2 MB.</p>
      {error ? (
        <p role="alert" className="text-small mt-1 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
