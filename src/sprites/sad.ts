/**
 * Stimmung "sad" – haengt durch und seufzt.
 *
 * Traurigkeit sitzt hier in den Lidern: die obere Haelfte des Augapfels ist
 * abgedeckt, die Pupillen liegen unten. Zusammen ergibt das einen Blick zu
 * Boden, und das funktioniert bei 24 Pixeln besser als jede Mundlinie.
 *
 * Dazu sackt der Koerper zusammen – die Augen sitzen tiefer als in der
 * Ruhepose, der Bauch laeuft breiter aus. Das faellt mit der mageren
 * Breitenvariante zusammen, die `bodyWidthPairs()` bei dieser Stimmung
 * ohnehin waehlt: durchgehaengt und duenn zugleich.
 */

import { type PetSprite, frame } from "./format.js";

/** Grundhaltung: Lider halb zu, Blick nach unten. */
export const SAD_SLUMP = frame([
  "........................",
  "........................",
  "....oooo........oooo....",
  "...oppppo......oppppo...",
  "..oppppppo....oppppppo..",
  "..oeeeeeeo....oeeeeeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeooooooepppeeo..",
  "...oeeeeobbbbbboeeeeo...",
  "....oooobbbbbbbboooo....",
  ".....obbbbbbbbbbbbo.....",
  "...obbbbbbbbbbbbbbbbo...",
  "..obbbhhbbbbbbbbbbbbbo..",
  ".obbbhhbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 7);

/** Ausatmen: eine Zeile weniger Koerper, Augen noch ein Pixel tiefer. */
export const SAD_SIGH = frame([
  "........................",
  "........................",
  "........................",
  "....oooo........oooo....",
  "...oppppo......oppppo...",
  "..oppppppo....oppppppo..",
  "..oeeeeeeo....oeeeeeeo..",
  "..oeepppeo....oepppeeo..",
  "..oeepppeooooooepppeeo..",
  "...oeeeeobbbbbboeeeeo...",
  "....oooobbbbbbbboooo....",
  ".....obbbbbbbbbbbbo.....",
  "...obbbbbbbbbbbbbbbbo...",
  ".obbbbhhbbbbbbbbbbbbbbo.",
  ".obbbhhbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 4);

/**
 * Fuenf Sekunden. Der langsamste Loop von allen – ein Seufzer, der schnell
 * geht, ist keiner.
 */
export const SAD_SPRITE: PetSprite = {
  frames: [SAD_SLUMP, SAD_SIGH],
  loopSeconds: 5,
};
