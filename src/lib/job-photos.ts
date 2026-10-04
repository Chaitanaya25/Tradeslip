/** Rules for job photos, shared by the browser uploader and the server actions. */

export const MAX_PHOTOS_PER_QUOTE = 10;
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;
/** Reject absurdly large originals before even trying to decode them. */
export const PHOTO_MAX_INPUT_BYTES = 25 * 1024 * 1024;

export const PHOTO_KINDS = ["before", "after", "other"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const PHOTO_ACCEPT = ACCEPTED_TYPES.join(",");

/** Plain-language problem with a picked file, or null if it is fine. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "Use PNG, JPG or WebP photos.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > PHOTO_MAX_INPUT_BYTES) return "That photo is too large. Choose one under 25 MB.";
  return null;
}

/** Scale (w, h) down so the longest side is at most `maxEdge`. Never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number = PHOTO_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** {business_id}/{quote_id}/{uuid}.jpg  (every upload is re-encoded as JPEG). */
export function photoPathFor(businessId: string, quoteId: string, uuid: string): string {
  return `${businessId}/${quoteId}/${uuid}.jpg`;
}

const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

/** True only for a photo path inside this business's folder for this quote. */
export function isValidPhotoPath(path: string, businessId: string, quoteId: string): boolean {
  const prefix = `${businessId}/${quoteId}/`;
  return path.startsWith(prefix) && PHOTO_FILE.test(path.slice(prefix.length));
}
