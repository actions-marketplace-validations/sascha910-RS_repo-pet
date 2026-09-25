/**
 * Stimmung "sick" – zittert.
 *
 * Das Zittern ist ein seitlicher Ruck um je ein Pixel. Das ist der Grund
 * fuer die einzige Formabweichung dieser Pose: die Augen stehen weiter
 * aussen als sonst, die Luecke zwischen ihnen ist sechs statt vier Spalten
 * breit – und die zwischen den Fuessen ebenso. Nur so bleibt das Nahtband
 * (Spalten 10-13) auch dann einheitlich, wenn die ganze Figur um ein Pixel
 * verrutscht. Waere die Luecke nur vier breit, schoebe der Ruck eine Kontur
 * hinein und die Breitenvarianten wuerden die Kreatur zerlegen.
 *
 * Dazu: winzige Pupillen in grossen Augen (glasiger Blick) und kein
 * Glanzlicht. Ein krankes Tier ist matt. Die Gruenfaerbung kommt nicht von
 * hier, sondern aus `paletteFor()` – die Sprite-Daten kennen keine Farben.
 */

import { type PetSprite, frame, shiftColumns } from "./format.js";

/**
 * Die Pose selbst. Wird nie direkt gezeigt, sondern nur um ein Pixel
 * versetzt: so liegt die Ruhelage in der Mitte des Zitterns.
 */
const SICK_POSE: readonly string[] = [
  "........................",
  "...oooo..........oooo...",
  "..oeeeeo........oeeeeo..",
  ".oeeeeeeo......oeeeeeeo.",
  ".oeeppeeo......oeeppeeo.",
  ".oeeppeeo......oeeppeeo.",
  ".oeeeeeeooooooooeeeeeeo.",
  "..oeeeeobbbbbbbboeeeeo..",
  "...oooobbbbbbbbbboooo...",
  "....obbbbbbbbbbbbbbo....",
  "...obbbbbbbbbbbbbbbbo...",
  "..obbbbbbbbbbbbbbbbbbo..",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  "....obbbo......obbbo....",
  "....ooooo......ooooo....",
  "........................",
];

/** Ruck nach links. */
export const SICK_LEFT = frame(shiftColumns(SICK_POSE, -1));

/** Ruck nach rechts. */
export const SICK_RIGHT = frame(shiftColumns(SICK_POSE, 1));

/**
 * 0,26 Sekunden fuer beide Frames zusammen, also 130 ms je Seite. Das ist
 * die Grenze, an der ein Wechsel aufhoert, eine Bewegung zu sein, und
 * anfaengt, ein Zittern zu sein.
 */
export const SICK_SPRITE: PetSprite = {
  frames: [SICK_LEFT, SICK_RIGHT],
  loopSeconds: 0.26,
};
