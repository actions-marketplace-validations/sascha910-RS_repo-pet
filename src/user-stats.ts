/**
 * Sammler fuer eine Person statt eines Repos.
 *
 * Liefert bewusst dieselbe `RepoStats`-Struktur wie `collectStats()`. Damit
 * bleiben `deriveState()`, der Renderer und alles dahinter unberuehrt – die
 * Schnittstelle aus der ersten Session traegt genau diesen Fall. Was sich
 * aendert, ist nur, woher die fuenf Zahlen kommen.
 *
 * Alles laeuft ueber **eine** GraphQL-Abfrage. Ueber REST waeren es ein
 * Aufruf pro Repo plus zwei Suchen; GraphQL beantwortet es in einem Request,
 * und die Action laeuft taeglich in fremden Repos mit fremdem Kontingent.
 *
 * Grenze, die man kennen muss: mit dem `GITHUB_TOKEN` eines Workflows sind
 * nur **oeffentliche** Beitraege sichtbar. Private tauchen als
 * `restrictedContributionsCount` auf und zaehlen nicht mit. Wer sie mitzaehlen
 * will, braucht einen PAT mit `read:user` und die Profileinstellung
 * "Include private contributions on my profile".
 */

import { CLOSED_ISSUE_WINDOW_DAYS, COMMIT_WINDOW_DAYS, fullDaysBetween, type Octokit } from "./stats.js";
import { NO_COMMITS_DAYS } from "./state.js";
import type { RepoStats, WorkflowConclusion } from "./types.js";

/**
 * Wie viele Repos in den CI-Querschnitt eingehen, nach letztem Push sortiert.
 *
 * 10, weil das die Projekte sind, an denen jemand tatsaechlich arbeitet. Ein
 * Repo, das seit drei Jahren liegt und dessen CI nie gruen war, wuerde die
 * Anzeige sonst fuer immer nach unten ziehen – und daran kann man nichts
 * aendern ausser es zu loeschen.
 */
export const USER_REPO_SAMPLE = 10;

/**
 * Fenster, in dem nach dem letzten aktiven Tag gesucht wird.
 *
 * Deutlich groesser als das Commit-Fenster: `daysSinceLastCommit` soll auch
 * dann stimmen, wenn jemand zwei Monate nichts gemacht hat. Laenger als 90
 * Tage braucht es nicht – die Saettigung ist da laengst auf 0.
 */
export const USER_ACTIVITY_WINDOW_DAYS = 90;

/**
 * Ab welchem Anteil roter Repos der Querschnitt als "kaputt" gilt.
 *
 * Ueber der Haelfte. Ein einzelnes rotes Nebenprojekt macht die Person nicht
 * krank; die Mehrheit rot schon. Dazwischen liefert der Querschnitt bewusst
 * `null` – "gemischt" ist keine Aussage, und fehlende Aussagen kosten in
 * `state.ts` nie Abzug.
 */
export const USER_CI_FAILURE_SHARE = 0.5;

/** Ein Tag aus dem Beitragskalender. */
interface ContributionDay {
  readonly date: string;
  readonly contributionCount: number;
}

interface UserStatsResponse {
  readonly user: {
    readonly commits: {
      readonly totalCommitContributions: number;
      readonly restrictedContributionsCount: number;
    };
    readonly activity: {
      readonly contributionCalendar: {
        readonly weeks: readonly { readonly contributionDays: readonly ContributionDay[] }[];
      };
    };
    readonly repositories: {
      readonly nodes: readonly {
        readonly nameWithOwner: string;
        readonly defaultBranchRef: {
          readonly target: { readonly statusCheckRollup: { readonly state: string } | null } | null;
        } | null;
      }[];
    };
  } | null;
  readonly open: { readonly issueCount: number };
  readonly closed: { readonly issueCount: number };
}

const QUERY = `
query($login:String!, $from7:DateTime!, $fromWindow:DateTime!, $sample:Int!, $openQ:String!, $closedQ:String!) {
  user(login:$login) {
    commits: contributionsCollection(from:$from7) {
      totalCommitContributions
      restrictedContributionsCount
    }
    activity: contributionsCollection(from:$fromWindow) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
    repositories(first:$sample, orderBy:{field:PUSHED_AT,direction:DESC}, ownerAffiliations:OWNER, isFork:false) {
      nodes {
        nameWithOwner
        defaultBranchRef { target { ... on Commit { statusCheckRollup { state } } } }
      }
    }
  }
  open: search(query:$openQ, type:ISSUE) { issueCount }
  closed: search(query:$closedQ, type:ISSUE) { issueCount }
}`;

/**
 * Fasst die CI-Lage mehrerer Repos zu einer Aussage zusammen.
 *
 * Drei Ausgaenge statt zwei: alles gruen, mehrheitlich rot, oder – dazwischen
 * – keine Aussage. Das letzte ist wichtig, weil `state.ts` `null` als
 * "unbekannt" behandelt und dafuer weder Bonus noch Abzug vergibt. Ein
 * gemischtes Bild soll genau das sein: kein Urteil.
 *
 * Repos ohne Rollup (kein CI eingerichtet) zaehlen gar nicht mit.
 */
export function ciCrossSection(states: readonly (string | null | undefined)[]): WorkflowConclusion {
  const known = states.filter((state): state is string => state === "SUCCESS" || state === "FAILURE" || state === "ERROR");
  if (known.length === 0) return null;

  const red = known.filter((state) => state !== "SUCCESS").length;
  if (red === 0) return "success";
  if (red / known.length > USER_CI_FAILURE_SHARE) return "failure";
  return null;
}

/**
 * Volle Tage seit dem letzten Tag mit irgendeinem Beitrag.
 *
 * Bewusst *Beitrag* und nicht *Commit*: wer eine Woche lang Reviews schreibt
 * und Issues beantwortet, hat sein Repo nicht vergessen. Die Commit-Menge
 * darueber zaehlt weiterhin nur Commits – der Unterschied ist Absicht.
 *
 * Ohne einen einzigen aktiven Tag im Fenster greift `NO_COMMITS_DAYS`,
 * derselbe Sentinel wie im Repo-Sammler.
 */
export function daysSinceLastActivity(days: readonly ContributionDay[], now: Date): number {
  const active = days.filter((day) => day.contributionCount > 0).map((day) => day.date);
  if (active.length === 0) return NO_COMMITS_DAYS;

  const latest = active.reduce((a, b) => (a > b ? a : b));
  return fullDaysBetween(new Date(`${latest}T00:00:00Z`), now);
}

export interface CollectUserOptions {
  /** Referenzzeitpunkt, ueberschreibbar fuer Tests. Default: jetzt. */
  now?: Date;
}

function isoAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Holt alle Kennzahlen fuer eine Person. */
export async function collectUserStats(
  octokit: Octokit,
  login: string,
  options: CollectUserOptions = {},
): Promise<RepoStats> {
  const now = options.now ?? new Date();
  const closedSince = isoAgo(now, CLOSED_ISSUE_WINDOW_DAYS).slice(0, 10);

  const response = await octokit.graphql<UserStatsResponse>(QUERY, {
    login,
    from7: isoAgo(now, COMMIT_WINDOW_DAYS),
    fromWindow: isoAgo(now, USER_ACTIVITY_WINDOW_DAYS),
    sample: USER_REPO_SAMPLE,
    // `user:` schraenkt die Suche auf Repos dieser Person ein - damit zaehlen
    // auch Issues mit, die andere dort aufgemacht haben. Genau darum geht es:
    // gemessen wird der Zustand der eigenen Projekte, nicht die eigene
    // Schreibleistung.
    openQ: `user:${login} is:issue is:open archived:false`,
    closedQ: `user:${login} is:issue is:closed closed:>=${closedSince} archived:false`,
  });

  const user = response.user;
  if (!user) {
    throw new Error(`User "${login}" not found, or not visible to this token.`);
  }

  const days = user.activity.contributionCalendar.weeks.flatMap((week) => week.contributionDays);
  const ciStates = user.repositories.nodes.map(
    (repo) => repo.defaultBranchRef?.target?.statusCheckRollup?.state,
  );

  return {
    commitsLast7Days: user.commits.totalCommitContributions,
    daysSinceLastCommit: daysSinceLastActivity(days, now),
    openIssues: response.open.issueCount,
    closedIssuesLast30Days: response.closed.issueCount,
    lastWorkflowConclusion: ciCrossSection(ciStates),
  };
}
