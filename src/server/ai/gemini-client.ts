import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { GeminiClient } from "./draft-quote";

/** Thin adapter around the official SDK. Returns null when no API key is configured. */
export function createGeminiClient(): GeminiClient | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate({ model, systemInstruction, userText, audio, responseJsonSchema, signal, timeoutMs }) {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }, { text: userText }],
          },
        ],
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema,
          abortSignal: signal,
          httpOptions: { timeout: timeoutMs },
        },
      });

      const usage = response.usageMetadata;
      return {
        text: response.text ?? "",
        usage: {
          promptTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
          totalTokens: usage?.totalTokenCount,
        },
      };
    },
  };
}
