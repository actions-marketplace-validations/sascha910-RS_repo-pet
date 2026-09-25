import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  HEALTH_BASELINE,
  HEALTH_CI_MODIFIER,
  ISSUE_BACKLOG_BONUS_MAX,
  ISSUE_BACKLOG_PENALTY_MAX,
  MOOD_HAPPY_HEALTH,
  MOOD_HAPPY_SATIETY,
  MOOD_SAD_SATIETY,
  MOOD_SICK_HEALTH,
  SATIETY_COMMITS_FOR_FULL,
  SATIETY_DECAY_PER_DAY,
  SATIETY_GRACE_DAYS,
} from "../src/state.js";
import { COMMIT_WINDOW_DAYS } from "../src/stats.js";

/**
 * Der Abschnitt "Wie der Zustand berechnet wird" nennt dreizehn Zahlen, und
 * jede davon steht in `src/state.ts` noch einmal – in zwei Sprachen sogar
 * dreimal. Wer eine Konstante nachjustiert, denkt nicht an zwei READMEs.
 *
 * Dieser Test faengt genau das. Er prueft nicht den Text, sondern die Zahlen
 * darin: jedes Muster unten greift eine Stelle ab und vergleicht sie mit der
 * Konstante. Passt der Text nicht mehr zum Muster, schlaegt er ebenfalls fehl
 * – auch das ist Absicht, denn wer diesen Abschnitt umformuliert, soll die
 * Zahlen noch einmal ansehen.
 */

/**
 * Vereinheitlicht den Text vor dem Vergleich.
 *
 * Das README setzt typografisch korrekt: echtes Minus (U+2212) statt
 * Bindestrich und "groesser gleich" (U+2265) statt `>=`. Die Muster unten
 * bleiben dadurch reines ASCII – sonst stuenden Sonderzeichen in einer
 * Quelldatei, und Zeilenumbrueche im Fliesstext wuerden jedes Muster
 * zerreissen.
 */
function normalisiere(markdown: string): string {
  return markdown
    .replace(/−/g, "-")
    .replace(/≥/g, ">=")
    .replace(/\s+/g, " ");
}

interface Erwartung {
  /** Was geprueft wird – landet in der Fehlermeldung. */
  readonly label: string;
  readonly muster: RegExp;
  readonly werte: readonly number[];
}

/**
 * Die Stimmungstabelle. Die Muster haengen sich an die Code-Spans der
 * Stimmungsnamen, und die sind in beiden Sprachen gleich – deshalb braucht
 * es sie nur einmal.
 */
const TABELLE: readonly Erwartung[] = [
  {
    label: "sick-Schwelle",
    muster: /\| `sick` \| [^|]*?(\d+) \|/,
    werte: [MOOD_SICK_HEALTH],
  },
  {
    label: "happy-Schwellen (Saettigung und Gesundheit)",
    muster: /\| `happy` \| [^|]*?>= (\d+) [^|]*?>= (\d+) \|/,
    werte: [MOOD_HAPPY_SATIETY, MOOD_HAPPY_HEALTH],
  },
  {
    label: "sad-Schwelle",
    muster: /\| `sad` \| [^|]*?(\d+) \|/,
    werte: [MOOD_SAD_SATIETY],
  },
];

const DEUTSCH: readonly Erwartung[] = [
  {
    label: "Commit-Fenster und Saettigungsmenge",
    muster: /letzten (\d+) Tage: (\d+) Commits sind voll/,
    werte: [COMMIT_WINDOW_DAYS, SATIETY_COMMITS_FOR_FULL],
  },
  {
    label: "Abzug pro Tag und Schonfrist",
    muster: /werden (\d+) Punkte pro Tag ohne Commit, nach (\d+) Tagen Schonfrist/,
    werte: [SATIETY_DECAY_PER_DAY, SATIETY_GRACE_DAYS],
  },
  {
    label: "Gesundheits-Baseline",
    muster: /startet bei (\d+)\./,
    werte: [HEALTH_BASELINE],
  },
  {
    label: "CI-Modifikatoren",
    muster: /CI gibt \+(\d+), rotes -(\d+), abgebrochenes -(\d+)\./,
    werte: [HEALTH_CI_MODIFIER.success, -HEALTH_CI_MODIFIER.failure, -HEALTH_CI_MODIFIER.cancelled],
  },
  {
    label: "Issue-Bonus und -Abzug",
    muster: /Issues: bis \+(\d+), bis -(\d+)\./,
    werte: [ISSUE_BACKLOG_BONUS_MAX, ISSUE_BACKLOG_PENALTY_MAX],
  },
  ...TABELLE,
];

const ENGLISCH: readonly Erwartung[] = [
  {
    label: "commit window and satiety amount",
    muster: /last (\d+) days: (\d+) commits is full/,
    werte: [COMMIT_WINDOW_DAYS, SATIETY_COMMITS_FOR_FULL],
  },
  {
    label: "decay per day and grace period",
    muster: /(\d+) points are subtracted per day without a commit, after a (\d+)-day grace/,
    werte: [SATIETY_DECAY_PER_DAY, SATIETY_GRACE_DAYS],
  },
  {
    label: "health baseline",
    muster: /starts at (\d+)\./,
    werte: [HEALTH_BASELINE],
  },
  {
    label: "CI modifiers",
    muster: /adds (\d+), a red one subtracts (\d+), a cancelled one subtracts (\d+)\./,
    werte: [HEALTH_CI_MODIFIER.success, -HEALTH_CI_MODIFIER.failure, -HEALTH_CI_MODIFIER.cancelled],
  },
  {
    label: "issue bonus and penalty",
    muster: /up to \+(\d+), up to -(\d+)\./,
    werte: [ISSUE_BACKLOG_BONUS_MAX, ISSUE_BACKLOG_PENALTY_MAX],
  },
  ...TABELLE,
];

const READMES: readonly [string, readonly Erwartung[]][] = [
  ["README.md", DEUTSCH],
  ["README.en.md", ENGLISCH],
];

describe.each(READMES)("%s nennt dieselben Zahlen wie src/state.ts", (datei, erwartungen) => {
  const text = normalisiere(readFileSync(datei, "utf8"));

  for (const { label, muster, werte } of erwartungen) {
    it(label, () => {
      const treffer = muster.exec(text);
      if (!treffer) {
        throw new Error(
          `${datei}: "${label}" nicht gefunden.\n` +
            `Muster: ${muster}\n` +
            "Entweder wurde der Abschnitt umformuliert – dann bitte die Zahlen " +
            "gegen src/state.ts pruefen und das Muster hier nachziehen – oder " +
            "der Abschnitt fehlt inzwischen ganz.",
        );
      }
      expect(treffer.slice(1).map(Number)).toEqual([...werte]);
    });
  }
});

describe("beide READMEs bleiben gleich vollstaendig", () => {
  it("nennen gleich viele Zahlen", () => {
    // Faengt den Fall, dass jemand nur eine Sprache erweitert.
    expect(DEUTSCH).toHaveLength(ENGLISCH.length);
  });
});
