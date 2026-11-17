#!/usr/bin/env node
/**
 * Runs Hallmark's design linter (sloplint) on the frontend, in app scope.
 *
 *   npm run slop            static checks
 *   npm run slop -- --render   also render and screenshot (needs puppeteer-core and Chrome)
 *
 * Finds Hallmark in $HALLMARK_DIR, then the usual install locations, then ./.hallmark-skill.
 * Install it with scripts/setup-hallmark.sh. Exits 1 on any FAIL.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  process.env.HALLMARK_DIR,
  join(root, ".hallmark-skill", "skills", "hallmark"),
  join(homedir(), ".claude", "skills", "hallmark"),
  join(homedir(), ".agents", "skills", "hallmark"),
].filter(Boolean);

const skill = candidates.find((dir) => existsSync(join(dir, "scripts", "sloplint.mjs")));
if (!skill) {
  console.error("Hallmark is not installed. Run: bash scripts/setup-hallmark.sh");
  process.exit(2);
}

const extra = process.argv.slice(2);
const result = spawnSync(
  "node",
  [join(skill, "scripts", "sloplint.mjs"), join(root, "frontend", "src"), "--genre", "modern-minimal", "--scope", "app", ...extra],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
