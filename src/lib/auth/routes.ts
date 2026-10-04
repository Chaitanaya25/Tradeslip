/**
 * Which paths can be visited without signing in. Everything else is protected
 * (default deny), which covers the whole (app) group: /dashboard, /quotes,
 * /invoices, /customers, /price-book, /settings, /onboarding, /api/ai, /api/pdf, ...
 */
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/pricing",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
]);

// Customer pages (unguessable token), auth flow, and machine-to-machine routes
// that carry their own secret (cron bearer token, webhook signature).
const PUBLIC_PREFIXES = ["/auth/", "/q/", "/i/", "/unsubscribe/", "/api/cron/", "/api/webhooks/"];

export function isPublicPath(
  pathname: string,
  isProduction: boolean = process.env.NODE_ENV === "production",
): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (PUBLIC_EXACT.has(path)) return true;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  // Component gallery: development only.
  if (!isProduction && (path === "/dev" || path.startsWith("/dev/"))) return true;
  return false;
}
