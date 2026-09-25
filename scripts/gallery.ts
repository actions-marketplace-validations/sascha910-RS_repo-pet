/**
 * Galerie-Skript: `npm run gallery`
 *
 * Schreibt je Stimmung eine SVG-Datei nach `docs/gallery/`. Diese Dateien
 * werden eingecheckt und vom README eingebunden.
 *
 * Warum eingecheckt und nicht live erzeugt: das README soll die vier
 * Stimmungen zeigen koennen, auch wenn das Repo gerade `content` ist. Ein
 * Bild aus dem Output-Branch zeigt immer nur den einen echten Zustand – die
 * Galerie zeigt, was die Action ueberhaupt kann.
 *
 * Das Skript ist absichtlich idempotent: bei unveraendertem Renderer sind
 * die Dateien byteweise gleich und erzeugen keinen Diff.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { renderPet } from "../src/render.js";
import { showcaseState } from "../src/showcase.js";
import { MOOD_ORDER } from "../src/sprites/index.js";

/** Zielverzeichnis, relativ zur Projektwurzel. */
export const GALLERY_DIR = "docs/gallery";

const target = resolve(process.cwd(), GALLERY_DIR);
mkdirSync(target, { recursive: true });

for (const mood of MOOD_ORDER) {
  const state = showcaseState(mood);
  const svg = renderPet(state);
  const file = resolve(target, `${mood}.svg`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, svg, "utf8");
  console.log(
    `${GALLERY_DIR}/${mood}.svg  ${String(Buffer.byteLength(svg, "utf8")).padStart(6)} Bytes ` +
      `(Saettigung ${state.satiety}, Gesundheit ${state.health})`,
  );
}
