/**
 * Beispielzustaende fuer Vorschau und Galerie.
 *
 * Eine gemeinsame Quelle, damit `npm run preview` und `npm run gallery`
 * dieselbe Kreatur zeigen. Liefen sie auseinander, beurteilte man im Browser
 * etwas anderes, als spaeter im README steht – und genau das faellt niemandem
 * auf, weil man die beiden nie nebeneinander sieht.
 */

import type { Mood, PetState } from "./types.js";

/**
 * Die drei Saettigungsstufen: unter `MOOD_SAD_SATIETY`, dazwischen, ueber
 * `MOOD_HAPPY_SATIETY`. Genau die Werte, an denen `bodyWidthPairs()`
 * umschaltet – die Vorschau soll die Grenzen zeigen, nicht huebsche Zahlen.
 */
export const SHOWCASE_SATIETY_STEPS: readonly (readonly [number, string])[] = [
  [15, "mager"],
  [55, "normal"],
  [85, "rund"],
];

/**
 * Ein typischer Wert je Stimmung.
 *
 * Nicht frei gewaehlt, sondern so, wie `deriveState()` sie liefern wuerde –
 * sonst zeigt die Galerie Zustaende, die es gar nicht gibt. Die Saettigung
 * bestimmt dabei zugleich die Koerperbreite: `happy` ist rund, `sad` mager.
 */
const SHOWCASE: Record<Mood, { satiety: number; health: number }> = {
  happy: { satiety: 85, health: 90 },
  content: { satiety: 55, health: 75 },
  sad: { satiety: 15, health: 65 },
  sick: { satiety: 50, health: 25 },
};

/** Zustand einer Stimmung, optional mit abweichender Saettigung. */
export function showcaseState(mood: Mood, satiety?: number): PetState {
  const base = SHOWCASE[mood];
  return { satiety: satiety ?? base.satiety, health: base.health, mood };
}
