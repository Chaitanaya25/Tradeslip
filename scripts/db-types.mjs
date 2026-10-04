// Regenerates src/lib/supabase/types.ts from the live database.
// Needs: SUPABASE_PROJECT_ID (env or .env.local) and `npx supabase login` once.
// Cross-platform on purpose: `$VAR` in package.json scripts does not expand on Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

function fromEnvFile(name) {
  if (!existsSync(".env.local")) return undefined;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const projectId = process.env.SUPABASE_PROJECT_ID || fromEnvFile("SUPABASE_PROJECT_ID");
if (!projectId) {
  console.error("SUPABASE_PROJECT_ID is not set. Add it to .env.local (the ref in your Supabase project URL).");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["--yes", "supabase", "gen", "types", "typescript", "--project-id", projectId, "--schema", "public"],
  { encoding: "utf8", shell: true, maxBuffer: 32 * 1024 * 1024 },
);

if (result.status !== 0 || !result.stdout.trim()) {
  console.error(result.stderr || "supabase gen types returned nothing.");
  console.error("Leaving src/lib/supabase/types.ts unchanged. Have you run `npx supabase login`?");
  process.exit(result.status || 1);
}

const target = "src/lib/supabase/types.ts";
writeFileSync(`${target}.tmp`, result.stdout);
renameSync(`${target}.tmp`, target);
console.log(`Wrote ${target} from project ${projectId}.`);
