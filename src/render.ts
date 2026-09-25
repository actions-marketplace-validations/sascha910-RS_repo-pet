/**
 * Renderer: PetState + Sprite -> eigenstaendiges SVG.
 *
 * Rein wie `deriveState()` – kein Netzwerk, keine Uhr, kein Zufall. Derselbe
 * Zustand ergibt byteweise dasselbe SVG, sonst waeren Snapshot-Tests wertlos.
 *
 * Zwei harte Randbedingungen kommen von aussen und erklaeren fast jede
 * Entscheidung hier:
 *
 * 1. GitHub laedt das Bild als `<img>`. Darin laeuft **kein** JavaScript und
 *    kein SMIL – Animation geht nur ueber CSS `@keyframes` im `<style>`-Block.
 * 2. Es werden keine Fonts geladen. Deshalb gibt es kein `<text>`; die
 *    Statuszeile ist ein Pixel-Balken.
 *
 * Die Ausgabe enthaelt nie Fremdtext: alles, was hier landet, sind Zahlen aus
 * `PetState` und Zeichen, die `frame()` bereits geprueft hat. Es gibt deshalb
 * bewusst kein Escaping – es gaebe nichts zu escapen.
 */

import { BAR_PALETTE, BASE_PALETTE, type Palette, type PaletteRole } from "./palette.js";
import { MOOD_HAPPY_SATIETY, MOOD_SAD_SATIETY } from "./state.js";
import {
  PIXEL_ROLE,
  SEAM_COLUMN,
  SEAM_MAX_PAIRS,
  SPRITE_SIZE,
  TRANSPARENT,
  type PetSprite,
} from "./sprites/format.js";
import { SPRITES } from "./sprites/index.js";
import type { PetState } from "./types.js";

// ---------------------------------------------------------------------------
// Leinwand
// ---------------------------------------------------------------------------

/**
 * Breite der Leinwand: die breiteste Variante, die entstehen kann.
 *
 * Fest und nicht pro Zustand berechnet, damit das Bild beim Wechsel von
 * mager zu rund nicht springt – in einer README steht es meist neben Text,
 * und eine wandernde Bildbreite faellt sofort auf. Die schmaleren Varianten
 * werden stattdessen zentriert.
 */
export const CANVAS_WIDTH = SPRITE_SIZE + SEAM_MAX_PAIRS * 2;

/** Breite der Statusbalken; zwei Pixel Rand links und rechts. */
export const BAR_WIDTH = 24;

/** Hoehe eines Balkens. Ein Pixel waere auf Retina-Skalierung kaum zu sehen. */
export const BAR_HEIGHT = 2;

/** Leerzeile zwischen den beiden Balken, damit sie nicht zu einem Block verschmelzen. */
export const BAR_GAP = 1;

/**
 * Luftzeile zwischen Fuessen und Statuszeile.
 *
 * Die Kreatur reicht bis fast an den unteren Sprite-Rand, sonst saessen die
 * Balken direkt auf den Fuessen und wuerden als Teil des Tiers gelesen –
 * als Schatten oder Untergrund statt als Anzeige.
 */
export const SPRITE_BAR_GAP = 1;

/** Oberkante der Statuszeile. */
export const BARS_TOP = SPRITE_SIZE + SPRITE_BAR_GAP;

/** Gesamthoehe: Sprite plus zwei Balken mit Zwischenraum. */
export const CANVAS_HEIGHT = BARS_TOP + BAR_HEIGHT * 2 + BAR_GAP;

// ---------------------------------------------------------------------------
// Koerperbreite aus Saettigung
// ---------------------------------------------------------------------------

/**
 * Wie viele Nahtspaltenpaare die Saettigung bewegt: mager, normal, rund.
 *
 * Die Schwellen sind absichtlich dieselben wie fuer die Stimmung
 * (`MOOD_SAD_SATIETY`, `MOOD_HAPPY_SATIETY`) und keine eigenen Zahlen. So
 * faellt Form und Ausdruck immer zusammen: eine traurige Kreatur ist auch
 * mager, eine glueckliche auch rund. Zwei unabhaengige Schwellen wuerden
 * Zwischenzustaende erzeugen, die niemand erklaeren kann.
 */
export function bodyWidthPairs(satiety: number): number {
  if (satiety < MOOD_SAD_SATIETY) return -SEAM_MAX_PAIRS;
  if (satiety >= MOOD_HAPPY_SATIETY) return SEAM_MAX_PAIRS;
  return 0;
}

/**
 * Verdoppelt oder entfernt `pairs` Spaltenpaare an der Naht.
 *
 * Dass das ohne Formverlust geht, garantiert `frame()`: im Nahtband steht
 * je Zeile nur ein einziges Zeichen. Siehe `SEAM_BAND`.
 */
export function resizeRow(row: string, pairs: number): string {
  if (pairs === 0) return row;
  if (pairs > 0) {
    const left = row[SEAM_COLUMN - 1] ?? TRANSPARENT;
    const right = row[SEAM_COLUMN] ?? TRANSPARENT;
    return row.slice(0, SEAM_COLUMN) + left.repeat(pairs) + right.repeat(pairs) + row.slice(SEAM_COLUMN);
  }
  return row.slice(0, SEAM_COLUMN + pairs) + row.slice(SEAM_COLUMN - pairs);
}

// ---------------------------------------------------------------------------
// Farbe aus Gesundheit und Stimmung
// ---------------------------------------------------------------------------

/**
 * Staerkste Entsaettigung bei health = 0. Nicht 1.0: eine vollstaendig graue
 * Kreatur liest sich als kaputtes Bild, nicht als krankes Tier. Ein Rest
 * Farbe haelt sie am Leben.
 */
export const HEALTH_MAX_DESATURATION = 0.7;

/**
 * Gruenstich fuer `sick`. Ein fahles Gelbgruen – der Koerper ist mintgruen,
 * ein reines Gruen waere unsichtbar. Der Ton muss *daneben* liegen, nicht
 * daneben sein.
 */
export const SICK_TINT = "#9fae4a";

/** Wie stark der Gruenstich mischt. Ueber ~0.5 verliert die Kreatur ihre Identitaet. */
export const SICK_TINT_STRENGTH = 0.45;

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

/**
 * Entsaettigt in Richtung des eigenen Grauwerts, nicht in Richtung eines
 * festen Grau: so behaelt jede Rolle ihre Helligkeit und die Kreatur bleibt
 * lesbar, waehrend die Farbe verschwindet. Die Gewichte sind die ueblichen
 * Luminanzanteile – Gruen traegt am meisten zur Helligkeit bei.
 */
function desaturate(rgb: Rgb, amount: number): Rgb {
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return mix(rgb, [luminance, luminance, luminance], amount);
}

/**
 * Palette fuer einen Zustand.
 *
 * Gesundheit steuert die Saettigung, Krankheit legt einen Gruenstich darueber.
 * Beide greifen nur an Koerperfarben an: Augapfel, Pupille und Mund bleiben
 * unveraendert, weil der Blick sonst mit der Farbe verschwindet – und der
 * Blick ist bei dieser Kreatur das Einzige, woran man den Zustand abliest.
 */
export function paletteFor(state: PetState): Palette {
  const desaturation = (1 - Math.min(100, Math.max(0, state.health)) / 100) * HEALTH_MAX_DESATURATION;
  const tint = state.mood === "sick" ? parseHex(SICK_TINT) : null;

  const tinted: PaletteRole[] = ["outline", "body", "sheen"];
  const entries = Object.entries(BASE_PALETTE) as [PaletteRole, string][];

  return Object.fromEntries(
    entries.map(([role, hex]) => {
      if (!tinted.includes(role)) return [role, hex];
      let rgb = desaturate(parseHex(hex), desaturation);
      if (tint) rgb = mix(rgb, tint, SICK_TINT_STRENGTH);
      return [role, toHex(rgb)];
    }),
  ) as Palette;
}

// ---------------------------------------------------------------------------
// Pixel -> Rechtecke
// ---------------------------------------------------------------------------

interface Run {
  readonly x: number;
  readonly width: number;
  readonly role: PaletteRole;
}

/**
 * Fasst benachbarte gleichfarbige Pixel einer Zeile zu einem Lauf zusammen.
 *
 * Das ist der groesste Hebel fuer die Dateigroesse: ein einzelnes `<rect>`
 * kostet rund 40 Bytes, und eine 26 Pixel breite Bauchzeile waere sonst 26
 * davon statt einem.
 */
export function runsOf(row: string): Run[] {
  const runs: Run[] = [];
  let x = 0;
  while (x < row.length) {
    const char = row[x];
    let width = 1;
    while (row[x + width] === char) width += 1;
    if (char !== undefined && char !== TRANSPARENT) {
      const role = PIXEL_ROLE[char as keyof typeof PIXEL_ROLE];
      if (role) runs.push({ x, width, role });
    }
    x += width;
  }
  return runs;
}

/**
 * Ein Frame als `<g>`.
 *
 * Die Rechtecke werden nach Farbe gruppiert und die Farbe an die Gruppe
 * gehaengt statt an jedes Rechteck – dieselbe Motivation wie bei den Laeufen,
 * nur eine Ebene hoeher: `fill="#5ecfae"` steht sonst hundertfach im Bild.
 */
function frameGroup(rows: readonly string[], palette: Palette, offsetX: number, cls: string): string {
  const byRole = new Map<PaletteRole, string[]>();

  for (const [y, row] of rows.entries()) {
    for (const run of runsOf(row)) {
      const rects = byRole.get(run.role) ?? [];
      rects.push(`<rect x="${offsetX + run.x}" y="${y}" width="${run.width}" height="1"/>`);
      byRole.set(run.role, rects);
    }
  }

  const groups = [...byRole].map(([role, rects]) => `<g fill="${palette[role]}">${rects.join("")}</g>`);
  return `<g class="${cls}">${groups.join("")}</g>`;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/** Kuerzt `12.50` auf `12.5` und `40.00` auf `40` – reine Bytes-Kosmetik. */
function percent(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * CSS fuer die Frame-Umschaltung.
 *
 * `step-end` statt weicher Uebergaenge: Pixel-Art blendet nicht, sie schaltet.
 * Jeder Frame bekommt eigene Keyframes, die ihn genau in seinem Zeitfenster
 * sichtbar machen; ausserhalb steht er auf `opacity:0`.
 *
 * Der Grundzustand ohne laufende Animation zeigt Frame 0. Das ist nicht nur
 * Vorsicht fuer alte Renderer, sondern auch die Antwort auf
 * `prefers-reduced-motion` – eine zuckende Kreatur in einer README ist genau
 * die Art Bewegung, die man abschalten koennen muss.
 */
function animationStyle(sprite: PetSprite): string {
  const total = sprite.frames.reduce((sum, frame) => sum + frame.hold, 0);
  const rules = [
    `.f{opacity:0;animation-duration:${sprite.loopSeconds}s;` +
      `animation-timing-function:step-end;animation-iteration-count:infinite}`,
  ];

  let elapsed = 0;
  for (const [index, frame] of sprite.frames.entries()) {
    const start = (elapsed / total) * 100;
    elapsed += frame.hold;
    const end = (elapsed / total) * 100;

    const stops =
      start === 0
        ? `0%{opacity:1}${percent(end)}%{opacity:0}`
        : `0%{opacity:0}${percent(start)}%{opacity:1}` +
          (end >= 100 ? "" : `${percent(end)}%{opacity:0}`);

    // Frame 0 traegt zusaetzlich den Grundzustand: er ist der, den man sieht,
    // wenn keine Animation laeuft.
    const base = index === 0 ? "opacity:1;" : "";
    rules.push(`.f${index}{${base}animation-name:k${index}}`, `@keyframes k${index}{${stops}}`);
  }

  rules.push("@media(prefers-reduced-motion:reduce){.f{animation:none}}");
  return `<style>${rules.join("")}</style>`;
}

/**
 * Groessengrenze fuer ein fertiges SVG.
 *
 * 15 KB ist kein technisches Limit, sondern eine Anstandsregel: das Bild
 * laedt bei jedem Aufruf der README mit. Der Wert ist knapp genug, dass ein
 * vierter Frame oder eine vergessene Zusammenfassung von Laeufen sofort
 * auffaellt – ein Test prueft ihn fuer jede Stimmung.
 */
export const MAX_SVG_BYTES = 15 * 1024;

// ---------------------------------------------------------------------------
// Statuszeile
// ---------------------------------------------------------------------------

/**
 * Zwei Pixel-Balken: oben Saettigung, unten Gesundheit.
 *
 * Ohne Beschriftung – die Reihenfolge und die Farbe sind die einzigen
 * Hinweise, und das reicht, weil die Kreatur darueber dasselbe schon zeigt.
 * Ein Wert groesser 0 bekommt mindestens einen Pixel: "fast leer" und "leer"
 * sind verschiedene Aussagen, und genau an der Stelle schaut man hin.
 */
function statusBars(state: PetState): string {
  const x = Math.round((CANVAS_WIDTH - BAR_WIDTH) / 2);
  const rows: [number, string, number][] = [
    [BARS_TOP, BAR_PALETTE.satiety, state.satiety],
    [BARS_TOP + BAR_HEIGHT + BAR_GAP, BAR_PALETTE.health, state.health],
  ];

  return rows
    .map(([y, color, rawValue]) => {
      const value = Math.min(100, Math.max(0, rawValue));
      const filled = value === 0 ? 0 : Math.max(1, Math.round((value / 100) * BAR_WIDTH));
      const track =
        `<rect x="${x}" y="${y}" width="${BAR_WIDTH}" height="${BAR_HEIGHT}" ` +
        `fill="${BAR_PALETTE.track}" fill-opacity="${BAR_PALETTE.trackOpacity}"/>`;
      const fill =
        filled === 0
          ? ""
          : `<rect x="${x}" y="${y}" width="${filled}" height="${BAR_HEIGHT}" fill="${color}"/>`;
      return track + fill;
    })
    .join("");
}

// ---------------------------------------------------------------------------

/**
 * Rendert eine Stimmung im gegebenen Zustand.
 *
 * `role="img"` und `aria-label` stehen drin, weil das SVG in einer README
 * als Bild haengt und ein Screenreader sonst nur "Bild" vorliest – der
 * Zustand ist die einzige Information, die es traegt.
 */
export function renderSprite(sprite: PetSprite, state: PetState): string {
  const palette = paletteFor(state);
  const pairs = bodyWidthPairs(state.satiety);

  const frames = sprite.frames.map((frame, index) => {
    const rows = frame.rows.map((row) => resizeRow(row, pairs));
    const width = rows[0]?.length ?? SPRITE_SIZE;
    const offsetX = Math.round((CANVAS_WIDTH - width) / 2);
    return frameGroup(rows, palette, offsetX, `f f${index}`);
  });

  // Ein einzelner Frame braucht weder Keyframes noch Klassen-Logik – dann
  // faellt der ganze <style>-Block weg statt leer im Bild zu stehen.
  const style = sprite.frames.length > 1 ? animationStyle(sprite) : "";
  const body = sprite.frames.length > 1 ? frames.join("") : frames[0]?.replace(/ class="[^"]*"/, "") ?? "";

  const label = `Repo-Pet: ${state.mood}, Saettigung ${state.satiety}, Gesundheit ${state.health}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" ` +
    `width="${CANVAS_WIDTH * 4}" height="${CANVAS_HEIGHT * 4}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${label}">` +
    style +
    body +
    statusBars(state) +
    "</svg>"
  );
}

/**
 * Die eigentliche Schnittstelle nach aussen: Zustand rein, fertiges SVG raus.
 *
 * Waehlt die Animation zur Stimmung und ueberlaesst den Rest
 * `renderSprite()`. Die Trennung existiert fuer das Preview, das jede
 * Stimmung auch in Zustaenden zeigen will, die `deriveState()` so nie
 * liefern wuerde.
 */
export function renderPet(state: PetState): string {
  return renderSprite(SPRITES[state.mood], state);
}
