/**
 * Sammelstelle aller Sprites – fuer jede Stimmung genau eine Animation.
 *
 * Vollstaendiges `Record<Mood, PetSprite>`: `renderPet()` kann damit ohne
 * Fallback zugreifen, und eine neue Stimmung in `Mood` bricht hier den
 * Typecheck, statt zur Laufzeit ein leeres Bild zu liefern.
 */

import type { Mood } from "../types.js";
import { CONTENT_SPRITE } from "./content.js";
import type { PetSprite } from "./format.js";
import { HAPPY_SPRITE } from "./happy.js";
import { SAD_SPRITE } from "./sad.js";
import { SICK_SPRITE } from "./sick.js";

export const SPRITES: Record<Mood, PetSprite> = {
  happy: HAPPY_SPRITE,
  content: CONTENT_SPRITE,
  sad: SAD_SPRITE,
  sick: SICK_SPRITE,
};

/** Anzeigereihenfolge im Preview: von satt und gesund nach krank. */
export const MOOD_ORDER: readonly Mood[] = ["happy", "content", "sad", "sick"];
