import { readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import type { ActionInputs } from "../src/inputs.js";
import { InputError, readInputs } from "../src/inputs.js";
import { buildSummary, describeFailure, runAction, svgRawUrl, type ActionIo } from "../src/main.js";
import { RateLimitError } from "../src/stats.js";
import { fakeOctokit, httpError } from "./helpers/octokit.js";

const INPUTS: ActionInputs = {
  githubToken: "ghs_token",
  subject: { kind: "repo", repo: { owner: "fremd", repo: "projekt" } } as const,
  target: { owner: "ich", repo: "meins" },
  outputBranch: "pet-output",
  outputFilename: "pet.svg",
  dryRun: true,
};

/** Fester Zeitpunkt, damit die Fixtures unten stabile Abstaende haben. */
const NOW = new Date("2026-09-25T12:00:00Z");

/** Sammelt, was die Action ausgibt, statt es irgendwohin zu schreiben. */
function recordingIo(): { io: ActionIo; outputs: Map<string, string>; logs: string[]; summary: string[] } {
  const outputs = new Map<string, string>();
  const logs: string[] = [];
  const summary: string[] = [];
  return {
    outputs,
    logs,
    summary,
    io: {
      info: (message) => void logs.push(message),
      warning: (message) => void logs.push(`WARN ${message}`),
      setOutput: (name, value) => void outputs.set(name, value),
      writeSummary: async (markdown) => void summary.push(markdown),
    },
  };
}

describe("runAction – dry_run schreibt nichts", () => {
  it("beruehrt ausschliesslich lesende Endpunkte", async () => {
    const { octokit, routes } = fakeOctokit();
    const { io } = recordingIo();

    await runAction({ octokit, inputs: INPUTS, io, now: NOW });

    // Positiv formuliert: genau diese Routen, keine andere.
    expect(new Set(routes())).toEqual(
      new Set([
        "paginate:repos.listCommits",
        "paginate:issues.listForRepo",
        "actions.listWorkflowRunsForRepo",
        "repos.listCommits",
      ]),
    );
    // Und zur Sicherheit auch negativ, falls oben je eine Route dazukommt.
    expect(routes().filter((route) => /create|update|delete|merge|push|git\./i.test(route))).toEqual([]);
  });

  it("setzt die Zustands-Outputs, aber svg_url bleibt leer", async () => {
    const { octokit } = fakeOctokit();
    const { io, outputs } = recordingIo();

    const result = await runAction({ octokit, inputs: INPUTS, io, now: NOW });

    expect(outputs.get("mood")).toBe(result.state.mood);
    expect(outputs.get("satiety")).toBe(String(result.state.satiety));
    expect(outputs.get("health")).toBe(String(result.state.health));
    // Leer und nicht die spaetere URL: sonst bettet ein Folgeschritt eine
    // Datei ein, die es nicht gibt.
    expect(outputs.get("svg_url")).toBe("");
    expect(result.outcome).toBe("dry-run");
  });

  it("schreibt eine Zusammenfassung, die den Zustand nennt", async () => {
    const { octokit } = fakeOctokit();
    const { io, summary, logs } = recordingIo();

    const result = await runAction({ octokit, inputs: INPUTS, io, now: NOW });

    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain(`\`${result.state.mood}\``);
    expect(summary[0]).toContain("dry_run");
    expect(summary[0]).toContain("fremd/projekt");
    expect(logs.some((line) => line.includes("dry_run"))).toBe(true);
  });
});

describe("runAction – Person statt Repo", () => {
  it("misst ueber GraphQL, ohne einen einzigen REST-Endpunkt zu beruehren", async () => {
    const { octokit, routes } = fakeOctokit({
      graphql: () => ({
        user: {
          commits: { totalCommitContributions: 9, restrictedContributionsCount: 0 },
          activity: {
            contributionCalendar: {
              weeks: [{ contributionDays: [{ date: "2026-09-25", contributionCount: 4 }] }],
            },
          },
          repositories: { nodes: [] },
        },
        open: { issueCount: 0 },
        closed: { issueCount: 0 },
      }),
    });
    const { io, logs } = recordingIo();

    await runAction({
      octokit,
      inputs: { ...INPUTS, subject: { kind: "user", login: "octocat" } },
      io,
      now: NOW,
    });

    expect(routes()).toEqual(["graphql"]);
    expect(logs[0]).toContain("@octocat");
  });
});

describe("runAction – ohne dry_run", () => {
  /** Routen fuer den Schreibpfad: Branch fehlt, also Orphan. */
  const writeRoutes = {
    "git.getRef": () => {
      throw httpError(404, "Not Found");
    },
    "git.createTree": () => ({ sha: "tree1" }),
    "git.createCommit": () => ({ sha: "commit1" }),
    "git.createRef": () => ({ ref: "refs/heads/pet-output" }),
  };

  it("legt ab und setzt svg_url auf das Commit-Ziel", async () => {
    const { octokit } = fakeOctokit(writeRoutes);
    const { io, outputs } = recordingIo();

    const result = await runAction({
      octokit,
      inputs: { ...INPUTS, dryRun: false },
      io,
      now: NOW,
    });

    expect(result.outcome).toBe("created");
    expect(outputs.get("svg_url")).toBe(
      "https://raw.githubusercontent.com/ich/meins/pet-output/pet.svg",
    );
  });

  it("die Zustands-Outputs stehen, auch wenn der Commit scheitert", async () => {
    // Schlaegt das Schreiben fehl, ist der Zustand trotzdem ermittelt. Ihn
    // wegzuwerfen, weil ein Branch klemmt, waere Unsinn.
    const { octokit } = fakeOctokit({
      "git.getRef": () => {
        throw httpError(403, "Resource not accessible by integration");
      },
    });
    const { io, outputs } = recordingIo();

    await expect(
      runAction({ octokit, inputs: { ...INPUTS, dryRun: false }, io, now: NOW }),
    ).rejects.toThrow();

    expect(outputs.get("mood")).toBeDefined();
    expect(outputs.has("svg_url")).toBe(false);
  });
});

describe("svgRawUrl", () => {
  it("zeigt auf das Commit-Ziel, nicht auf das gemessene Repo", () => {
    expect(svgRawUrl(INPUTS)).toBe(
      "https://raw.githubusercontent.com/ich/meins/pet-output/pet.svg",
    );
  });
});

describe("describeFailure – Fehler, die weiterhelfen", () => {
  it("403 nennt contents: write und die Repo-Einstellung", () => {
    const message = describeFailure(
      Object.assign(new Error("Resource not accessible by integration"), { status: 403 }),
    );
    expect(message).toContain("contents: write");
    expect(message).toContain("Read and write");
  });

  it("erkennt den 403-Text auch ohne Status", () => {
    expect(describeFailure(new Error("Resource not accessible by integration"))).toContain(
      "contents: write",
    );
  });

  it("404 zeigt auf repository und Token-Sichtbarkeit", () => {
    const message = describeFailure(Object.assign(new Error("Not Found"), { status: 404 }));
    expect(message).toContain("repository");
  });

  it("Rate-Limit nennt den Zeitpunkt", () => {
    const resetAt = new Date("2026-09-25T13:00:00Z");
    expect(describeFailure(new RateLimitError("erschoepft", resetAt))).toContain(
      resetAt.toISOString(),
    );
  });

  it("Konfigurationsfehler gehen unveraendert durch", () => {
    expect(describeFailure(new InputError("output_branch ist leer."))).toBe("output_branch ist leer.");
  });
});

describe("buildSummary", () => {
  function ergebnis(outcome: "dry-run" | "created", svgUrl: string) {
    return {
      stats: {
        commitsLast7Days: 3,
        daysSinceLastCommit: 1,
        openIssues: 2,
        closedIssuesLast30Days: 4,
        lastWorkflowConclusion: "success" as const,
      },
      state: { satiety: 55, health: 75, mood: "content" as const },
      svg: "<svg/>",
      svgUrl,
      outcome,
    };
  }

  it("nennt Zustand und Rohdaten", () => {
    const markdown = buildSummary(ergebnis("dry-run", ""), INPUTS);
    expect(markdown).toContain("| Saettigung | 55 / 100 |");
    expect(markdown).toContain("commitsLast7Days");
  });

  it("zeigt das Bild ueber die abgelegte URL, nie als data-URI", () => {
    // GitHub entfernt data:-Bilder beim Bereinigen der Job Summary. Ein so
    // eingebettetes SVG kam dort nie an und kostete rund 18 KB Base64 je
    // Lauf. An einem echten Lauf nachgewiesen, nicht vermutet.
    const markdown = buildSummary(ergebnis("created", "https://raw.example/pet.svg"), INPUTS);
    expect(markdown).toContain('<img src="https://raw.example/pet.svg"');
    expect(markdown).not.toContain("data:image");
  });

  it("bei dry_run gibt es kein Bild, dafuer den Quelltext und den Grund", () => {
    const markdown = buildSummary(ergebnis("dry-run", ""), INPUTS);
    expect(markdown).not.toContain("<img");
    expect(markdown).toContain("SVG-Quelltext");
    expect(markdown).toContain("Kein Vorschaubild");
  });
});

describe("action.yml passt zum Code", () => {
  const action = parseYaml(readFileSync("action.yml", "utf8")) as {
    inputs: Record<string, { default?: string }>;
    outputs: Record<string, unknown>;
    runs: { using: string; main: string };
  };

  it("laeuft auf node24", () => {
    // Node 20 wurde am 23.09.2026 aus den Runnern entfernt, samt Opt-out.
    expect(action.runs.using).toBe("node24");
  });

  it("zeigt auf das gebuendelte Skript", () => {
    expect(action.runs.main).toBe("dist/index.cjs");
  });

  it("deklariert genau die Inputs, die readInputs liest", () => {
    // Faengt die Drift in beide Richtungen: ein Input, den niemand liest,
    // und einer, der gelesen wird, aber in action.yml fehlt.
    expect(new Set(inputNamesReadBy())).toEqual(new Set(Object.keys(action.inputs)));
  });

  it("deklariert alle Outputs, die die Action setzt", async () => {
    const { octokit } = fakeOctokit();
    const { io, outputs } = recordingIo();
    await runAction({ octokit, inputs: INPUTS, io, now: NOW });

    expect(new Set(outputs.keys())).toEqual(new Set(Object.keys(action.outputs)));
  });

  it("verwendet Ausdruecke hoechstens in Input-Defaults", () => {
    // GitHub wertet `${{ ... }}` auch in `description` aus, und dort steht
    // der github-Kontext nicht zur Verfuegung. Ein Beispiel in dieser
    // Schreibweise laesst die Action gar nicht mehr laden - sie faellt mit
    // "Unrecognized named-value: 'github'" aus, bevor eine Zeile Code
    // laeuft. Genau das ist einmal passiert.
    const roh = readFileSync("action.yml", "utf8");
    const verdaechtig = roh
      .split("\n")
      .map((zeile, index) => `${index + 1}: ${zeile.trim()}`)
      .filter((zeile) => zeile.includes("${{") && !/^\d+: (#|default:)/.test(zeile));

    expect(verdaechtig).toEqual([]);
  });

  it("repository faellt auf den Workflow-Kontext zurueck", () => {
    expect(action.inputs["repository"]?.default).toBe("${{ github.repository }}");
  });
});

/**
 * Laesst readInputs einmal durchlaufen und sammelt dabei ein, welche Inputs
 * es ueberhaupt abfragt. Die Werte sind gueltig, damit es nicht vorher
 * abbricht und die spaeteren Namen verschluckt.
 */
function inputNamesReadBy(): string[] {
  const names: string[] = [];
  const values: Record<string, string> = {
    github_token: "ghs_token",
    repository: "owner/repo",
    output_branch: "pet-output",
    output_filename: "pet.svg",
    dry_run: "false",
  };
  readInputs({
    getInput: (name) => {
      names.push(name);
      return values[name] ?? "";
    },
    env: {},
  });
  return names;
}
