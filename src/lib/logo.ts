/** Logo upload rules shared by the browser uploader and the server action. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const LOGO_ACCEPT = Object.keys(TYPES).join(",");

/** Returns a plain-language problem, or null if the file is acceptable. */
export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!(file.type in TYPES)) return "Use a PNG, JPG or WebP image.";
  if (file.size > LOGO_MAX_BYTES) return "That image is over 2 MB. Choose a smaller one.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function logoExtension(mimeType: string): string | null {
  return TYPES[mimeType] ?? null;
}

/** Storage path for a new logo: {business_id}/logo-{timestamp}.{ext} (new name busts caches). */
export function logoPathFor(businessId: string, mimeType: string, now: number = Date.now()): string | null {
  const ext = logoExtension(mimeType);
  return ext ? `${businessId}/logo-${now}.${ext}` : null;
}

const LOGO_FILE = /^logo-[0-9]+\.(png|jpg|webp)$/;

/** True only for logo paths inside the business's own folder. */
export function isOwnLogoPath(path: string, businessId: string): boolean {
  const prefix = `${businessId}/`;
  return path.startsWith(prefix) && LOGO_FILE.test(path.slice(prefix.length));
}
