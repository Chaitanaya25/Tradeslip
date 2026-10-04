import { NextResponse, type NextRequest } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { liveRunDeps } from "@/server/reminders/live";
import { runReminders } from "@/server/reminders/run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const empty = (status: number) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Hourly reminder run (Vercel Cron, or any scheduler that can send the bearer token).
 * Missing or wrong secret: 401 with no detail. No secret configured: refused (503) with no detail.
 * Returns counts only.
 */
async function handle(request: NextRequest) {
  const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "misconfigured") return empty(503);
  if (auth !== "ok") return empty(401);

  try {
    const summary = await runReminders(liveRunDeps());
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.warn("[reminders] run crashed");
    return NextResponse.json({ error: "run failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = handle;
export const POST = handle;
