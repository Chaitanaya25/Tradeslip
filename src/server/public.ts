import "server-only";
import { cache } from "react";
import { isPublicQuote, type PublicQuote } from "@/lib/public-quote";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isWellFormedToken } from "@/lib/tokens";

/**
 * Everything the public quote page and public PDF read goes through here, using the
 * service-role client (server only). Pages never query tables directly; they get the
 * whitelisted JSON from get_public_quote and nothing else.
 */

/** The customer's view of a quote, or null for a malformed token, unknown token or a draft. */
export async function getPublicQuote(token: string): Promise<PublicQuote | null> {
  if (!isWellFormedToken(token)) return null;
  const { data, error } = await createAdminClient().rpc("get_public_quote", { p_token: token });
  if (error || !isPublicQuote(data)) return null;
  return data;
}

/** One lookup per request, shared by generateMetadata and the page. */
export const loadPublicQuote = cache(getPublicQuote);

/** Record the first view. Returns true only the first time (so the owner is told once). */
export async function recordFirstView(token: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("record_quote_view", { p_token: token });
  return !error && data === true;
}

/**
 * Is the visitor the signed-in owner of this quote? A user-client lookup by token only
 * returns a row under RLS when the quote belongs to the visitor's own business, so no
 * ids are compared and nothing about other businesses is learned.
 */
export async function visitorOwnsQuote(token: string, hasSessionCookie: boolean): Promise<boolean> {
  if (!hasSessionCookie) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("quotes").select("id").eq("public_token", token).maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

const PHOTO_URL_SECONDS = 10 * 60;

/** Short-lived signed URLs for a public quote's photos, created server-side. */
export async function signPublicPhotos(photos: PublicQuote["photos"]): Promise<{ url: string; kind: "before" | "after" | "other" }[]> {
  if (photos.length === 0) return [];
  const { data } = await createAdminClient()
    .storage.from("job-photos")
    .createSignedUrls(photos.map((p) => p.path), PHOTO_URL_SECONDS);
  const urlByPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return photos.flatMap((p) => {
    const url = urlByPath.get(p.path);
    return url ? [{ url, kind: p.kind }] : [];
  });
}

/** Business contact + quote facts for owner notification emails (server only, never rendered publicly). */
export async function getOwnerNotificationTarget(token: string) {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, number, total_cents, currency, deposit_enabled, deposit_bps, business_id, customer_id")
    .eq("public_token", token)
    .maybeSingle();
  if (!quote) return null;

  const [{ data: business }, { data: customer }] = await Promise.all([
    admin.from("businesses").select("name, email, country, quote_prefix, logo_path").eq("id", quote.business_id).maybeSingle(),
    quote.customer_id ? admin.from("customers").select("name").eq("id", quote.customer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!business) return null;
  return { quote, business, customerName: customer?.name ?? null };
}
