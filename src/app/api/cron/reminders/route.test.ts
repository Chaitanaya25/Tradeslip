// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runMock = vi.fn();
vi.mock("@/server/reminders/live", () => ({ liveRunDeps: () => ({ fake: true }) }));
vi.mock("@/server/reminders/run", () => ({ runReminders: (...args: unknown[]) => runMock(...args) }));

import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const SECRET = "a-long-enough-cron-secret-1234567890";
const req = (method: string, authorization?: string) =>
  new NextRequest("http://localhost/api/cron/reminders", { method, headers: authorization ? { authorization } : {} });

describe("/api/cron/reminders", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    runMock.mockReset();
    runMock.mockResolvedValue({ scanned: 3, sent: 2, skipped: 1, failed: 0, expired: 1 });
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("returns 401 with an empty body and does not run for a missing or wrong token", async () => {
    for (const authorization of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) {
      for (const handler of [GET, POST]) {
        const res = await handler(req(handler === GET ? "GET" : "POST", authorization));
        expect(res.status).toBe(401);
        expect(await res.text()).toBe("");
      }
    }
    expect(runMock).not.toHaveBeenCalled();
  });
  it("refuses (503, no detail) when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("POST", `Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("");
    expect(runMock).not.toHaveBeenCalled();
  });
  it("runs with the right token (GET and POST) and returns the counts only", async () => {
    for (const [handler, method] of [[GET, "GET"], [POST, "POST"]] as const) {
      const res = await handler(req(method, `Bearer ${SECRET}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual({ scanned: 3, sent: 2, skipped: 1, failed: 0, expired: 1 });
    }
    expect(runMock).toHaveBeenCalledTimes(2);
  });
  it("hides the reason when a run crashes", async () => {
    runMock.mockRejectedValue(new Error("secret internal detail sarah@example.com"));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await POST(req("POST", `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("sarah@example.com");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("sarah@example.com");
    spy.mockRestore();
  });
});
