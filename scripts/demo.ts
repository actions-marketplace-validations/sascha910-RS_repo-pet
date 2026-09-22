/**
 * Demo-Skript: `npm run demo -- owner/repo`
 *
 * Sammelt die Stats eines echten Repos, leitet den Zustand ab und schreibt
 * beides als JSON nach stdout. Diagnosen gehen nach stderr, damit sich die
 * Ausgabe nach `jq` weiterreichen laesst.
 */

import { execFileSync } from "node:child_process";

import { getOctokit } from "@actions/github";

import { RateLimitError, collectStats } from "../src/stats.js";
import { deriveState } from "../src/state.js";

function usage(): never {
  console.error("Aufruf: npm run demo -- owner/repo");
  console.error("Token aus GITHUB_TOKEN oder GH_TOKEN, sonst aus `gh auth token`.");
  process.exit(2);
}

function parseTarget(argument: string | undefined): { owner: string; repo: string } {
  if (!argument) usage();
  const match = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(argument.trim());
  if (!match?.[1] || !match[2]) {
    console.error(`"${argument}" ist kein owner/repo.`);
    usage();
  }
  return { owner: match[1], repo: match[2] };
}

/** Token aus der Umgebung, ersatzweise aus der gh-CLI. */
function resolveToken(): string {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;

  try {
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    console.error("Kein Token gefunden: GITHUB_TOKEN setzen oder `gh auth login` ausfuehren.");
    console.error("Ohne Token greift das sehr niedrige anonyme Rate-Limit (60 Requests/Stunde).");
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const { owner, repo } = parseTarget(process.argv[2]);
  const octokit = getOctokit(resolveToken());

  console.error(`Sammle ${owner}/${repo} ...`);
  const stats = await collectStats(octokit, owner, repo);
  const state = deriveState(stats);

  console.log(JSON.stringify({ repo: `${owner}/${repo}`, stats, state }, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof RateLimitError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
