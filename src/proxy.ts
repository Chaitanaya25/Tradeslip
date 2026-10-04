import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/routes";
import { hasSessionCookie, updateSession } from "@/lib/supabase/proxy";

// Next.js 16 calls this file "proxy" (it was "middleware"). It is an optimistic
// check only: pages and actions still verify the user on the server.
export async function proxy(request: NextRequest) {
  const isPublic = isPublicPath(request.nextUrl.pathname);
  const hasCookie = hasSessionCookie(request);

  // No session cookie: nothing to refresh, so skip the Supabase round trip.
  if (!hasCookie) return isPublic ? NextResponse.next() : rejectUnauthenticated(request);

  const { response, user } = await updateSession(request);

  if (!user && !isPublic) {
    const rejection = rejectUnauthenticated(request);
    // Keep any cookies Supabase cleared while refreshing.
    response.cookies.getAll().forEach((cookie) => rejection.cookies.set(cookie));
    return rejection;
  }

  return response;
}

function rejectUnauthenticated(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|webmanifest)$).*)",
  ],
};
