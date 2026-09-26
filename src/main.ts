/**
 * Der Ablauf der Action: sammeln, ableiten, rendern, veroeffentlichen.
 *
 * `runAction()` bekommt alles, was es braucht, als Parameter – Octokit, die
 * geprueften Inputs und einen Ausgabekanal. Es importiert `@actions/core`
 * nicht. Das Verdrahten mit der echten Umgebung passiert in `entry.ts`.
 *
 * Der Grund ist derselbe wie bei `deriveState()`: was seine Abhaengigkeiten
 * als Parameter nimmt, laesst sich ohne Modul-Mocks testen. Ein Test stellt
 * hier ein Octokit-Double und einen Sammler hin und liest hinterher ab, was
 * passiert ist – inklusive der Frage, ob ueberhaupt etwas geschrieben wurde.
 */

import { publishSvg, type PublishOutcome } from "./publish.js";
import { renderPet } from "./render.js";
import { collectStats, RateLimitError, type Octokit } from "./stats.js";
import { collectUserStats } from "./user-stats.js";
import { deriveState } from "./state.js";
import { describeSubject, InputError, type ActionInputs } from "./inputs.js";
import type { PetState, RepoStats } from "./types.js";

/**
 * Der Ausgabekanal der Action.
 *
 * Deckt genau den Ausschnitt von `@actions/core` ab, den der Ablauf benutzt.
 * Eng gehalten, damit ein Test ihn in fuenf Zeilen nachbauen kann.
 */
export interface ActionIo {
  info(message: string): void;
  warning(message: string): void;
  setOutput(name: string, value: string): void;
  writeSummary(markdown: string): Promise<void>;
}

export interface ActionDeps {
  readonly octokit: Octokit;
  readonly inputs: ActionInputs;
  readonly io: ActionIo;
  /** Referenzzeitpunkt, ueberschreibbar fuer Tests. Default: jetzt. */
  readonly now?: Date;
}

/**
 * Wie der Lauf ausgegangen ist.
 *
 * `"dry-run"` und `"unchanged"` erzeugen beide keinen Commit, sind aber
 * nicht dasselbe: im zweiten Fall *liegt* die Datei da und hat eine URL.
 * Ein einzelnes Boolean hat diesen Unterschied verschluckt.
 */
export type ActionOutcome = "dry-run" | PublishOutcome;

export interface ActionResult {
  readonly stats: RepoStats;
  readonly state: PetState;
  readonly svg: string;
  /** URL der abgelegten Datei. Leer nur bei `dry_run`. */
  readonly svgUrl: string;
  readonly outcome: ActionOutcome;
}

/**
 * Die URL, unter der das SVG spaeter haengt.
 *
 * `raw.githubusercontent.com` und nicht `github.com/.../blob/...`: nur die
 * raw-Adresse liefert `content-type: image/svg+xml` und laesst sich damit in
 * ein `<img>` haengen. Siehe `docs/caching.md`.
 */
export function svgRawUrl(inputs: ActionInputs): string {
  const { owner, repo } = inputs.target;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${inputs.outputBranch}/${inputs.outputFilename}`;
}

/**
 * Die Zusammenfassung fuer den Actions-Tab.
 *
 * Das Vorschaubild zeigt auf die abgelegte Datei und erscheint deshalb nur,
 * wenn es sie gibt. Hier stand einmal ein `data:`-URI, damit auch ein
 * `dry_run` die Kreatur zeigt – aber **GitHub entfernt `data:`-Bilder beim
 * Bereinigen der Job Summary**. Angekommen ist nie etwas, und jede
 * Zusammenfassung schleppte rund 18 KB Base64 mit. Eine `https`-URL
 * ueberlebt die Bereinigung.
 *
 * Dass ein `dry_run` damit ohne Bild dasteht, ist der Preis. Der Quelltext
 * steht dort eingeklappt darunter; mehr geht nicht, solange die Datei
 * nirgends liegt.
 */
export function buildSummary(result: ActionResult, inputs: ActionInputs): string {
  const { state, stats } = result;

  const lines = ["## repo-pet", ""];

  if (result.svgUrl !== "") {
    // Kurz nach einem Commit kann raw.githubusercontent.com fuer bis zu fuenf
    // Minuten noch die vorige Fassung ausliefern (max-age=300). Fuer eine
    // Zusammenfassung ist das hinnehmbar – siehe docs/caching.md.
    lines.push(
      `<img src="${result.svgUrl}" alt="repo-pet: ${state.mood}" width="112" height="120">`,
      "",
    );
  }

  lines.push(
    "| | |",
    "| --- | --- |",
    `| Mood | \`${state.mood}\` |`,
    `| Satiety | ${state.satiety} / 100 |`,
    `| Health | ${state.health} / 100 |`,
    `| Measured | \`${describeSubject(inputs.subject)}\` |`,
    "",
    "<details><summary>Raw data</summary>",
    "",
    "```json",
    JSON.stringify(stats, null, 2),
    "```",
    "",
    "</details>",
  );

  const location = `[\`${inputs.outputBranch}/${inputs.outputFilename}\`](${result.svgUrl})`;

  if (result.outcome === "created") {
    lines.push("", `Branch \`${inputs.outputBranch}\` created, the SVG lives at ${location}.`);
  } else if (result.outcome === "updated") {
    lines.push("", `Updated: ${location}.`);
  } else if (result.outcome === "unchanged") {
    lines.push("", `Unchanged, no commit needed. It still lives at ${location}.`);
  } else {
    lines.push(
      "",
      "> **dry_run** - nothing written. No commit, no branch, no `svg_url`.",
      ">",
      "> No preview image: there is no URL yet, and GitHub strips `data:` images",
      "> from job summaries. The source is below.",
      "",
      "<details><summary>SVG source</summary>",
      "",
      "```xml",
      result.svg,
      "```",
      "",
      "</details>",
    );
  }

  return lines.join("\n");
}

/**
 * Uebersetzt einen Fehler in eine Meldung, die dem Lesenden weiterhilft.
 *
 * Die drei Faelle unten sind die, die real vorkommen. Besonders der erste:
 * ein fehlendes `permissions: contents: write` meldet die API als
 * "Resource not accessible by integration" – ein Satz, der nicht verraet,
 * was zu tun ist. Genau deshalb steht er hier.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof InputError) return error.message;

  if (error instanceof RateLimitError) {
    const until = error.resetAt ? ` Available again at ${error.resetAt.toISOString()}.` : "";
    return `GitHub API rate limit exhausted.${until}`;
  }

  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 403 || /not accessible by integration/i.test(message)) {
    return (
      `No write access (HTTP 403): ${message}\n` +
      "The job is almost certainly missing a permission. In your workflow file:\n" +
      "\n    permissions:\n      contents: write\n\n" +
      'If that is already there: under Settings > Actions > General, "Workflow ' +
      'permissions" has to be set to "Read and write" - otherwise the block is ' +
      "silently narrowed to read-only."
    );
  }

  if (status === 404) {
    return (
      `Not found (HTTP 404): ${message}\n` +
      "Either `repository` is wrong, or the token cannot see the repository. " +
      "A private repository needs `contents: read` on the job."
    );
  }

  return message;
}

/**
 * Sammelt, leitet ab, rendert – und veroeffentlicht, sofern erlaubt.
 *
 * Die Outputs werden gesetzt, bevor irgendetwas geschrieben wird: schlaegt
 * der Commit fehl, sollen `mood`, `satiety` und `health` trotzdem am Job
 * haengen. Der Zustand ist zu dem Zeitpunkt bereits ermittelt, und ihn
 * wegzuwerfen, weil ein Branch klemmt, waere Unsinn.
 */
export async function runAction(deps: ActionDeps): Promise<ActionResult> {
  const { octokit, inputs, io } = deps;

  const when = deps.now ? { now: deps.now } : {};
  // Zwei Sammler, eine Struktur: beide liefern `RepoStats`, damit alles
  // dahinter – Ableitung, Renderer, Tests – den Unterschied nicht kennt.
  const stats =
    inputs.subject.kind === "user"
      ? await collectUserStats(octokit, inputs.subject.login, when)
      : await collectStats(octokit, inputs.subject.repo.owner, inputs.subject.repo.repo, when);
  const state = deriveState(stats);
  const svg = renderPet(state);

  io.info(
    `${describeSubject(inputs.subject)}: ${state.mood} ` +
      `(satiety ${state.satiety}, health ${state.health}, ${svg.length} bytes SVG)`,
  );

  io.setOutput("mood", state.mood);
  io.setOutput("satiety", String(state.satiety));
  io.setOutput("health", String(state.health));

  let result: ActionResult;

  if (inputs.dryRun) {
    io.info("dry_run: nothing written.");
    // Absichtlich leer statt der spaeteren URL: ein nachgelagerter Schritt,
    // der `svg_url` einbettet, zeigte sonst auf eine Datei, die es nicht gibt.
    io.setOutput("svg_url", "");
    result = { stats, state, svg, svgUrl: "", outcome: "dry-run" };
  } else {
    const published = await publishSvg(octokit, {
      owner: inputs.target.owner,
      repo: inputs.target.repo,
      branch: inputs.outputBranch,
      path: inputs.outputFilename,
      content: svg,
      message:
        `repo-pet: ${state.mood} (satiety ${state.satiety}, ` +
        `health ${state.health})`,
    });

    const svgUrl = svgRawUrl(inputs);
    io.setOutput("svg_url", svgUrl);
    io.info(
      published.outcome === "unchanged"
        ? "Unchanged, no commit."
        : `${published.outcome === "created" ? "Branch created" : "Updated"}: ${published.commitSha}`,
    );
    result = { stats, state, svg, svgUrl, outcome: published.outcome };
  }

  await io.writeSummary(buildSummary(result, inputs));
  return result;
}
