import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_SVG_BYTES,
  bodyWidthPairs,
  renderPet,
  resizeRow,
  runsOf,
} from "../src/render.js";
import { MOOD_HAPPY_SATIETY, MOOD_SAD_SATIETY } from "../src/state.js";
import { SEAM_MAX_PAIRS, SPRITE_SIZE } from "../src/sprites/format.js";
import { MOOD_ORDER, SPRITES } from "../src/sprites/index.js";
import type { Mood, PetState } from "../src/types.js";

/**
 * Ein Zustand je Stimmung, so wie `deriveState()` ihn liefern wuerde.
 * Feste Zahlen statt Zufall, damit die Snapshots stabil bleiben.
 */
const STATES: Record<Mood, PetState> = {
  happy: { satiety: 85, health: 90, mood: "happy" },
  content: { satiety: 55, health: 75, mood: "content" },
  sad: { satiety: 15, health: 65, mood: "sad" },
  sick: { satiety: 50, health: 25, mood: "sick" },
};

/** Alle Attributnamen im Dokument – fuer die Sicherheitspruefungen. */
function attributeNames(svg: string): string[] {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" }).parse(svg);
  const names: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith("#") && !Array.isArray(value) && typeof value !== "object") names.push(key);
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parsed);
  return names;
}

describe("renderPet – Ausgabe je Stimmung", () => {
  for (const mood of MOOD_ORDER) {
    it(`${mood}: unveraendert gegenueber dem Snapshot`, () => {
      // Aendert sich dieser Snapshot, hat sich das Bild geaendert. Der Diff
      // selbst ist nicht lesbar – zum Beurteilen `npm run preview` oeffnen.
      expect(renderPet(STATES[mood])).toMatchSnapshot();
    });
  }
});

describe("renderPet – das SVG ist wohlgeformt", () => {
  for (const mood of MOOD_ORDER) {
    it(`${mood}: parst als XML`, () => {
      const result = XMLValidator.validate(renderPet(STATES[mood]));
      expect(result).toBe(true);
    });
  }

  it("Leinwand und viewBox stimmen ueberein", () => {
    const svg = renderPet(STATES.content);
    expect(svg).toContain(`viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"`);
  });
});

describe("renderPet – nichts Ausfuehrbares in der Ausgabe", () => {
  // GitHub laedt das Bild als <img>. Skripte laufen dort ohnehin nicht, aber
  // das SVG landet auch in Kontexten, die wir nicht kennen – die Pruefung
  // kostet nichts und faengt ein versehentlich eingebautes Loch.
  for (const mood of MOOD_ORDER) {
    it(`${mood}: kein <script>, kein on*-Attribut, kein <text>`, () => {
      const svg = renderPet(STATES[mood]);
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/javascript:/i);
      // Kein <text>, weil GitHub im eingebetteten SVG keine Fonts laedt.
      expect(svg).not.toMatch(/<text[\s>]/i);
      expect(attributeNames(svg).filter((name) => /^on/i.test(name))).toEqual([]);
    });
  }
});

describe("renderPet – Groessenbudget", () => {
  for (const mood of MOOD_ORDER) {
    for (const satiety of [0, 55, 100]) {
      it(`${mood} bei Saettigung ${satiety}: unter ${MAX_SVG_BYTES} Bytes`, () => {
        const svg = renderPet({ ...STATES[mood], satiety });
        expect(Buffer.byteLength(svg, "utf8")).toBeLessThan(MAX_SVG_BYTES);
      });
    }
  }
});

describe("renderPet – Animation", () => {
  for (const mood of MOOD_ORDER) {
    const sprite = SPRITES[mood];

    it(`${mood}: jeder Frame hat eine Gruppe und eigene Keyframes`, () => {
      const svg = renderPet(STATES[mood]);
      for (let index = 0; index < sprite.frames.length; index += 1) {
        expect(svg).toContain(`class="f f${index}"`);
        expect(svg).toContain(`@keyframes k${index}{`);
      }
    });

    it(`${mood}: laeuft ueber ${sprite.loopSeconds}s und schaltet hart`, () => {
      const svg = renderPet(STATES[mood]);
      expect(svg).toContain(`animation-duration:${sprite.loopSeconds}s`);
      // Pixel-Art blendet nicht, sie schaltet.
      expect(svg).toContain("animation-timing-function:step-end");
    });
  }

  it("ohne laufende Animation bleibt Frame 0 sichtbar", () => {
    // Das ist zugleich die Antwort auf prefers-reduced-motion.
    const svg = renderPet(STATES.content);
    expect(svg).toContain(".f{opacity:0;");
    expect(svg).toContain(".f0{opacity:1;");
    expect(svg).toContain("@media(prefers-reduced-motion:reduce){.f{animation:none}}");
  });
});

describe("Koerperbreite", () => {
  it("die Schwellen sind die der Stimmung, nicht eigene", () => {
    expect(bodyWidthPairs(MOOD_SAD_SATIETY - 1)).toBe(-SEAM_MAX_PAIRS);
    expect(bodyWidthPairs(MOOD_SAD_SATIETY)).toBe(0);
    expect(bodyWidthPairs(MOOD_HAPPY_SATIETY - 1)).toBe(0);
    expect(bodyWidthPairs(MOOD_HAPPY_SATIETY)).toBe(SEAM_MAX_PAIRS);
  });

  it("mager und rund aendern nur die Breite, nicht die Zeilenzahl", () => {
    for (const mood of MOOD_ORDER) {
      for (const frame of SPRITES[mood].frames) {
        for (const row of frame.rows) {
          expect(resizeRow(row, -SEAM_MAX_PAIRS)).toHaveLength(SPRITE_SIZE - SEAM_MAX_PAIRS * 2);
          expect(resizeRow(row, SEAM_MAX_PAIRS)).toHaveLength(SPRITE_SIZE + SEAM_MAX_PAIRS * 2);
        }
      }
    }
  });

  it("die breiteste Variante passt noch auf die Leinwand", () => {
    expect(SPRITE_SIZE + SEAM_MAX_PAIRS * 2).toBeLessThanOrEqual(CANVAS_WIDTH);
  });
});

describe("runsOf – benachbarte gleiche Pixel werden zusammengefasst", () => {
  it("eine durchgehende Reihe ergibt ein Rechteck, nicht zwoelf", () => {
    const runs = runsOf("....bbbbbbbbbbbb........");
    expect(runs).toEqual([{ x: 4, width: 12, role: "body" }]);
  });

  it("Transparenz erzeugt gar kein Rechteck", () => {
    expect(runsOf("........................")).toEqual([]);
  });

  it("Farbwechsel trennt die Laeufe", () => {
    expect(runsOf("..oobb..").map((run) => run.role)).toEqual(["outline", "body"]);
  });
});

describe("renderPet ist rein", () => {
  it("derselbe Zustand ergibt byteweise dasselbe SVG", () => {
    expect(renderPet(STATES.happy)).toBe(renderPet(STATES.happy));
  });
});
