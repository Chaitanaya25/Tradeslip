import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// TEST_* variables for the RLS tests live in .env.test.local (a throwaway project).
function testEnv(): Record<string, string> {
  const file = ".env.test.local";
  if (!existsSync(file)) return {};
  const parsed = parseEnv(readFileSync(file, "utf8"));
  return Object.fromEntries(
    Object.entries(parsed).filter(([key, value]) => key.startsWith("TEST_") && value),
  ) as Record<string, string>;
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    env: testEnv(),
    // Real network calls to Supabase (user creation, sign-in) can be slow.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
