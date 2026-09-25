/**
 * Stimmung "happy" – huepft.
 *
 * Zwei Frames, weil ein Sprung genau zwei Zustaende hat: unten und oben.
 * Zwischenbilder wuerden ihn weicher machen und damit schlechter – ein
 * Huepfer lebt vom harten Wechsel.
 *
 * Der Trick liegt in der Landung: die Fuesse bleiben stehen, nur die Masse
 * darueber faellt zusammen und wird breiter. Wuerde die ganze Figur nach
 * unten rutschen, saehe es aus, als sinke sie ein.
 */

import { type PetSprite, frame } from "./format.js";

/** Landung: gestaucht und breiter, Augen zwei Zeilen tiefer. */
export const HAPPY_SQUASH = frame([
  "........................",
  "........................",
  "........................",
  "....oooo........oooo....",
  "...oeeeeo......oeeeeo...",
  "..oeeeeeeo....oeeeeeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeooooooepppeeo..",
  "...oeeeeobbbbbboeeeeo...",
  "....oooobbbbbbbboooo....",
  ".....obbbbbbbbbbbbo.....",
  "...obbbbbbbbbbbbbbbbo...",
  ".obbbhhhbbbbbbbbbbbbbbo.",
  "obbbbhhbbbbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbbbbbbbbbo",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 2);

/** Sprung: eine Zeile hoeher als die Ruhepose, Fuesse angezogen. */
export const HAPPY_AIR = frame([
  "....oooo........oooo....",
  "...oeeeeo......oeeeeo...",
  "..oeeeeeeo....oeeeeeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeooooooepppeeo..",
  "...oeeeeobbbbbboeeeeo...",
  "....oooobbbbbbbboooo....",
  ".....obbbbbbbbbbbbo.....",
  "....obbhhbbbbbbbbbbo....",
  "...obbhhhbbbbbbbbbbbo...",
  "..obbbhhbbbbbbbbbbbbbo..",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  "......obbo....obbo......",
  "......oooo....oooo......",
  "........................",
  "........................",
], 3);

/**
 * 0,6 Sekunden pro Sprung. Schneller wirkt es hektisch, langsamer wie
 * Schwerelosigkeit. Die Luft haelt laenger als die Landung, weil ein
 * Sprung oben laenger aussieht, als er dauert.
 */
export const HAPPY_SPRITE: PetSprite = {
  frames: [HAPPY_SQUASH, HAPPY_AIR],
  loopSeconds: 0.6,
};
