/**
 * Social-Preview-Skript: `npm run social`
 *
 * Schreibt `docs/social-preview.png` – das Bild, das GitHub unter
 * Settings > General > Social preview erwartet und das in Slack, Discord
 * oder X erscheint, wenn jemand das Repo teilt.
 *
 * Das Bild wird aus dem **echten SVG** aufgerastert, nicht aus den
 * Sprite-Daten nachgebaut. Damit kann es nicht auseinanderlaufen: was hier
 * zu sehen ist, ist byteweise das, was die Action ausliefert. Aendert sich
 * der Renderer, aendert sich das Bild mit, und `build:check` meldet es.
 *
 * Ein PNG von Hand zu schreiben klingt nach mehr, als es ist: Node bringt
 * Deflate und CRC32 mit, und ein unkomprimiertes RGB-Bild ist ein Header,
 * ein Block und ein Ende. Eine Bildbibliothek als Abhaengigkeit waere fuer
 * diese eine Datei nicht zu rechtfertigen.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";

import { XMLParser } from "fast-xml-parser";

import { CANVAS_HEIGHT, CANVAS_WIDTH, renderPet } from "../src/render.js";
import { showcaseState } from "../src/showcase.js";
import { MOOD_ORDER } from "../src/sprites/index.js";

/** Zielgroesse. GitHub empfiehlt 1280x640; das ist zugleich 2:1 fuer X. */
const WIDTH = 1280;
const HEIGHT = 640;

type Rgb = readonly [number, number, number];

/** GitHubs Dunkelton – das Mint wirkt darauf staerker als auf Weiss, und die meisten Chat-Clients sind dunkel. */
const BACKGROUND: Rgb = [0x0d, 0x11, 0x17];
const TITLE_COLOR: Rgb = [0x7e, 0xd6, 0xb4];
const LABEL_COLOR: Rgb = [0x8b, 0x94, 0x9e];

/**
 * Ein 5x7-Pixelfont, nur die benoetigten Zeichen.
 *
 * Selbst gezeichnet statt einer echten Schrift: eine Proportionalschrift
 * neben Pixel-Art bricht das Motiv, und eine Schriftdatei mitzuliefern waere
 * fuer fuenfzehn Buchstaben absurd.
 */
const GLYPHS: Record<string, string> = {
  A: ".###.|#...#|#...#|#####|#...#|#...#|#...#",
  C: ".####|#....|#....|#....|#....|#....|.####",
  D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
  E: "#####|#....|#....|####.|#....|#....|#####",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
  I: "#####|..#..|..#..|..#..|..#..|..#..|#####",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#",
  N: "#...#|##..#|##..#|#.#.#|#..##|#..##|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|####.|#....|#....|#....",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
  S: ".####|#....|#....|.###.|....#|....#|####.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..",
  "-": ".....|.....|.....|.###.|.....|.....|.....",
};

const GLYPH_WIDTH = 5;
const GLYPH_ADVANCE = GLYPH_WIDTH + 1;

type Canvas = Rgb[][];

function textWidth(text: string, scale: number): number {
  return text.length * GLYPH_ADVANCE * scale - scale;
}

function drawText(canvas: Canvas, text: string, left: number, top: number, scale: number, color: Rgb): void {
  let x = left;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error(`Kein Glyph fuer "${char}" – scripts/social.ts erweitern.`);
    for (const [row, bits] of glyph.split("|").entries()) {
      for (const [column, bit] of [...bits].entries()) {
        if (bit !== "#") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = x + column * scale + dx;
            const py = top + row * scale + dy;
            if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) canvas[py]![px] = color;
          }
        }
      }
    }
    x += GLYPH_ADVANCE * scale;
  }
}

function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

interface SvgRect {
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  "fill-opacity"?: string;
}

/**
 * Rastert ein SVG dieser Anwendung.
 *
 * Bewusst kein allgemeiner SVG-Renderer: die Ausgabe besteht nur aus
 * `<g fill>`-Gruppen mit Rechtecken, und genau das wird hier gelesen.
 * Kaeme jemals etwas anderes dazu, faellt es hier sofort auf – besser als
 * ein Renderer, der stillschweigend das Falsche zeichnet.
 *
 * Von mehreren Frames wird nur der erste genommen: ein Standbild kann keine
 * Animation zeigen, und Frame 0 ist die Pose, die auch ohne laufende
 * Animation sichtbar ist.
 */
function rasterize(svg: string): (Rgb | null)[][] {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (name) => name === "g" || name === "rect",
  }).parse(svg) as { svg: { g?: unknown[]; rect?: SvgRect[] } };

  const grid: (Rgb | null)[][] = Array.from({ length: CANVAS_HEIGHT }, () =>
    Array.from({ length: CANVAS_WIDTH }, () => null),
  );

  const paint = (rect: SvgRect, inherited: string | undefined): void => {
    const fill = rect.fill ?? inherited;
    if (!fill) return;
    const rgb = parseHex(fill);
    const opacity = rect["fill-opacity"] ? Number(rect["fill-opacity"]) : 1;
    for (let y = Number(rect.y); y < Number(rect.y) + Number(rect.height); y += 1) {
      for (let x = Number(rect.x); x < Number(rect.x) + Number(rect.width); x += 1) {
        const base = grid[y]?.[x] ?? BACKGROUND;
        grid[y]![x] = [0, 1, 2].map(
          (i) => Math.round(base[i]! + (rgb[i]! - base[i]!) * opacity) as number,
        ) as unknown as Rgb;
      }
    }
  };

  const walkGroup = (group: { fill?: string; g?: unknown[]; rect?: SvgRect[] }): void => {
    for (const rect of group.rect ?? []) paint(rect, group.fill);
    for (const child of group.g ?? []) walkGroup(child as typeof group);
  };

  // Nur die erste Frame-Gruppe, dann die Balken auf Wurzelebene.
  const frames = (parsed.svg.g ?? []) as { fill?: string; g?: unknown[]; rect?: SvgRect[] }[];
  if (frames[0]) walkGroup(frames[0]);
  for (const rect of parsed.svg.rect ?? []) paint(rect, undefined);

  return grid;
}

/** Schreibt ein unkomprimiertes RGB-PNG. Deterministisch: gleiche Eingabe, gleiche Bytes. */
function encodePng(canvas: Canvas): Buffer {
  const rows: Buffer[] = [];
  for (const row of canvas) {
    const line = Buffer.alloc(1 + WIDTH * 3);
    for (const [x, pixel] of row.entries()) {
      line[1 + x * 3] = pixel[0];
      line[2 + x * 3] = pixel[1];
      line[3 + x * 3] = pixel[2];
    }
    rows.push(line);
  }

  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // 8 Bit je Kanal
  header[9] = 2; // Truecolor ohne Alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const canvas: Canvas = Array.from({ length: HEIGHT }, () =>
  Array.from({ length: WIDTH }, () => BACKGROUND),
);

const TITLE = "repo-pet";
const TITLE_SCALE = 9;
drawText(canvas, TITLE, Math.round((WIDTH - textWidth(TITLE, TITLE_SCALE)) / 2), 74, TITLE_SCALE, TITLE_COLOR);

/** Vergroesserung je Sprite-Pixel, und der Abstand zwischen den Kreaturen. */
const PET_SCALE = 9;
const PET_GAP = 44;
const PET_TOP = 210;
const LABEL_SCALE = 4;

const blockWidth = CANVAS_WIDTH * PET_SCALE;
const left = Math.round((WIDTH - (MOOD_ORDER.length * blockWidth + (MOOD_ORDER.length - 1) * PET_GAP)) / 2);

for (const [index, mood] of MOOD_ORDER.entries()) {
  const grid = rasterize(renderPet(showcaseState(mood)));
  const originX = left + index * (blockWidth + PET_GAP);

  for (const [y, row] of grid.entries()) {
    for (const [x, pixel] of row.entries()) {
      if (!pixel) continue;
      for (let dy = 0; dy < PET_SCALE; dy += 1) {
        for (let dx = 0; dx < PET_SCALE; dx += 1) {
          canvas[PET_TOP + y * PET_SCALE + dy]![originX + x * PET_SCALE + dx] = pixel;
        }
      }
    }
  }

  drawText(
    canvas,
    mood,
    originX + Math.round((blockWidth - textWidth(mood, LABEL_SCALE)) / 2),
    PET_TOP + CANVAS_HEIGHT * PET_SCALE + 34,
    LABEL_SCALE,
    LABEL_COLOR,
  );
}

const target = resolve(process.cwd(), "docs/social-preview.png");
const png = encodePng(canvas);
writeFileSync(target, png);
console.log(`docs/social-preview.png  ${WIDTH}x${HEIGHT}  ${(png.length / 1024).toFixed(0)} KB`);
