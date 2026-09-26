import { describe, expect, it } from "vitest";

import { NO_COMMITS_DAYS } from "../src/state.js";
import {
  ciCrossSection,
  collectUserStats,
  daysSinceLastActivity,
  USER_REPO_SAMPLE,
} from "../src/user-stats.js";
import { fakeOctokit } from "./helpers/octokit.js";

const NOW = new Date("2026-09-26T12:00:00Z");

describe("ciCrossSection – der Querschnitt ueber mehrere Repos", () => {
  it("alles gruen ist eine Aussage", () => {
    expect(ciCrossSection(["SUCCESS", "SUCCESS"])).toBe("success");
  });

  it("ein einzelnes rotes Nebenprojekt macht nicht krank", () => {
    // Genau die Zusage hinter der Querschnitts-Variante: zwei von drei gruen
    // ist kein Grund, die Kreatur krank zu zeigen.
    expect(ciCrossSection(["SUCCESS", "SUCCESS", "FAILURE"])).toBeNull();
  });

  it("mehrheitlich rot schon", () => {
    expect(ciCrossSection(["FAILURE", "FAILURE", "SUCCESS"])).toBe("failure");
    expect(ciCrossSection(["FAILURE"])).toBe("failure");
  });

  it("genau die Haelfte rot ist noch keine Aussage", () => {
    // Die Schwelle ist "ueber der Haelfte", nicht "ab der Haelfte".
    expect(ciCrossSection(["SUCCESS", "FAILURE"])).toBeNull();
  });

  it("Repos ohne CI zaehlen gar nicht mit", () => {
    expect(ciCrossSection([null, undefined, "SUCCESS"])).toBe("success");
    expect(ciCrossSection([null, undefined])).toBeNull();
    expect(ciCrossSection([])).toBeNull();
  });

  it("ERROR zaehlt wie FAILURE, PENDING gar nicht", () => {
    expect(ciCrossSection(["ERROR"])).toBe("failure");
    expect(ciCrossSection(["PENDING", "SUCCESS"])).toBe("success");
  });
});

describe("daysSinceLastActivity", () => {
  const tag = (date: string, contributionCount: number) => ({ date, contributionCount });

  it("zaehlt volle Tage bis zum letzten aktiven Tag", () => {
    expect(daysSinceLastActivity([tag("2026-09-26", 3), tag("2026-09-20", 1)], NOW)).toBe(0);
    expect(daysSinceLastActivity([tag("2026-09-24", 2)], NOW)).toBe(2);
  });

  it("leere Tage zaehlen nicht als Aktivitaet", () => {
    expect(daysSinceLastActivity([tag("2026-09-26", 0), tag("2026-09-23", 5)], NOW)).toBe(3);
  });

  it("ohne einen einzigen aktiven Tag greift der Sentinel", () => {
    // Derselbe Wert wie im Repo-Sammler, damit die Rechnung in state.ts
    // ohne Sonderfall auskommt.
    expect(daysSinceLastActivity([tag("2026-09-26", 0)], NOW)).toBe(NO_COMMITS_DAYS);
    expect(daysSinceLastActivity([], NOW)).toBe(NO_COMMITS_DAYS);
  });
});

describe("collectUserStats", () => {
  /** Eine Antwort, wie GitHubs GraphQL sie liefert. */
  function antwort(overrides: {
    commits?: number;
    tage?: { date: string; contributionCount: number }[];
    ci?: (string | null)[];
    offen?: number;
    geschlossen?: number;
  } = {}) {
    return () => ({
      user: {
        commits: {
          totalCommitContributions: overrides.commits ?? 9,
          restrictedContributionsCount: 0,
        },
        activity: {
          contributionCalendar: {
            weeks: [{ contributionDays: overrides.tage ?? [{ date: "2026-09-25", contributionCount: 4 }] }],
          },
        },
        repositories: {
          nodes: (overrides.ci ?? ["SUCCESS"]).map((state, index) => ({
            nameWithOwner: `ich/projekt-${index}`,
            defaultBranchRef: state === null ? null : { target: { statusCheckRollup: { state } } },
          })),
        },
      },
      open: { issueCount: overrides.offen ?? 2 },
      closed: { issueCount: overrides.geschlossen ?? 5 },
    });
  }

  it("bildet die Antwort auf dieselbe Struktur ab wie der Repo-Sammler", async () => {
    const { octokit } = fakeOctokit({ graphql: antwort() });

    const stats = await collectUserStats(octokit, "ich", { now: NOW });

    expect(stats).toEqual({
      commitsLast7Days: 9,
      daysSinceLastCommit: 1,
      openIssues: 2,
      closedIssuesLast30Days: 5,
      lastWorkflowConclusion: "success",
    });
  });

  it("braucht genau einen Request", async () => {
    // Ueber REST waere es ein Aufruf je Repo plus zwei Suchen. Die Action
    // laeuft taeglich in fremden Repos mit fremdem Kontingent.
    const { octokit, routes } = fakeOctokit({ graphql: antwort() });
    await collectUserStats(octokit, "ich", { now: NOW });
    expect(routes()).toEqual(["graphql"]);
  });

  it("fragt nur die zuletzt bearbeiteten Repos ab", async () => {
    const { octokit, calls } = fakeOctokit({ graphql: antwort() });
    await collectUserStats(octokit, "ich", { now: NOW });
    expect(calls[0]?.params["sample"]).toBe(USER_REPO_SAMPLE);
  });

  it("schraenkt die Issue-Suche auf die Repos der Person ein", async () => {
    const { octokit, calls } = fakeOctokit({ graphql: antwort() });
    await collectUserStats(octokit, "ich", { now: NOW });

    // `user:` statt `author:` - gemessen wird der Zustand der eigenen
    // Projekte, nicht die eigene Schreibleistung.
    expect(calls[0]?.params["openQ"]).toContain("user:ich is:issue is:open");
    expect(calls[0]?.params["closedQ"]).toContain("closed:>=2026-08-27");
  });

  it("ein unbekannter Benutzer ist ein klarer Fehler", async () => {
    const { octokit } = fakeOctokit({ graphql: () => ({ user: null, open: { issueCount: 0 }, closed: { issueCount: 0 } }) });
    await expect(collectUserStats(octokit, "gibtsnicht", { now: NOW })).rejects.toThrow(
      /not found/,
    );
  });
});
