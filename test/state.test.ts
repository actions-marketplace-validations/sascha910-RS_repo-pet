import { describe, expect, it } from "vitest";

import {
  MOOD_HAPPY_HEALTH,
  MOOD_HAPPY_SATIETY,
  MOOD_SAD_SATIETY,
  MOOD_SICK_HEALTH,
  NO_COMMITS_DAYS,
  deriveState,
} from "../src/state.js";
import type { RepoStats } from "../src/types.js";

/** Neutrale Basis – einzelne Felder werden je Fixture ueberschrieben. */
function stats(overrides: Partial<RepoStats> = {}): RepoStats {
  return {
    commitsLast7Days: 0,
    daysSinceLastCommit: NO_COMMITS_DAYS,
    openIssues: 0,
    closedIssuesLast30Days: 0,
    lastWorkflowConclusion: null,
    ...overrides,
  };
}

describe("deriveState – die vier Stimmungen", () => {
  it("happy: taeglich committed, gruenes CI, Backlog abgearbeitet", () => {
    const state = deriveState(
      stats({
        commitsLast7Days: 20,
        daysSinceLastCommit: 0,
        openIssues: 2,
        closedIssuesLast30Days: 10,
        lastWorkflowConclusion: "success",
      }),
    );

    expect(state.mood).toBe("happy");
    expect(state.satiety).toBeGreaterThanOrEqual(MOOD_HAPPY_SATIETY);
    expect(state.health).toBeGreaterThanOrEqual(MOOD_HAPPY_HEALTH);
  });

  it("content: solide Aktivitaet, kein CI, ausgeglichener Backlog", () => {
    const state = deriveState(
      stats({
        commitsLast7Days: 7,
        daysSinceLastCommit: 1,
        openIssues: 5,
        closedIssuesLast30Days: 5,
        lastWorkflowConclusion: null,
      }),
    );

    expect(state.mood).toBe("content");
    expect(state.satiety).toBeGreaterThanOrEqual(MOOD_SAD_SATIETY);
    expect(state.satiety).toBeLessThan(MOOD_HAPPY_SATIETY);
    expect(state.health).toBeGreaterThanOrEqual(MOOD_SICK_HEALTH);
  });

  it("sad: seit zehn Tagen nichts passiert, aber alles heil", () => {
    const state = deriveState(
      stats({
        commitsLast7Days: 1,
        daysSinceLastCommit: 10,
        openIssues: 1,
        closedIssuesLast30Days: 4,
        lastWorkflowConclusion: "success",
      }),
    );

    expect(state.mood).toBe("sad");
    expect(state.satiety).toBeLessThan(MOOD_SAD_SATIETY);
    expect(state.health).toBeGreaterThanOrEqual(MOOD_SICK_HEALTH);
  });

  it("sick: rotes CI schlaegt selbst fleissiges Committen", () => {
    const state = deriveState(
      stats({
        commitsLast7Days: 25,
        daysSinceLastCommit: 0,
        openIssues: 3,
        closedIssuesLast30Days: 9,
        lastWorkflowConclusion: "failure",
      }),
    );

    expect(state.mood).toBe("sick");
    expect(state.health).toBeLessThan(MOOD_SICK_HEALTH);
    // Satt und trotzdem krank – Gesundheit hat Vorrang vor Saettigung.
    expect(state.satiety).toBe(100);
  });
});

describe("deriveState – fehlende Daten", () => {
  it("brandneues, leeres Repo: kein Commit, kein CI, keine Issues", () => {
    const state = deriveState(stats());

    expect(state).toEqual({ satiety: 0, health: 70, mood: "sad" });
    // Kein CI und keine Issues duerfen nicht als Krankheit gelten.
    expect(state.mood).not.toBe("sick");
  });

  it("kein CI eingerichtet zieht keine Punkte ab", () => {
    const base = { commitsLast7Days: 5, daysSinceLastCommit: 1, openIssues: 4, closedIssuesLast30Days: 4 };
    const ohneCi = deriveState(stats({ ...base, lastWorkflowConclusion: null }));
    const mitFailure = deriveState(stats({ ...base, lastWorkflowConclusion: "failure" }));

    expect(ohneCi.health).toBe(70);
    expect(mitFailure.health).toBeLessThan(ohneCi.health);
  });

  it("zu wenige Issues werden als Rauschen ignoriert", () => {
    const base = { commitsLast7Days: 5, daysSinceLastCommit: 1, lastWorkflowConclusion: null } as const;
    const keineIssues = deriveState(stats({ ...base, openIssues: 0, closedIssuesLast30Days: 0 }));
    const einOffenes = deriveState(stats({ ...base, openIssues: 1, closedIssuesLast30Days: 0 }));

    // Ein einziges offenes Issue waere Ratio 1.0 – das darf nicht durchschlagen.
    expect(einOffenes.health).toBe(keineIssues.health);
  });

  it("cancelled ist milder als failure", () => {
    const base = { commitsLast7Days: 5, daysSinceLastCommit: 1, openIssues: 2, closedIssuesLast30Days: 2 };
    const cancelled = deriveState(stats({ ...base, lastWorkflowConclusion: "cancelled" }));
    const failure = deriveState(stats({ ...base, lastWorkflowConclusion: "failure" }));

    expect(cancelled.health).toBeGreaterThan(failure.health);
    expect(cancelled.mood).not.toBe("sick");
    expect(failure.mood).toBe("sick");
  });
});

describe("deriveState – Wertebereiche und Reinheit", () => {
  it("haelt satiety und health in 0-100, auch bei absurden Eingaben", () => {
    const extrem = deriveState(
      stats({
        commitsLast7Days: 100_000,
        daysSinceLastCommit: -5,
        openIssues: 9_000,
        closedIssuesLast30Days: 0,
        lastWorkflowConclusion: "failure",
      }),
    );

    expect(extrem.satiety).toBeGreaterThanOrEqual(0);
    expect(extrem.satiety).toBeLessThanOrEqual(100);
    expect(extrem.health).toBeGreaterThanOrEqual(0);
    expect(extrem.health).toBeLessThanOrEqual(100);
  });

  it("veraendert die Eingabe nicht und ist deterministisch", () => {
    const input = stats({ commitsLast7Days: 9, daysSinceLastCommit: 2, openIssues: 3, closedIssuesLast30Days: 7 });
    const kopie = { ...input };

    expect(deriveState(input)).toEqual(deriveState(input));
    expect(input).toEqual(kopie);
  });
});
