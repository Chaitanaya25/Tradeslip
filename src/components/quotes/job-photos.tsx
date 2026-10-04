"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { compressToJpeg } from "@/lib/image-compress";
import {
  MAX_PHOTOS_PER_QUOTE,
  PHOTO_ACCEPT,
  PHOTO_KINDS,
  photoPathFor,
  validatePhotoFile,
  type PhotoKind,
} from "@/lib/job-photos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { addJobPhoto, deleteJobPhoto, setJobPhotoKind, type PhotoDto } from "@/server/actions/quote-photos";

const KIND_LABELS: Record<PhotoKind, string> = { before: "Before", after: "After", other: "Other" };

/** Photo uploads for a saved draft. Files are shrunk in the browser before upload. */
export function JobPhotos({
  businessId,
  quoteId,
  initialPhotos,
}: {
  businessId: string;
  quoteId: string | null;
  initialPhotos: PhotoDto[];
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoDto[]>(initialPhotos);
  const [busy, setBusy] = useState(false);

  if (!quoteId) {
    return <p className="text-body text-text-muted">Save the draft to add photos.</p>;
  }
  const id = quoteId;
  const remaining = MAX_PHOTOS_PER_QUOTE - photos.length;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    if (picked.length > remaining) {
      toast.error(`You can add ${remaining} more photo${remaining === 1 ? "" : "s"} (up to ${MAX_PHOTOS_PER_QUOTE}).`);
    }
    setBusy(true);
    const supabase = createClient();
    for (const file of picked.slice(0, Math.max(remaining, 0))) {
      const problem = validatePhotoFile(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      try {
        const blob = await compressToJpeg(file);
        const path = photoPathFor(businessId, id, crypto.randomUUID());
        const { error } = await supabase.storage
          .from("job-photos")
          .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
        if (error) throw error;

        const saved = await addJobPhoto(id, path, "other");
        if (!saved.ok) {
          await supabase.storage.from("job-photos").remove([path]);
          toast.error(saved.message);
          continue;
        }
        setPhotos((current) => [...current, saved.photo]);
      } catch {
        toast.error(`We couldn't upload ${file.name}. Try again.`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function changeKind(photo: PhotoDto, kind: PhotoKind) {
    if (photo.kind === kind) return;
    const previous = photo.kind;
    setPhotos((c) => c.map((p) => (p.id === photo.id ? { ...p, kind } : p)));
    const result = await setJobPhotoKind(photo.id, kind);
    if (!result.ok) {
      setPhotos((c) => c.map((p) => (p.id === photo.id ? { ...p, kind: previous } : p)));
      toast.error(result.message);
    }
  }

  async function remove(photo: PhotoDto) {
    const result = await deleteJobPhoto(photo.id);
    if (result.ok) {
      setPhotos((c) => c.filter((p) => p.id !== photo.id));
      toast.success("Photo removed.");
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div>
      {photos.length > 0 ? (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="relative aspect-[4/3] bg-surface-muted">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={photo.url} alt={`Job photo ${i + 1}, ${KIND_LABELS[photo.kind]}`} className="size-full object-cover" />
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(photo)}
                  aria-label={`Delete photo ${i + 1}`}
                  className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-md bg-surface text-text-muted shadow-card transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div role="group" aria-label={`Photo ${i + 1} type`} className="flex gap-1 p-1.5">
                {PHOTO_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={photo.kind === kind}
                    onClick={() => changeKind(photo, kind)}
                    className={cn(
                      "text-small flex-1 rounded-md px-1 py-1 transition-colors",
                      photo.kind === kind ? "bg-accent-soft font-medium text-accent" : "text-text-muted hover:bg-surface-muted",
                    )}
                  >
                    {KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose job photos"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button type="button" variant="secondary" size="compact" disabled={busy || remaining <= 0} onClick={() => inputRef.current?.click()}>
        <ImagePlus /> {busy ? "Uploading..." : "Add photos"}
      </Button>
      <p className="text-small mt-2 text-text-muted">
        PNG, JPG or WebP. Up to {MAX_PHOTOS_PER_QUOTE} photos, shrunk to 1600px before upload.
      </p>
    </div>
  );
}
