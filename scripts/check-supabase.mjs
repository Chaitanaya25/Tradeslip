// Checks that NEXT_PUBLIC_SUPABASE_URL and the publishable/anon key reach your
// Supabase auth server. Prints statuses only: never keys, project ref masked.
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
}

const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const mask = (s) => s.replace(/\/\/[^.]+\./, "//<ref>.");

if (!rawUrl || !key) {
  console.error(`Missing: ${[!rawUrl && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean).join(", ")}`);
  process.exit(1);
}

let origin;
try {
  origin = new URL(rawUrl).origin;
} catch {
  console.error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  process.exit(1);
}

const hasPath = new URL(rawUrl).pathname.replace(/\/+$/, "") !== "";
if (hasPath) console.warn(`Note: URL has a path (${new URL(rawUrl).pathname}). Use just ${mask(origin)}`);
console.log(`Key type: ${key.startsWith("sb_publishable_") ? "publishable" : key.startsWith("eyJ") ? "legacy anon JWT" : "unrecognised"}`);

let failed = false;
for (const path of ["/auth/v1/health", "/auth/v1/settings"]) {
  try {
    const res = await fetch(origin + path, { headers: { apikey: key } });
    console.log(`${res.ok ? "OK  " : "FAIL"} ${res.status} ${mask(origin)}${path}`);
    if (!res.ok) failed = true;
  } catch (e) {
    console.log(`FAIL ${mask(origin)}${path}: ${e.message}`);
    failed = true;
  }
}
console.log(failed ? "Result: auth server not reachable with these values." : "Result: URL and key work.");
process.exit(failed ? 1 : 0);
