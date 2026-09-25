/**
 * Stimmung "content" – atmet ruhig und blinzelt gelegentlich.
 *
 * Die Form folgt einem einfachen Prinzip: **die Augen sitzen oben auf dem
 * Koerper, nicht im Gesicht.** Zwei grosse Kugeln ragen ueber die Silhouette
 * hinaus, darunter laeuft ein Tropfen ohne Hals nach unten breit aus, und
 * ganz unten stehen zwei Stummelfuesse. Das ist bei 24 Pixeln die
 * verlaesslichste Art, "Kreatur" zu sagen: der Umriss allein traegt den
 * Ausdruck, bevor ueberhaupt ein Detail sichtbar wird.
 *
 * Deshalb gibt es auch keinen Mund. Der Zustand haengt an den Pupillen und
 * an der Koerperbreite – zwei Signale, die bei dieser Aufloesung beide
 * sicher lesbar sind, waehrend ein 2 Pixel hoher Mundstrich es nicht ist.
 *
 * Das Glanzlicht sitzt links, in beiden Augen gleich und nicht gespiegelt:
 * ein Licht, eine Richtung. Sonst ist die Kreatur spaltensymmetrisch.
 *
 * Die Luecke zwischen den Augapfeln liegt genau auf dem Nahtband
 * (`SEAM_BAND`, Spalten 10-13). Das ist kein Zufall, sondern der Grund fuer
 * diese Augenposition: mager ruecken die Kugeln aneinander, rund stehen sie
 * weit auseinander. Die Breitenvariante veraendert damit den Blick mit, ohne
 * dass ein einziger zusaetzlicher Frame noetig waere.
 */

import { type PetSprite, frame } from "./format.js";

/** Ruhepose – der Entwurf, von dem alle anderen Stimmungen abgeleitet sind. */
export const CONTENT_IDLE = frame([
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
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 9);

/**
 * Einatmen: Augen und Schultern eine Zeile hoeher, dafuer eine Bauchzeile
 * mehr. Die Fuesse bleiben stehen – Atmen hebt den Brustkorb, nicht das Tier.
 */
export const CONTENT_BREATHE = frame([
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
  ".obbbbbbbbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbbbbbbo..",
  "..obbbbbbbbbbbbbbbbbbo..",
  "...oooooooooooooooooo...",
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 6);

/**
 * Blinzeln. Nur drei Zeilen unterscheiden sich von der Ruhepose, und keine
 * davon liegt am Rand: der Umriss darf beim Lidschlag nicht springen, sonst
 * zuckt die ganze Kreatur statt nur der Augen.
 */
export const CONTENT_BLINK = frame([
  "........................",
  "....oooo........oooo....",
  "...oeeeeo......oeeeeo...",
  "..oeeeeeeo....oeeeeeeo..",
  "..oppppppo....oppppppo..",
  "..oppppppo....oppppppo..",
  "..oeeeeeeooooooeeeeeeo..",
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
  ".....obbbo....obbbo.....",
  ".....ooooo....ooooo.....",
  "........................",
], 1);

/**
 * Ruhe, Atemzug, Blinzler. Das Gewicht 1 fuer den Blinzler ergibt bei 4
 * Sekunden Loop rund 250 ms – darunter wirkt es wie ein Bildfehler, darueber
 * wie Muedigkeit.
 */
export const CONTENT_SPRITE: PetSprite = {
  frames: [CONTENT_IDLE, CONTENT_BREATHE, CONTENT_BLINK],
  loopSeconds: 4,
};
