/**
 * Reine Ableitung: RepoStats -> PetState.
 *
 * Kein Netzwerk, kein Datum, kein Zufall – dieselben Stats ergeben immer
 * denselben Zustand. Alle Stellschrauben stehen als benannte Konstanten oben.
 */

import type { Mood, PetState, RepoStats, WorkflowConclusion } from "./types.js";

// ---------------------------------------------------------------------------
// Saettigung (satiety) – "wird das Repo gefuettert?"
// ---------------------------------------------------------------------------

/**
 * Commits in 7 Tagen, ab denen die Saettigung voll ist: 14 = zwei pro Tag.
 * Bewusst niedrig – ein gepflegtes Hobby-Repo soll satt sein koennen, ohne
 * dass jemand 50 Commits pro Woche braucht. Darueber saettigt die Kurve,
 * damit ein Merge-Sturm nicht mehr zaehlt als stetige Arbeit.
 */
export const SATIETY_COMMITS_FOR_FULL = 14;

/**
 * Tage ohne Commit, die noch keinen Abzug kosten. 2 deckt ein normales
 * Wochenende ab – Freitag committen und Montag wiederkommen ist kein Hunger.
 */
export const SATIETY_GRACE_DAYS = 2;

/**
 * Abzug pro Tag nach der Schonfrist. 12 Punkte heisst: ein volles Repo (100)
 * faellt nach gut einer Woche Stille auf 0. Das passt zum 7-Tage-Fenster von
 * `commitsLast7Days` – beide Signale laufen ungefaehr gleich schnell leer.
 */
export const SATIETY_DECAY_PER_DAY = 12;

/**
 * Sentinel fuer "es gibt ueberhaupt keinen Commit" (brandneues, leeres Repo).
 * Bewusst ein absurd grosser Tageswert statt `null`, damit die Rechnung unten
 * ohne Sonderfall auskommt und die Saettigung einfach auf 0 laeuft.
 */
export const NO_COMMITS_DAYS = 9999;

// ---------------------------------------------------------------------------
// Gesundheit (health) – "ist das Repo in Ordnung?"
// ---------------------------------------------------------------------------

/**
 * Startwert ohne jede Information. 70 statt 50, weil "nichts bekannt" nicht
 * dasselbe ist wie "es gibt Probleme": ein Repo ohne CI und ohne Issues ist
 * gesund, nur langweilig. Die Kreatur wird davon nicht krank.
 */
export const HEALTH_BASELINE = 70;

/**
 * Auf- und Abschlag je CI-Ergebnis.
 * - `success` (+25): hebt ein sonst neutrales Repo auf 95, nicht auf 100 –
 *   gruenes CI allein macht noch kein perfektes Repo.
 * - `failure` (-45): muss die Baseline unter MOOD_SICK_HEALTH druecken, damit
 *   rotes CI zuverlaessig "sick" ausloest. Das ist das lauteste Signal.
 * - `cancelled` (-10): spuerbar, aber mild – ein abgebrochener Lauf ist meist
 *   ein Mensch, der auf Stop gedrueckt hat, kein kaputter Code.
 * - `null` (0): kein CI eingerichtet -> keine Aussage, kein Abzug.
 */
export const HEALTH_CI_MODIFIER: Record<NonNullable<WorkflowConclusion>, number> = {
  success: 25,
  failure: -45,
  cancelled: -10,
};

/**
 * Noch akzeptabler Anteil offener Issues an allen "sichtbaren" Issues
 * (offen + in 30 Tagen geschlossen). 0.5 = auf jedes offene Issue kommt eines,
 * das im letzten Monat geschlossen wurde. Genau auf dem Wert gibt es weder
 * Bonus noch Abzug.
 */
export const ISSUE_BACKLOG_HEALTHY_RATIO = 0.5;

/**
 * Maximaler Abzug fuer einen wachsenden Backlog (Ratio 1.0 = nichts wird
 * geschlossen). 25 Punkte: schmerzhaft, aber allein noch kein "sick" –
 * ein Issue-Berg ist Vernachlaessigung, keine Krankheit.
 */
export const ISSUE_BACKLOG_PENALTY_MAX = 25;

/**
 * Maximaler Bonus fuer einen abgearbeiteten Backlog (Ratio 0). Absichtlich
 * kleiner als der Abzug: Issues schliessen ist der Normalfall, nicht die
 * Heldentat.
 */
export const ISSUE_BACKLOG_BONUS_MAX = 10;

/**
 * Unterhalb dieser Gesamtzahl an Issues ist die Ratio reines Rauschen
 * (ein einziges offenes Issue waere sofort Ratio 1.0). Dann gibt es weder
 * Bonus noch Abzug.
 */
export const ISSUE_ACTIVITY_MIN_SAMPLE = 3;

// ---------------------------------------------------------------------------
// Stimmung (mood) – Kombination aus beidem
// ---------------------------------------------------------------------------

/**
 * Unter diesem health-Wert ist die Kreatur krank, egal wie satt sie ist.
 * 40 liegt zwischen der Baseline mit `cancelled` (60) und der mit `failure`
 * (25) – nur echtes rotes CI oder eine Haeufung von Problemen kommt darunter.
 */
export const MOOD_SICK_HEALTH = 40;

/** Ab hier gilt die Kreatur als satt genug fuer "happy". */
export const MOOD_HAPPY_SATIETY = 70;

/** Und ab hier als gesund genug. Beides muss zutreffen. */
export const MOOD_HAPPY_HEALTH = 70;

/**
 * Unter diesem satiety-Wert ist die Kreatur traurig (hungrig/vergessen).
 * 35 entspricht grob 5 Commits in der Woche ohne Pause – wer weniger macht,
 * hat das Repo liegen lassen.
 */
export const MOOD_SAD_SATIETY = 35;

// ---------------------------------------------------------------------------

/** Begrenzt auf 0-100 und rundet auf ganze Punkte. */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * Saettigung aus Commit-Menge minus Stillstands-Abzug.
 * Beides zusammen, damit "viel committed, aber vor 6 Tagen" ebenso abfaellt
 * wie "seit Wochen nichts".
 */
function computeSatiety(stats: RepoStats): number {
  const commits = Math.max(0, stats.commitsLast7Days);
  const base = Math.min(1, commits / SATIETY_COMMITS_FOR_FULL) * 100;

  const idleDays = Math.max(0, stats.daysSinceLastCommit);
  const staleDays = Math.max(0, idleDays - SATIETY_GRACE_DAYS);
  const decay = staleDays * SATIETY_DECAY_PER_DAY;

  return clamp(base - decay);
}

/**
 * Gesundheit aus CI-Ergebnis und Issue-Verhaeltnis.
 * Fehlt eines von beidem, faellt der jeweilige Term einfach weg – nie ein
 * Abzug fuer fehlende Daten.
 */
function computeHealth(stats: RepoStats): number {
  const ci = stats.lastWorkflowConclusion;
  const ciModifier = ci === null ? 0 : HEALTH_CI_MODIFIER[ci] ?? 0;

  const open = Math.max(0, stats.openIssues);
  const closed = Math.max(0, stats.closedIssuesLast30Days);
  const total = open + closed;

  let issueModifier = 0;
  if (total >= ISSUE_ACTIVITY_MIN_SAMPLE) {
    const ratio = open / total;
    if (ratio > ISSUE_BACKLOG_HEALTHY_RATIO) {
      // Wie weit ueber "gesund", normiert auf den Rest bis 1.0.
      const excess = (ratio - ISSUE_BACKLOG_HEALTHY_RATIO) / (1 - ISSUE_BACKLOG_HEALTHY_RATIO);
      issueModifier = -excess * ISSUE_BACKLOG_PENALTY_MAX;
    } else {
      // Wie weit unter "gesund", normiert auf den Weg bis 0.
      const surplus = (ISSUE_BACKLOG_HEALTHY_RATIO - ratio) / ISSUE_BACKLOG_HEALTHY_RATIO;
      issueModifier = surplus * ISSUE_BACKLOG_BONUS_MAX;
    }
  }

  return clamp(HEALTH_BASELINE + ciModifier + issueModifier);
}

/**
 * Stimmung in fester Reihenfolge – die erste zutreffende Regel gewinnt.
 * Krankheit schlaegt alles: ein rotes CI bleibt sichtbar, auch wenn fleissig
 * committed wird.
 */
function computeMood(satiety: number, health: number): Mood {
  if (health < MOOD_SICK_HEALTH) return "sick";
  if (satiety >= MOOD_HAPPY_SATIETY && health >= MOOD_HAPPY_HEALTH) return "happy";
  if (satiety < MOOD_SAD_SATIETY) return "sad";
  return "content";
}

/**
 * Rechnet die gesammelten Stats in den Zustand der Kreatur um.
 * Rein: keine Seiteneffekte, keine Uhr, kein Netzwerk.
 */
export function deriveState(stats: RepoStats): PetState {
  const satiety = computeSatiety(stats);
  const health = computeHealth(stats);
  return { satiety, health, mood: computeMood(satiety, health) };
}
