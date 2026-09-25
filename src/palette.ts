/**
 * Farben der Kreatur.
 *
 * Randbedingung fuer jede Farbe hier: das SVG haengt in einer README und
 * liegt damit mal auf Weiss (#ffffff), mal auf GitHubs Dunkel (#0d1117) –
 * und der Hintergrund des Bildes bleibt transparent. Deshalb gibt es keine
 * Farbe nahe Weiss und keine nahe Schwarz fuer grosse Flaechen: die
 * Silhouette traegt ein mittelhelles Mint, das auf beiden Themes steht.
 * Die dunkle Outline liegt bewusst *innen* an der Kante; sie muss sich
 * gegen den Koerper absetzen, nicht gegen die Seite.
 *
 * Das Vorbild der Kreatur ist matt und pastellig und kommt ganz ohne
 * Kontur aus – es steht dort auf farbigem Grund. Auf einem unbekannten
 * Hintergrund geht das nicht, die Kontur muss bleiben. Sie ist dafuer zum
 * Koerperton hin abgedunkelt statt schwarz, damit die weiche Anmutung
 * nicht an einem harten Rahmen zerbricht.
 */

/** Rolle, die ein Sprite-Zeichen einfaerbt – siehe `sprites/format.ts`. */
export type PaletteRole = "outline" | "body" | "sheen" | "pupil" | "eyeWhite" | "mouth";

/** Eine vollstaendige Zuordnung Rolle -> CSS-Farbe. */
export type Palette = Record<PaletteRole, string>;

/**
 * Grundpalette bei voller Gesundheit.
 *
 * Mint statt Gruen oder Blau, weil die Kreatur bei Krankheit gruenlich
 * kippen soll – von einem Gruenton aus waere dieser Wechsel unsichtbar.
 */
export const BASE_PALETTE: Palette = {
  /** Tiefes Blaugruen statt Schwarz: auf dunklem Theme faellt reines Schwarz in ein Loch. */
  outline: "#24505a",
  /** Traegt die Silhouette. Hell genug fuer Weiss, satt genug fuer Dunkel. */
  body: "#7ed6b4",
  /** Glanzlicht oben links. Eine Stufe heller als `body`, nie Weiss – das ist den Augen vorbehalten. */
  sheen: "#a9e6cd",
  /** Pupille, fast schwarz: der einzige wirklich dunkle Punkt im Bild, und damit der Blick. */
  pupil: "#14232b",
  /**
   * Der Augapfel. Kein reines Weiss, sondern minimal gebrochen – auf hellem
   * Theme wuerde reines Weiss ein Loch in die Kugel stanzen, obwohl sie von
   * der Kontur eingefasst ist.
   */
  eyeWhite: "#f4f7f4",
  /**
   * Fuer einen Mundstrich. Die Ruhepose hat keinen: die Kreatur spricht ueber
   * die Pupillen und die Haltung, wie ihr Vorbild auch. Erst `sad` und `sick`
   * brauchen die Linie.
   */
  mouth: "#24505a",
};

/**
 * Farben der Statuszeile unter der Kreatur.
 *
 * Die Leiste ist ein Pixel-Balken, kein `<text>` – GitHub laedt in einem
 * eingebetteten SVG keine Fonts, und was nicht gerendert wird, kann auch
 * nicht falsch aussehen.
 */
export const BAR_PALETTE = {
  /** Bernstein fuer Saettigung: "Futter" liest sich warm, nicht technisch. */
  satiety: "#f2b13c",
  /** Gesundheit im Koerperton – der Balken gehoert sichtbar zur Kreatur. */
  health: "#7ed6b4",
  /**
   * Leerer Teil des Balkens. Neutralgrau mit `fill-opacity`, damit derselbe
   * Wert auf hellem und dunklem Theme jeweils nur leicht abgesetzt wirkt
   * statt auf einem der beiden als harter Block zu stehen.
   */
  track: "#8b949e",
  /** Deckkraft des leeren Balkenteils. */
  trackOpacity: 0.35,
} as const;
