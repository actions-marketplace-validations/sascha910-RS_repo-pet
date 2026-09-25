/**
 * Preview-Skript: `npm run preview`
 *
 * Schreibt `preview.html` mit jeder fertigen Stimmung in den drei
 * Saettigungsstufen, einmal auf hellem und einmal auf dunklem Grund.
 *
 * Die SVGs haengen als `data:`-URI in einem `<img>` und nicht inline im
 * Dokument. Das ist der Punkt der ganzen Uebung: GitHub bindet das Bild
 * genauso ein, und in einem `<img>` gelten andere Regeln als im Dokument –
 * kein JavaScript, kein externer Font, kein Zugriff nach aussen. Was hier
 * laeuft, laeuft auch in der README; was inline funktioniert haette, sagt
 * darueber nichts.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderPet } from "../src/render.js";
import { SHOWCASE_SATIETY_STEPS, showcaseState } from "../src/showcase.js";
import { MOOD_ORDER } from "../src/sprites/index.js";
import type { Mood } from "../src/types.js";

/**
 * Die drei Saettigungsstufen: unter `MOOD_SAD_SATIETY`, dazwischen, ueber
 * `MOOD_HAPPY_SATIETY`. Genau die Werte, an denen `bodyWidthPairs()`
 * umschaltet – das Preview soll die Grenzen zeigen, nicht huebsche Zahlen.
 */
const SATIETY_STEPS: readonly [number, string][] = [
  [15, "mager"],
  [55, "normal"],
  [85, "rund"],
];

/**
 * Gesundheit je Stimmung. Nicht frei gewaehlt, sondern so, wie `deriveState()`
 * sie liefern wuerde – sonst zeigt das Preview Zustaende, die es nicht gibt,
 * und man beurteilt eine Faerbung, die nie auftritt.
 */
const HEALTH_BY_MOOD: Record<Mood, number> = {
  happy: 90,
  content: 75,
  sad: 65,
  sick: 25,
};

const BYTES = new TextEncoder();

function cell(mood: Mood, satiety: number, caption: string): string {
  const state = showcaseState(mood, satiety);
  const svg = renderPet(state);
  const bytes = BYTES.encode(svg).length;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

  return (
    `<figure><img src="${uri}" alt="${mood} ${caption}">` +
    `<figcaption>${caption} · ${(bytes / 1024).toFixed(1)} KB</figcaption></figure>`
  );
}

function board(theme: "light" | "dark"): string {
  const rows = MOOD_ORDER.map((mood) => {
    const cells = SHOWCASE_SATIETY_STEPS.map(([satiety, caption]) => cell(mood, satiety, caption)).join("");
    return `<section><h2>${mood}</h2><div class="row">${cells}</div></section>`;
  }).join("");

  return `<div class="board ${theme}"><h1>${theme}</h1>${rows}</div>`;
}

const html = `<!doctype html>
<html lang="de">
<meta charset="utf-8">
<title>repo-pet preview</title>
<style>
  body { margin: 0; font: 13px ui-monospace, monospace; }
  .board { padding: 24px 32px 32px; }
  .light { background: #ffffff; color: #1f2328; }
  .dark  { background: #0d1117; color: #c9d1d9; }
  h1 { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: .12em; opacity: .5; }
  h2 { margin: 20px 0 6px; font-size: 13px; font-weight: 600; }
  .row { display: flex; gap: 28px; align-items: flex-end; }
  figure { margin: 0; text-align: center; }
  figcaption { margin-top: 6px; font-size: 11px; opacity: .6; }
</style>
${board("light")}
${board("dark")}
`;

const target = resolve(process.cwd(), "preview.html");
writeFileSync(target, html, "utf8");
console.log(`preview.html geschrieben: ${target}`);
