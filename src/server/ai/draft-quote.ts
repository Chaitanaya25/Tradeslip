import "server-only";
import { parseAiJson, salvageTranscript, AI_RESPONSE_JSON_SCHEMA, type AiOutput } from "@/lib/ai/schema";
import { MAX_AUDIO_BYTES, baseMime } from "@/lib/voice";
import { USER_PROMPT } from "./prompt";

/** Change the model here, or set GEMINI_MODEL in the environment (no code change needed). */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export function resolveModel(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL;
}

export type GeminiUsage = { promptTokens?: number; outputTokens?: number; totalTokens?: number };

/** The slice of the SDK we use. Tests pass a fake; production uses `gemini-client.ts`. */
export interface GeminiClient {
  generate(request: {
    model: string;
    systemInstruction: string;
    userText: string;
    audio: { mimeType: string; data: string };
    responseJsonSchema: unknown;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ text: string; usage: GeminiUsage }>;
}

export type DraftErrorKind = "rate_limit" | "bad_audio" | "too_large" | "model" | "config" | "timeout" | "upstream";

export class DraftError extends Error {
  constructor(
    readonly kind: DraftErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DraftError";
  }
}

export const FRIENDLY_MESSAGES: Record<DraftErrorKind, string> = {
  rate_limit: "Voice drafting is busy right now. Wait a minute and try again, or fill the quote in by hand.",
  bad_audio: "We couldn't make out that recording. Try again in a quieter spot, or fill the quote in by hand.",
  too_large: "That recording is too long. Keep it under two minutes, or fill the quote in by hand.",
  model: "Voice drafting isn't available right now. You can still fill the quote in by hand.",
  config: "Voice drafting isn't set up yet. You can still fill the quote in by hand.",
  timeout: "That took too long. Try again, or fill the quote in by hand.",
  upstream: "Voice drafting hit a problem. Try again, or fill the quote in by hand.",
};

/** Map an SDK/network error to a kind we can explain to the user. */
export function classifyGeminiError(error: unknown): DraftErrorKind {
  const e = error as { status?: number; code?: number; name?: string; message?: string } | null;
  const status = e?.status ?? e?.code;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;

  if (e?.name === "AbortError" || /abort|timed? ?out|deadline/i.test(msg)) return "timeout";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)) return "rate_limit";
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) return "config";
  if (status === 404 || /model.*(not found|not supported|does not exist)|NOT_FOUND/i.test(msg)) return "model";
  if (status === 400 || /INVALID_ARGUMENT|audio|mime|unsupported|could not process/i.test(msg)) return "bad_audio";
  return "upstream";
}

export type DraftOutcome = {
  output: AiOutput;
  /** True when the model's JSON could not be used and only the transcript was salvaged. */
  degraded: boolean;
  usage: GeminiUsage;
};

type Logger = Pick<Console, "info" | "warn">;

/**
 * Send one voice note to Gemini and return validated structured output.
 * Retries once if the JSON does not validate, then falls back to transcript-only.
 * Logs token counts and error kinds only: never audio, transcripts or customer data.
 */
export async function draftFromAudio(options: {
  client: GeminiClient;
  audio: { bytes: Uint8Array; mimeType: string };
  systemPrompt: string;
  model?: string;
  timeoutMs?: number;
  log?: Logger;
}): Promise<DraftOutcome> {
  const { client, audio, systemPrompt, log = console } = options;
  const model = options.model ?? resolveModel();
  const timeoutMs = options.timeoutMs ?? 45_000;

  if (audio.bytes.byteLength === 0) throw new DraftError("bad_audio", FRIENDLY_MESSAGES.bad_audio);
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) throw new DraftError("too_large", FRIENDLY_MESSAGES.too_large);

  const data = Buffer.from(audio.bytes).toString("base64");
  const mimeType = baseMime(audio.mimeType);
  const total: GeminiUsage = {};
  let lastRaw = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let result: { text: string; usage: GeminiUsage };
    try {
      result = await client.generate({
        model,
        systemInstruction: systemPrompt,
        userText: USER_PROMPT,
        audio: { mimeType, data },
        responseJsonSchema: AI_RESPONSE_JSON_SCHEMA,
        signal: controller.signal,
        timeoutMs,
      });
    } catch (error) {
      const kind = classifyGeminiError(error);
      log.warn("[ai] draft call failed", { kind, status: (error as { status?: number })?.status, attempt });
      throw new DraftError(kind, FRIENDLY_MESSAGES[kind]);
    } finally {
      clearTimeout(timer);
    }

    total.promptTokens = (total.promptTokens ?? 0) + (result.usage.promptTokens ?? 0);
    total.outputTokens = (total.outputTokens ?? 0) + (result.usage.outputTokens ?? 0);
    total.totalTokens = (total.totalTokens ?? 0) + (result.usage.totalTokens ?? 0);
    log.info("[ai] draft usage", { model, attempt, ...result.usage });

    lastRaw = result.text;
    const parsed = parseAiJson(result.text);
    if (parsed.ok) return { output: parsed.data, degraded: false, usage: total };
    log.warn("[ai] draft output did not validate", { reason: parsed.reason, attempt });
  }

  // Both attempts failed validation: hand back whatever transcript we can so the user can type the quote.
  const transcript = salvageTranscript(lastRaw);
  return {
    output: { transcript, customer: { name: null, phone: null, email: null, address_line1: null, city: null, region: null, postcode: null }, job_title: "", items: [], notes: null },
    degraded: true,
    usage: total,
  };
}
