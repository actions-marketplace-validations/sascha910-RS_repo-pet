/**
 * Sammelt die Repo-Aktivitaet ueber die GitHub-REST-API und normalisiert sie
 * zu `RepoStats`. Der einzige Teil des Projekts, der ins Netz geht.
 *
 * Grundsatz bei fehlenden Daten: kein Crash, sondern ein neutraler Default.
 * Ein Repo ohne Actions, ohne Issues oder ganz ohne Commits ist ein gueltiger
 * Zustand, kein Fehler. Echte Fehler (Rate-Limit, fehlende Rechte) werden
 * dagegen als solche gemeldet.
 */

import type { GitHub } from "@actions/github/lib/utils.js";

import { NO_COMMITS_DAYS } from "./state.js";
import type { RepoStats, WorkflowConclusion } from "./types.js";

export type Octokit = InstanceType<typeof GitHub>;

/** Fenster fuer `commitsLast7Days` – haengt an SATIETY_* in state.ts. */
const COMMIT_WINDOW_DAYS = 7;

/** Fenster fuer `closedIssuesLast30Days`. */
const CLOSED_ISSUE_WINDOW_DAYS = 30;

/**
 * Obergrenze an Seiten pro paginiertem Aufruf (100 Eintraege je Seite).
 * Die Saettigung ist ab 14 Commits voll und die Issue-Ratio ab ein paar
 * Dutzend Issues stabil – mehr als 500 Eintraege zu zaehlen aendert das
 * Ergebnis nicht mehr, kostet aber Requests und Rate-Limit.
 */
const MAX_PAGES = 5;

const PER_PAGE = 100;

/** Ein Fehler, der nicht am Repo liegt, sondern am API-Kontingent. */
export class RateLimitError extends Error {
  /** Zeitpunkt, ab dem es wieder geht – falls die API ihn mitliefert. */
  readonly resetAt: Date | null;

  constructor(message: string, resetAt: Date | null) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

/** Neutraler Zustand, wenn gar nichts abrufbar war. */
export function emptyStats(): RepoStats {
  return {
    commitsLast7Days: 0,
    daysSinceLastCommit: NO_COMMITS_DAYS,
    openIssues: 0,
    closedIssuesLast30Days: 0,
    lastWorkflowConclusion: null,
  };
}

interface HttpErrorish {
  status?: number;
  message?: string;
  response?: { headers?: Record<string, string | undefined> };
}

function asHttpError(error: unknown): HttpErrorish | null {
  return typeof error === "object" && error !== null ? (error as HttpErrorish) : null;
}

function statusOf(error: unknown): number | undefined {
  return asHttpError(error)?.status;
}

/**
 * Erkennt beide Rate-Limit-Varianten:
 * - primaer: 403/429 mit `x-ratelimit-remaining: 0`
 * - sekundaer (Abuse-Detection): 403/429 mit `retry-after` bzw. passender
 *   Meldung, dabei ist `remaining` oft noch > 0.
 */
function toRateLimitError(error: unknown, context: string): RateLimitError | null {
  const http = asHttpError(error);
  if (!http) return null;

  const status = http.status;
  if (status !== 403 && status !== 429) return null;

  const headers = http.response?.headers ?? {};
  const remaining = headers["x-ratelimit-remaining"];
  const retryAfter = headers["retry-after"];
  const message = http.message ?? "";
  const secondary = /secondary rate limit|abuse detection/i.test(message);

  if (remaining !== "0" && retryAfter === undefined && !secondary) {
    // 403 ohne Rate-Limit-Indiz ist schlicht "keine Berechtigung".
    return null;
  }

  let resetAt: Date | null = null;
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) resetAt = new Date(Date.now() + seconds * 1000);
  } else {
    const reset = Number(headers["x-ratelimit-reset"]);
    if (Number.isFinite(reset) && reset > 0) resetAt = new Date(reset * 1000);
  }

  const kind = secondary ? "Sekundaeres Rate-Limit" : "GitHub-API-Rate-Limit";
  const when = resetAt
    ? `Wieder verfuegbar ab ${resetAt.toISOString()} (in ca. ${Math.max(
        0,
        Math.ceil((resetAt.getTime() - Date.now()) / 60000),
      )} min).`
    : "Kein Reset-Zeitpunkt in der Antwort.";
  const hint = "Ein Token mit hoeherem Kontingent (GITHUB_TOKEN der Action) oder ein groesseres Abrufintervall hilft.";

  return new RateLimitError(`${kind} erreicht beim Abruf von ${context}. ${when} ${hint}`, resetAt);
}

/**
 * Fuehrt einen API-Aufruf aus und trennt drei Faelle:
 * - Rate-Limit -> `RateLimitError` (wird durchgereicht, das muss man sehen)
 * - "gibt es hier nicht" (404/409/451) -> `fallback`, kein Fehler
 * - alles andere -> Originalfehler mit Kontext im Text
 */
async function tolerant<T>(context: string, fallback: T, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const rateLimit = toRateLimitError(error, context);
    if (rateLimit) throw rateLimit;

    const status = statusOf(error);
    // 404: Feature deaktiviert oder nicht sichtbar. 409: leeres Repo ohne
    // Commits. 451: rechtlich gesperrt. Alles drei sind keine Defekte.
    if (status === 404 || status === 409 || status === 451) return fallback;

    const message = asHttpError(error)?.message ?? String(error);
    throw new Error(`Abruf von ${context} fehlgeschlagen${status ? ` (HTTP ${status})` : ""}: ${message}`);
  }
}

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Volle Tage zwischen zwei Zeitpunkten, nie negativ. */
function fullDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Nur die vier Conclusions, die die Kreatur unterscheidet – Rest ist `null`. */
function normalizeConclusion(raw: string | null | undefined): WorkflowConclusion {
  return raw === "success" || raw === "failure" || raw === "cancelled" ? raw : null;
}

interface CommitActivity {
  commitsLast7Days: number;
  /** Zeitstempel des neuesten Commits im Fenster, `null` wenn keiner drin war. */
  newest: Date | null;
}

/**
 * Zaehlt die Commits im 7-Tage-Fenster und merkt sich nebenbei den neuesten.
 * Die Liste kommt absteigend nach Datum, der erste Eintrag ist also der
 * juengste – damit spart `daysSinceLastCommit` im Normalfall einen Request.
 */
async function fetchCommitActivity(
  octokit: Octokit,
  owner: string,
  repo: string,
  now: Date,
): Promise<CommitActivity> {
  return tolerant("Commits", { commitsLast7Days: 0, newest: null }, async () => {
    let count = 0;
    let newest: Date | null = null;
    let pages = 0;

    const iterator = octokit.paginate.iterator(octokit.rest.repos.listCommits, {
      owner,
      repo,
      since: isoDaysAgo(now, COMMIT_WINDOW_DAYS),
      per_page: PER_PAGE,
    });

    for await (const page of iterator) {
      for (const commit of page.data) {
        count += 1;
        const stamp = commit.commit?.committer?.date ?? commit.commit?.author?.date;
        if (stamp) {
          const date = new Date(stamp);
          if (!Number.isNaN(date.getTime()) && (newest === null || date > newest)) newest = date;
        }
      }
      pages += 1;
      if (pages >= MAX_PAGES) break;
    }

    return { commitsLast7Days: count, newest };
  });
}

/**
 * Datum des letzten Commits ueberhaupt. Wird nur aufgerufen, wenn im
 * 7-Tage-Fenster nichts lag – ein Repo, an dem gearbeitet wird, kostet also
 * keinen Extra-Request.
 */
async function fetchLastCommitDate(octokit: Octokit, owner: string, repo: string): Promise<Date | null> {
  return tolerant("letzten Commit", null, async () => {
    const response = await octokit.rest.repos.listCommits({ owner, repo, per_page: 1 });
    const stamp = response.data[0]?.commit?.committer?.date ?? response.data[0]?.commit?.author?.date;
    if (!stamp) return null;
    const date = new Date(stamp);
    return Number.isNaN(date.getTime()) ? null : date;
  });
}

/**
 * Zaehlt offene und kuerzlich geschlossene Issues in einem Durchgang je
 * Zustand. `listForRepo` liefert auch Pull Requests – die haben ein
 * `pull_request`-Feld und werden hier herausgefiltert, weil ein offener PR
 * kein liegengebliebenes Issue ist.
 */
async function fetchIssueCounts(
  octokit: Octokit,
  owner: string,
  repo: string,
  now: Date,
): Promise<{ openIssues: number; closedIssuesLast30Days: number }> {
  const openIssues = await tolerant("offene Issues", 0, () =>
    countIssues(octokit, { owner, repo, state: "open", per_page: PER_PAGE }),
  );

  const cutoff = new Date(now.getTime() - CLOSED_ISSUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const closedIssuesLast30Days = await tolerant("geschlossene Issues", 0, () =>
    countIssues(
      octokit,
      {
        owner,
        repo,
        state: "closed",
        // `since` filtert nach updated_at, nicht nach closed_at – deshalb
        // unten zusaetzlich gegen closed_at pruefen.
        since: cutoff.toISOString(),
        sort: "updated",
        direction: "desc",
        per_page: PER_PAGE,
      },
      (issue) => {
        if (!issue.closed_at) return false;
        const closedAt = new Date(issue.closed_at);
        return !Number.isNaN(closedAt.getTime()) && closedAt >= cutoff;
      },
    ),
  );

  return { openIssues, closedIssuesLast30Days };
}

type IssueListParams = Parameters<Octokit["rest"]["issues"]["listForRepo"]>[0];
type IssueItem = { pull_request?: unknown; closed_at?: string | null };

async function countIssues(
  octokit: Octokit,
  params: IssueListParams,
  extra?: (issue: IssueItem) => boolean,
): Promise<number> {
  let count = 0;
  let pages = 0;

  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, params);

  for await (const page of iterator) {
    for (const issue of page.data as IssueItem[]) {
      if (issue.pull_request) continue;
      if (extra && !extra(issue)) continue;
      count += 1;
    }
    pages += 1;
    if (pages >= MAX_PAGES) break;
  }

  return count;
}

/**
 * Letzter abgeschlossener Workflow-Lauf. `status: "completed"` sorgt dafuer,
 * dass ein gerade laufender Build nicht als Ergebnis zaehlt – sonst waere die
 * Kreatur waehrend jedes CI-Laufs kurz ohne Aussage.
 */
async function fetchLastWorkflowConclusion(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<WorkflowConclusion> {
  return tolerant("Workflow-Laeufe", null, async () => {
    const response = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      status: "completed",
      per_page: 1,
    });
    return normalizeConclusion(response.data.workflow_runs[0]?.conclusion);
  });
}

export interface CollectOptions {
  /** Referenzzeitpunkt, ueberschreibbar fuer Tests. Default: jetzt. */
  now?: Date;
}

/**
 * Holt alle Kennzahlen fuer ein Repo.
 *
 * Wirft nur bei echten Problemen: `RateLimitError` bei erschoepftem
 * Kontingent, sonst einen `Error` mit Endpunkt und HTTP-Status im Text.
 * Fehlende Features (kein CI, keine Issues, leeres Repo) ergeben Defaults.
 */
export async function collectStats(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: CollectOptions = {},
): Promise<RepoStats> {
  const now = options.now ?? new Date();

  // Parallel: die vier Abrufe haengen nicht voneinander ab.
  const [commits, issues, lastWorkflowConclusion] = await Promise.all([
    fetchCommitActivity(octokit, owner, repo, now),
    fetchIssueCounts(octokit, owner, repo, now),
    fetchLastWorkflowConclusion(octokit, owner, repo),
  ]);

  let daysSinceLastCommit: number;
  if (commits.newest) {
    daysSinceLastCommit = fullDaysBetween(commits.newest, now);
  } else {
    const last = await fetchLastCommitDate(octokit, owner, repo);
    daysSinceLastCommit = last ? fullDaysBetween(last, now) : NO_COMMITS_DAYS;
  }

  return {
    commitsLast7Days: commits.commitsLast7Days,
    daysSinceLastCommit,
    openIssues: issues.openIssues,
    closedIssuesLast30Days: issues.closedIssuesLast30Days,
    lastWorkflowConclusion,
  };
}
