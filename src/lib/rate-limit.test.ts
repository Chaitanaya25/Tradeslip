import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkRateLimits, clientIp, ipSubject, tokenSubject, type RateLimitRpc } from "./rate-limit";

function counterRpc(): RateLimitRpc & { calls: [string, string, string][] } {
  const counts = new Map<string, number>();
  const calls: [string, string, string][] = [];
  const rpc = (async (subject: string, key: string, windowStart: string) => {
    calls.push([subject, key, windowStart]);
    const id = `${subject}|${key}|${windowStart}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts.get(id)!;
  }) as RateLimitRpc & { calls: [string, string, string][] };
  rpc.calls = calls;
  return rpc;
}

const now = new Date("2026-10-04T10:00:30Z");

describe("checkRateLimits", () => {
  it("allows up to the limit and refuses the next hit", async () => {
    const rpc = counterRpc();
    const checks = [{ subject: ipSubject("203.0.113.9"), key: "public-accept", limit: 3 }];
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await checkRateLimits(checks, { rpc, now })).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("refuses if any one check is over its limit", async () => {
    const rpc = counterRpc();
    const checks = [
      { subject: ipSubject("1.1.1.1"), key: "k", limit: 10 },
      { subject: tokenSubject("tok"), key: "k", limit: 1 },
    ];
    expect((await checkRateLimits(checks, { rpc, now })).allowed).toBe(true);
    expect((await checkRateLimits(checks, { rpc, now })).allowed).toBe(false);
  });

  it("starts a fresh count in the next minute window", async () => {
    const rpc = counterRpc();
    const checks = [{ subject: "ip:x", key: "k", limit: 1 }];
    await checkRateLimits(checks, { rpc, now });
    expect((await checkRateLimits(checks, { rpc, now })).allowed).toBe(false);
    expect((await checkRateLimits(checks, { rpc, now: new Date("2026-10-04T10:01:05Z") })).allowed).toBe(true);
  });

  it("fails closed when the counter is unavailable", async () => {
    const broken: RateLimitRpc = async () => null;
    expect((await checkRateLimits([{ subject: "ip:x", key: "k", limit: 5 }], { rpc: broken, now })).allowed).toBe(false);
  });

  it("uses the minute window start", async () => {
    const rpc = counterRpc();
    await checkRateLimits([{ subject: "ip:x", key: "k", limit: 5 }], { rpc, now });
    expect(rpc.calls[0][2]).toBe("2026-10-04T10:00:00.000Z");
  });
});

describe("subjects", () => {
  it("hashes tokens so raw tokens are never stored", () => {
    const a = tokenSubject("secret-token-value-1234567890123456");
    expect(a).toMatch(/^tok:[0-9a-f]{16}$/);
    expect(a).not.toContain("secret");
    expect(tokenSubject("secret-token-value-1234567890123456")).toBe(a);
    expect(tokenSubject("another")).not.toBe(a);
  });
  it("prefixes and caps IPs", () => {
    expect(ipSubject("203.0.113.9")).toBe("ip:203.0.113.9");
    expect(ipSubject("x".repeat(200)).length).toBe(67);
  });
  it("takes the first forwarded address", () => {
    expect(clientIp("203.0.113.9, 10.0.0.1", null)).toBe("203.0.113.9");
    expect(clientIp(null, "198.51.100.2")).toBe("198.51.100.2");
    expect(clientIp(null, null)).toBe("unknown");
  });
});
