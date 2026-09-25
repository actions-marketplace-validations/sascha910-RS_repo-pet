/**
 * Das Sprite-Format: Pixel-Art als Text.
 *
 * Ein Frame ist ein Quadrat aus Zeichen, ein Zeichen pro Pixel. Das ist
 * bewusst kein Bitmap und kein Pfad, sondern etwas, das man im Editor
 * direkt sieht und aendert – die Kreatur soll in einem Diff lesbar bleiben.
 *
 * Die Zeichen benennen *Rollen* ("Koerper", "Auge"), keine Farben. Dadurch
 * kann der Renderer die ganze Palette abhaengig von `health` einfaerben,
 * ohne die Sprite-Daten anzufassen.
 */

import type { PaletteRole } from "../palette.js";

/**
 * Kantenlaenge eines Frames. 24 ist der kleinste Wert, bei dem noch zwei
 * grosse Augen, ein Mund und Fuesse Platz haben; darunter wird die Kreatur
 * zu einem Klecks. Quadratisch, damit der Renderer keine zwei Masse braucht.
 */
export const SPRITE_SIZE = 24;

/** Zeichen fuer "hier ist nichts" – der Hintergrund bleibt transparent. */
export const TRANSPARENT = ".";

/**
 * Die Naht liegt *zwischen* Spalte 11 und 12, also exakt auf der Mittelachse.
 *
 * Saettigung veraendert die Koerperbreite, indem der Renderer hier
 * Spaltenpaare verdoppelt (rund) oder entfernt (mager). Immer Paare, damit
 * die Kreatur symmetrisch bleibt.
 */
export const SEAM_COLUMN = 12;

/**
 * Wie viele Spaltenpaare eine Breitenstufe hoechstens bewegt.
 *
 * 2 Paare sind 4 Spalten: der Koerper laeuft damit ueber 18 / 22 / 26 Pixel,
 * und der Unterschied zwischen mager und rund ist auch dann zu sehen, wenn
 * nur *ein* Zustand in einer README haengt. Bei einem Paar musste man die
 * Stufen nebeneinander legen, um sie zu bemerken.
 *
 * Der Preis steht in `SEAM_BAND`: je breiter der Schritt, desto mehr
 * ruhige Mitte muss das Sprite vorhalten.
 */
export const SEAM_MAX_PAIRS = 2;

/**
 * Die Spalten, die der Renderer anfasst: `SEAM_MAX_PAIRS` links und rechts
 * der Naht, hier also 10 bis 13.
 *
 * `frame()` verlangt, dass jede Zeile in diesem Band ein *einziges*
 * Zeichen wiederholt. Diese eine Regel macht beide Richtungen trivial
 * richtig: was ueberall gleich ist, kann man verdoppeln oder loeschen,
 * ohne dass sich die Form aendert – nur die Breite.
 *
 * Fuer den Entwurf heisst das: kein Detail darf im Band liegen. Bei dieser
 * Kreatur faellt das zusammen – die Luecke zwischen den beiden Augapfeln
 * ist genau das Band. Mager ruecken die Kugeln aneinander, rund weit
 * auseinander, und beides ist genau der Ausdruck, den man dort haben will.
 */
export const SEAM_BAND: readonly number[] = Array.from(
  { length: SEAM_MAX_PAIRS * 2 },
  (_, offset) => SEAM_COLUMN - SEAM_MAX_PAIRS + offset,
);

/**
 * Zeichen -> Palettenrolle. Die Zeichen sind Eselsbruecken (o = outline,
 * b = body, h = highlight, e = eyeball, p = pupil, m = mouth), damit sich
 * die Zeilen ohne Legende lesen lassen.
 */
export const PIXEL_ROLE = {
  o: "outline",
  b: "body",
  h: "sheen",
  e: "eyeWhite",
  p: "pupil",
  m: "mouth",
} as const satisfies Record<string, PaletteRole>;

/** Alle erlaubten Zeichen einer Sprite-Zeile. */
export type PixelChar = keyof typeof PIXEL_ROLE | typeof TRANSPARENT;

/** Ein Einzelbild der Loop-Animation. */
export interface PetFrame {
  /** `SPRITE_SIZE` Zeilen mit je `SPRITE_SIZE` Zeichen. */
  readonly rows: readonly string[];
  /**
   * Relatives Standzeit-Gewicht im Loop, keine Prozentzahl.
   *
   * Gewichte, weil ein Frame dazukommen darf, ohne dass alle anderen neu
   * gerechnet werden muessen – der Renderer normalisiert selbst auf die
   * Loop-Dauer. Ein Blinzler bekommt 1, die Ruhepose 8.
   */
  readonly hold: number;
}

/** Die komplette Animation einer Stimmung. */
export interface PetSprite {
  /** Mindestens ein Frame; mehrere ergeben eine Endlos-Schleife. */
  readonly frames: readonly PetFrame[];
  /**
   * Dauer eines vollen Durchlaufs in Sekunden. Steht am Sprite und nicht
   * global, weil die Stimmung das Tempo traegt: ein Huepfer ist schnell,
   * ein Seufzer langsam.
   */
  readonly loopSeconds: number;
}

/**
 * Verschiebt alle Zeilen um `dx` Spalten und fuellt mit Transparenz auf.
 *
 * Eine Verschiebung ist keine neue Zeichnung – deshalb steht sie als
 * Funktion hier und nicht als zweiter, fast identischer Block Sprite-Daten.
 * Wer 24 Zeilen kopiert, um sie um ein Pixel zu versetzen, bekommt beim
 * naechsten Aendern zwei Posen, die auseinanderlaufen.
 *
 * Ob die Verschiebung erlaubt ist, entscheidet `frame()`: ein Ruck, der eine
 * Kontur ins Nahtband schiebt, fliegt dort auf.
 */
export function shiftColumns(rows: readonly string[], dx: number): string[] {
  if (dx === 0) return [...rows];
  return rows.map((row) =>
    dx > 0
      ? TRANSPARENT.repeat(dx) + row.slice(0, row.length - dx)
      : row.slice(-dx) + TRANSPARENT.repeat(-dx),
  );
}

/**
 * Baut einen Frame und prueft ihn sofort.
 *
 * Die Pruefung laeuft beim Import des Sprite-Moduls, nicht erst im Renderer:
 * ein Tippfehler in einer der 24 Zeilen ist sonst ein stiller, schiefer
 * Pixel statt eines Fehlers.
 */
export function frame(rows: readonly string[], hold = 1): PetFrame {
  if (rows.length !== SPRITE_SIZE) {
    throw new Error(`Frame braucht ${SPRITE_SIZE} Zeilen, hat ${rows.length}.`);
  }

  const allowed = new Set<string>([TRANSPARENT, ...Object.keys(PIXEL_ROLE)]);

  for (const [index, row] of rows.entries()) {
    if (row.length !== SPRITE_SIZE) {
      throw new Error(
        `Zeile ${index} braucht ${SPRITE_SIZE} Zeichen, hat ${row.length}: "${row}"`,
      );
    }
    for (const char of row) {
      if (!allowed.has(char)) {
        throw new Error(`Zeile ${index}: "${char}" ist kein bekanntes Pixel-Zeichen.`);
      }
    }
  }

  for (const [index, row] of rows.entries()) {
    const band = SEAM_BAND.map((column) => row[column]);
    const first = band[0];
    if (band.some((char) => char !== first)) {
      throw new Error(
        `Zeile ${index}: Nahtband ${SEAM_BAND.join(",")} ist "${band.join("")}" ` +
          `statt einheitlich – die Breitenvarianten wuerden die Form veraendern.`,
      );
    }
  }

  if (!(hold > 0)) {
    throw new Error(`hold muss groesser als 0 sein, ist ${hold}.`);
  }

  return { rows, hold };
}
