import { logoPathFor, validateLogoFile } from "@/lib/logo";
import { createClient } from "@/lib/supabase/client";
import { setLogoPath } from "@/server/actions/settings";

/**
 * Browser-side logo upload. Uses the signed-in user's own client, so the storage
 * policy (first folder = their business id) applies. Then records the path via a
 * server action, which re-checks that the path is inside the business's folder.
 */
export async function uploadLogo(
  file: File,
  businessId: string,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const problem = validateLogoFile(file);
  if (problem) return { ok: false, message: problem };

  const path = logoPathFor(businessId, file.type);
  if (!path) return { ok: false, message: "Use a PNG, JPG or WebP image." };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("logos")
    .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (error) return { ok: false, message: "We couldn't upload that image. Try again." };

  const saved = await setLogoPath(path);
  if (!saved.ok) {
    await supabase.storage.from("logos").remove([path]);
    return { ok: false, message: saved.message };
  }
  return { ok: true, path };
}
