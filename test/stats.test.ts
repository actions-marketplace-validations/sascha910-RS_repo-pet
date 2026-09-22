import { describe, expect, it } from "vitest";

import { NO_COMMITS_DAYS } from "../src/state.js";
import { RateLimitError, collectStats, type Octokit } from "../src/stats.js";

const NOW = new Date("2026-09-22T12:00:00Z");

/** Erzeugt einen Fehler in der Form, die Octokit wirft. */
function httpError(status: number, message: string, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(message), { status, response: { headers } });
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function commit(date: string) {
  return { commit: { committer: { date }, author: { date } } };
}

type Params = Record<string, unknown>;
type Responder = (params: Params) => unknown[];

interface Routes {
  commits?: Responder;
  issues?: Responder;
  runs?: Responder;
}

/**
 * Minimaler Octokit-Ersatz: nur die drei genutzten Endpunkte plus
 * `paginate.iterator`. Jede Route darf auch werfen – so lassen sich
 * 404/409/403 durchspielen, ohne ins Netz zu gehen.
 */
function fakeOctokit(routes: Routes) {
  const empty: Responder = () => [];
  const commits = routes.commits ?? empty;
  const issues = routes.issues ?? empty;
  const runs = routes.runs ?? empty;

  /** Zaehlt die direkten (nicht paginierten) Commit-Abrufe. */
  const calls = { directCommitCalls: 0 };

  const listCommits = Object.assign(
    async (params: Params) => {
      calls.directCommitCalls += 1;
      return { data: commits(params) };
    },
    { route: "commits" as const },
  );
  const listForRepo = Object.assign(async (params: Params) => ({ data: issues(params) }), {
    route: "issues" as const,
  });
  const listWorkflowRunsForRepo = Object.assign(
    async (params: Params) => ({ data: { workflow_runs: runs(params) } }),
    { route: "runs" as const },
  );

  const octokit = {
    rest: {
      repos: { listCommits },
      issues: { listForRepo },
      actions: { listWorkflowRunsForRepo },
    },
    paginate: {
      async *iterator(endpoint: { route: string }, params: Params) {
        const responder = endpoint.route === "commits" ? commits : issues;
        yield { data: responder(params) };
      },
    },
  };

  return { octokit: octokit as unknown as Octokit, calls };
}

describe("collectStats – fehlende Daten ergeben Defaults", () => {
  it("brandneues, leeres Repo (409 auf Commits) crasht nicht", async () => {
    const { octokit } = fakeOctokit({
      commits: () => {
        throw httpError(409, "Git Repository is empty.");
      },
    });

    await expect(collectStats(octokit, "acme", "neu", { now: NOW })).resolves.toEqual({
      commitsLast7Days: 0,
      daysSinceLastCommit: NO_COMMITS_DAYS,
      openIssues: 0,
      closedIssuesLast30Days: 0,
      lastWorkflowConclusion: null,
    });
  });

  it("Actions deaktiviert (404) ergibt conclusion null statt Fehler", async () => {
    const { octokit } = fakeOctokit({
      commits: () => [commit(daysAgo(1))],
      runs: () => {
        throw httpError(404, "Not Found");
      },
    });

    const stats = await collectStats(octokit, "acme", "ohne-ci", { now: NOW });
    expect(stats.lastWorkflowConclusion).toBeNull();
    expect(stats.commitsLast7Days).toBe(1);
  });

  it("unbekannte Conclusion (timed_out) wird zu null normalisiert", async () => {
    const { octokit } = fakeOctokit({ runs: () => [{ conclusion: "timed_out" }] });
    const stats = await collectStats(octokit, "acme", "repo", { now: NOW });
    expect(stats.lastWorkflowConclusion).toBeNull();
  });
});

describe("collectStats – Zaehlung", () => {
  it("filtert Pull Requests aus der Issue-Liste", async () => {
    const { octokit } = fakeOctokit({
      issues: (params) =>
        params.state === "open"
          ? [{}, {}, { pull_request: { url: "..." } }]
          : [{ closed_at: daysAgo(3) }, { pull_request: {}, closed_at: daysAgo(3) }],
    });

    const stats = await collectStats(octokit, "acme", "repo", { now: NOW });
    expect(stats.openIssues).toBe(2);
    expect(stats.closedIssuesLast30Days).toBe(1);
  });

  it("zaehlt nur Issues, die wirklich im Fenster geschlossen wurden", async () => {
    const { octokit } = fakeOctokit({
      issues: (params) =>
        params.state === "closed"
          ? [
              { closed_at: daysAgo(5) },
              // kuerzlich kommentiert, aber vor Monaten geschlossen
              { closed_at: daysAgo(90) },
              { closed_at: null },
            ]
          : [],
    });

    const stats = await collectStats(octokit, "acme", "repo", { now: NOW });
    expect(stats.closedIssuesLast30Days).toBe(1);
  });

  it("nimmt daysSinceLastCommit aus dem 7-Tage-Fenster, ohne Extra-Request", async () => {
    const { octokit, calls } = fakeOctokit({
      commits: () => [commit(daysAgo(2)), commit(daysAgo(6))],
    });

    const stats = await collectStats(octokit, "acme", "repo", { now: NOW });
    expect(stats.commitsLast7Days).toBe(2);
    expect(stats.daysSinceLastCommit).toBe(2);
    expect(calls.directCommitCalls).toBe(0);
  });

  it("holt den letzten Commit nur nach, wenn das Fenster leer ist", async () => {
    const { octokit, calls } = fakeOctokit({
      commits: (params) => (params.since ? [] : [commit(daysAgo(40))]),
    });

    const stats = await collectStats(octokit, "acme", "schlafend", { now: NOW });
    expect(stats.commitsLast7Days).toBe(0);
    expect(stats.daysSinceLastCommit).toBe(40);
    expect(calls.directCommitCalls).toBe(1);
  });
});

describe("collectStats – Fehler", () => {
  it("meldet das primaere Rate-Limit mit Reset-Zeitpunkt", async () => {
    const resetSeconds = Math.floor(NOW.getTime() / 1000) + 900;
    const { octokit } = fakeOctokit({
      commits: () => {
        throw httpError(403, "API rate limit exceeded", {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(resetSeconds),
        });
      },
    });

    const error = await collectStats(octokit, "acme", "repo", { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    const rateLimit = error as RateLimitError;
    expect(rateLimit.resetAt?.getTime()).toBe(resetSeconds * 1000);
    expect(rateLimit.message).toContain("Rate-Limit");
    expect(rateLimit.message).toContain("Commits");
  });

  it("erkennt das sekundaere Rate-Limit ueber retry-after", async () => {
    const { octokit } = fakeOctokit({
      commits: () => {
        throw httpError(403, "You have exceeded a secondary rate limit", { "retry-after": "60" });
      },
    });

    const error = await collectStats(octokit, "acme", "repo", { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).message).toContain("Sekundaeres");
  });

  it("behandelt ein 403 ohne Rate-Limit-Indiz als normalen Fehler", async () => {
    const { octokit } = fakeOctokit({
      commits: () => {
        throw httpError(403, "Resource not accessible by integration", { "x-ratelimit-remaining": "4998" });
      },
    });

    const error = await collectStats(octokit, "acme", "repo", { now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RateLimitError);
    expect((error as Error).message).toContain("HTTP 403");
  });

  it("reicht unerwartete Serverfehler mit Kontext weiter", async () => {
    const { octokit } = fakeOctokit({
      runs: () => {
        throw httpError(500, "Internal Server Error");
      },
    });

    await expect(collectStats(octokit, "acme", "repo", { now: NOW })).rejects.toThrow(
      /Workflow-Laeufe fehlgeschlagen \(HTTP 500\)/,
    );
  });
});
