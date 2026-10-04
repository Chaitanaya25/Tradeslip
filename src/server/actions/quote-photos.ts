"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failure, type ActionResult } from "@/lib/action-result";
import {
  MAX_PHOTOS_PER_QUOTE,
  PHOTO_KINDS,
  isValidPhotoPath,
  type PhotoKind,
} from "@/lib/job-photos";
import { actionBusinessContext } from "./context";

const idSchema = z.uuid();
const kindSchema = z.enum(PHOTO_KINDS);
const SIGNED_URL_SECONDS = 60 * 60;

export type PhotoDto = { id: string; kind: PhotoKind; storagePath: string; url: string | null };

/**
 * Record a photo the browser has just uploaded to job-photos/{business}/{quote}/{uuid}.jpg.
 * The path is verified, the quote must be a draft of this business, and the cap is enforced here.
 */
export async function addJobPhoto(
  quoteId: string,
  storagePath: string,
  kind: PhotoKind,
): Promise<ActionResult<{ photo: PhotoDto }>> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(quoteId).success || !kindSchema.safeParse(kind).success) return failure("That photo isn't valid.");
  if (!isValidPhotoPath(storagePath, ctx.business.id, quoteId)) return failure("That photo upload isn't valid.");

  const { data: quote } = await ctx.supabase
    .from("quotes")
    .select("id, status")
    .eq("id", quoteId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!quote) return failure("That quote no longer exists.");
  if (quote.status !== "draft") return failure("Photos can only be added to drafts.");

  const { count } = await ctx.supabase
    .from("job_photos")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", quoteId)
    .eq("business_id", ctx.business.id);
  if ((count ?? 0) >= MAX_PHOTOS_PER_QUOTE) {
    await ctx.supabase.storage.from("job-photos").remove([storagePath]);
    return failure(`You can add up to ${MAX_PHOTOS_PER_QUOTE} photos to a quote.`);
  }

  const { data: row, error } = await ctx.supabase
    .from("job_photos")
    .insert({
      business_id: ctx.business.id,
      quote_id: quoteId,
      storage_path: storagePath,
      kind,
      position: count ?? 0,
    })
    .select("id, kind, storage_path")
    .single();
  if (error || !row) {
    await ctx.supabase.storage.from("job-photos").remove([storagePath]);
    return failure("We couldn't save that photo. Try again.");
  }

  const { data: signed } = await ctx.supabase.storage.from("job-photos").createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true, photo: { id: row.id, kind: row.kind, storagePath: row.storage_path, url: signed?.signedUrl ?? null } };
}

export async function setJobPhotoKind(photoId: string, kind: PhotoKind): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(photoId).success || !kindSchema.safeParse(kind).success) return failure("That photo isn't valid.");

  const { data, error } = await ctx.supabase
    .from("job_photos")
    .update({ kind })
    .eq("id", photoId)
    .eq("business_id", ctx.business.id)
    .select("id, quote_id");
  if (error) return failure("We couldn't update that photo. Try again.");
  if (!data || data.length === 0) return failure("That photo no longer exists.");

  if (data[0].quote_id) revalidatePath(`/quotes/${data[0].quote_id}`);
  return { ok: true };
}

/** Remove the row and the stored file. */
export async function deleteJobPhoto(photoId: string): Promise<ActionResult> {
  const ctx = await actionBusinessContext();
  if (!ctx.ok) return ctx.error;
  if (!idSchema.safeParse(photoId).success) return failure("That photo isn't valid.");

  const { data: photo } = await ctx.supabase
    .from("job_photos")
    .select("id, quote_id, storage_path")
    .eq("id", photoId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!photo) return failure("That photo no longer exists.");

  const { error } = await ctx.supabase.from("job_photos").delete().eq("id", photoId).eq("business_id", ctx.business.id);
  if (error) return failure("We couldn't delete that photo. Try again.");

  // Best effort: an orphaned file is harmless and unreachable.
  await ctx.supabase.storage.from("job-photos").remove([photo.storage_path]);
  if (photo.quote_id) revalidatePath(`/quotes/${photo.quote_id}`);
  return { ok: true };
}
