// Checks that GEMINI_API_KEY works and that the model name exists, with one tiny
// text-only request. Prints the model, result, reply and token counts. Never prints the key.
import { existsSync, readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
}

const apiKey = env.GEMINI_API_KEY;
const model = env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";

console.log(`Model:     ${model}`);
if (!apiKey) {
  console.log("Succeeded: no");
  console.error("GEMINI_API_KEY is not set (checked the environment and .env.local).");
  process.exit(1);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30_000);

try {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: "Reply with the word OK",
    config: { temperature: 0, abortSignal: controller.signal },
  });
  const usage = response.usageMetadata ?? {};
  console.log("Succeeded: yes");
  console.log(`Reply:     ${(response.text ?? "").trim() || "(empty)"}`);
  console.log(
    `Tokens:    prompt ${usage.promptTokenCount ?? "?"}, output ${usage.candidatesTokenCount ?? "?"}, total ${usage.totalTokenCount ?? "?"}`,
  );
} catch (error) {
  const status = error?.status ?? error?.code ?? "unknown";
  // Remove anything that looks like the key before printing the message.
  const message = String(error?.message ?? error).split(apiKey).join("[key]").slice(0, 600);
  console.log("Succeeded: no");
  console.log(`Status:    ${status}`);
  console.log(`Error:     ${message}`);
  if (status === 404) console.log("Hint:      the model name is probably wrong. Set GEMINI_MODEL in .env.local.");
  else if (status === 401 || status === 403) console.log("Hint:      the API key was rejected. Check GEMINI_API_KEY.");
  else if (status === 429) console.log("Hint:      quota or rate limit reached. Try again later or check billing.");
  else if (error?.name === "AbortError") console.log("Hint:      the request timed out after 30 seconds.");
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
