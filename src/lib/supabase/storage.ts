import { supabaseUrl } from "./env";

/** Public URL for a file in the public `logos` bucket (safe in client and server code). */
export function logoPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl()}/storage/v1/object/public/logos/${encoded}`;
}
