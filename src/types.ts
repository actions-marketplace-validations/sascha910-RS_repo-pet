/**
 * Gemeinsame Typen fuer Sammler (stats.ts) und Ableitung (state.ts).
 *
 * `RepoStats` ist die einzige Schnittstelle zwischen "Netzwerk" und "Logik":
 * alles, was `deriveState()` braucht, steht hier drin – damit bleibt die
 * Ableitung rein und ohne Mocks testbar.
 */

/**
 * Abschluss des zuletzt beendeten Workflow-Laufs.
 *
 * Die GitHub-API kennt mehr Conclusions (`skipped`, `timed_out`, `neutral`,
 * `action_required`, ...). Wir mappen bewusst auf drei Faelle plus `null`,
 * weil die Kreatur nur "CI ok / CI kaputt / abgebrochen / unbekannt"
 * unterscheiden muss. `null` heisst: kein CI eingerichtet oder noch kein
 * abgeschlossener Lauf – das ist neutral, nicht schlecht.
 */
export type WorkflowConclusion = "success" | "failure" | "cancelled" | null;

/** Stimmung der Kreatur, abgeleitet aus `satiety` und `health`. */
export type Mood = "happy" | "content" | "sad" | "sick";

/** Rohdaten aus der GitHub-API, bereits normalisiert. */
export interface RepoStats {
  /** Commits auf dem Default-Branch der letzten 7 Tage. */
  commitsLast7Days: number;
  /**
   * Volle Tage seit dem letzten Commit.
   *
   * Bei einem brandneuen, leeren Repo gibt es keinen Commit. Statt `null`
   * (was jede Rechnung anfassen muesste) verwenden wir dann
   * `NO_COMMITS_DAYS` als Sentinel – siehe state.ts.
   */
  daysSinceLastCommit: number;
  /** Aktuell offene Issues (ohne Pull Requests). */
  openIssues: number;
  /** In den letzten 30 Tagen geschlossene Issues (ohne Pull Requests). */
  closedIssuesLast30Days: number;
  /** Abschluss des letzten beendeten Workflow-Laufs, `null` wenn keiner existiert. */
  lastWorkflowConclusion: WorkflowConclusion;
}

/** Abgeleiteter Zustand der Kreatur – das spaetere SVG rendert genau das. */
export interface PetState {
  /** Saettigung 0-100: wie gut wird das Repo "gefuettert" (Commits). */
  satiety: number;
  /** Gesundheit 0-100: CI-Status und Issue-Hygiene. */
  health: number;
  /** Stimmung, kombiniert aus beiden Werten. */
  mood: Mood;
}
