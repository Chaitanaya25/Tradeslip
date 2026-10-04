import { describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Component build; make it a no-op for tests.
vi.mock("server-only", () => ({}));

import { MAX_AUDIO_BYTES } from "@/lib/voice";
import {
  DraftError,
  FRIENDLY_MESSAGES,
  GEMINI_MODEL,
  classifyGeminiError,
  draftFromAudio,
  resolveModel,
  type GeminiClient,
} from "./draft-quote";
import { MAX_PROMPT_ITEMS, buildSystemPrompt, compactPriceBook } from "./prompt";

const silent = { info: vi.fn(), warn: vi.fn() };
const audio = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: "audio/webm;codecs=opus" };
const good = JSON.stringify({ transcript: "Fix the tap", customer: { name: "Tom" }, job_title: "Tap", items: [{ description: "Fix tap", type: "labour", qty: 1 }] });

function fakeClient(responses: (string | Error)[]): GeminiClient & { calls: Parameters<GeminiClient["generate"]>[0][] } {
  const calls: Parameters<GeminiClient["generate"]>[0][] = [];
  return {
    calls,
    async generate(req) {
      calls.push(req);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { text: next ?? "", usage: { promptTokens: 100, outputTokens: 20, totalTokens: 120 } };
    },
  };
}

describe("draftFromAudio", () => {
  it("returns validated output and sends the audio inline with a bare mime type", async () => {
    const client = fakeClient([good]);
    const r = await draftFromAudio({ client, audio, systemPrompt: "sys", log: silent });
    expect(r.degraded).toBe(false);
    expect(r.output.items[0].description).toBe("Fix tap");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({ model: GEMINI_MODEL, audio: { mimeType: "audio/webm", data: Buffer.from([1, 2, 3, 4]).toString("base64") }, systemInstruction: "sys" });
    expect(r.usage.totalTokens).toBe(120);
  });

  it("retries once when the first output does not validate", async () => {
    const client = fakeClient(["not json at all", good]);
    const r = await draftFromAudio({ client, audio, systemPrompt: "s", log: silent });
    expect(client.calls).toHaveLength(2);
    expect(r.degraded).toBe(false);
    expect(r.usage.totalTokens).toBe(240);
  });

  it("falls back to transcript-only after two bad outputs", async () => {
    const broken = '{"transcript": "Fix the kitchen tap", "items": [';
    const client = fakeClient([broken, broken]);
    const r = await draftFromAudio({ client, audio, systemPrompt: "s", log: silent });
    expect(r.degraded).toBe(true);
    expect(r.output.transcript).toBe("Fix the kitchen tap");
    expect(r.output.items).toEqual([]);
  });

  it("logs token counts only, never transcript or customer text", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    await draftFromAudio({ client: fakeClient([good]), audio, systemPrompt: "s", log });
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls]);
    expect(logged).toContain("promptTokens");
    expect(logged).not.toContain("Fix the tap");
    expect(logged).not.toContain("Tom");
  });

  it("does not retry upstream failures and maps them to friendly errors", async () => {
    const client = fakeClient([Object.assign(new Error("boom"), { status: 503 })]);
    await expect(draftFromAudio({ client, audio, systemPrompt: "s", log: silent })).rejects.toMatchObject({
      kind: "upstream",
      message: FRIENDLY_MESSAGES.upstream,
    });
    expect(client.calls).toHaveLength(1);
  });

  it("rejects empty and oversize audio before calling the API", async () => {
    const client = fakeClient([good]);
    await expect(draftFromAudio({ client, audio: { ...audio, bytes: new Uint8Array(0) }, systemPrompt: "s", log: silent })).rejects.toMatchObject({ kind: "bad_audio" });
    await expect(
      draftFromAudio({ client, audio: { ...audio, bytes: new Uint8Array(MAX_AUDIO_BYTES + 1) }, systemPrompt: "s", log: silent }),
    ).rejects.toBeInstanceOf(DraftError);
    expect(client.calls).toHaveLength(0);
  });

  it("uses the GEMINI_MODEL override", () => {
    vi.stubEnv("GEMINI_MODEL", " my-model ");
    expect(resolveModel()).toBe("my-model");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(resolveModel()).toBe(GEMINI_MODEL);
    vi.unstubAllEnvs();
  });
});

describe("classifyGeminiError", () => {
  it.each([
    [{ status: 429, message: "x" }, "rate_limit"],
    [{ message: "RESOURCE_EXHAUSTED: quota" }, "rate_limit"],
    [{ status: 403, message: "API key not valid" }, "config"],
    [{ status: 404, message: "models/foo is not found" }, "model"],
    [{ status: 400, message: "Unsupported audio format" }, "bad_audio"],
    [{ name: "AbortError", message: "aborted" }, "timeout"],
    [{ message: "request timed out" }, "timeout"],
    [{ status: 500, message: "internal" }, "upstream"],
    [null, "upstream"],
  ])("maps %j to %s", (error, kind) => {
    expect(classifyGeminiError(error)).toBe(kind);
  });
});

describe("buildSystemPrompt", () => {
  const items = [
    { id: "id-1", name: "Mixer tap replacement — labour", type: "labour", unit: "job", rate_cents: 12000 },
    { id: "id-2", name: "Call-out fee", type: "fee", unit: "job", rate_cents: 4500 },
  ];
  const prompt = buildSystemPrompt({ trade: "Plumber", country: "UK", currency: "GBP", taxLabel: "VAT" }, items);

  it("includes the business context", () => {
    expect(prompt).toContain("Plumber");
    expect(prompt).toContain("GBP");
    expect(prompt).toContain("VAT");
    expect(prompt).toMatch(/British English/);
  });
  it("embeds the price book as compact JSON with ids, names, types and cent rates", () => {
    const line = prompt.split("\n").at(-1)!;
    expect(JSON.parse(line)).toEqual([
      { id: "id-1", n: "Mixer tap replacement — labour", t: "labour", u: "job", r: 12000 },
      { id: "id-2", n: "Call-out fee", t: "fee", u: "job", r: 4500 },
    ]);
  });
  it("states the key rules", () => {
    for (const rule of ["price_item_id", "Never invent a price", "integer cents", "call-out", "unintelligible", "notes", "job_title"]) {
      expect(prompt.toLowerCase()).toContain(rule.toLowerCase());
    }
  });
  it("switches spelling by country", () => {
    expect(buildSystemPrompt({ trade: null, country: "US", currency: "USD", taxLabel: "Sales tax" }, [])).toMatch(/US English/);
    expect(buildSystemPrompt({ trade: null, country: "AU", currency: "AUD", taxLabel: "GST" }, [])).toMatch(/Australian English/);
  });
  it("caps the price book size", () => {
    const many = Array.from({ length: MAX_PROMPT_ITEMS + 50 }, (_, i) => ({ id: `i${i}`, name: `n${i}`, type: "labour", unit: "job", rate_cents: 100 }));
    expect(JSON.parse(compactPriceBook(many))).toHaveLength(MAX_PROMPT_ITEMS);
  });
});
