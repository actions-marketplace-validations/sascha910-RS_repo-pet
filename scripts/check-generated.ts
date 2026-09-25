/**
 * Prueft, ob die eingecheckten Artefakte zum Quelltext passen.
 *
 * Aufruf: `node build/scripts/check-generated.js dist docs/gallery`
 *
 * Zwei Dinge im Repo werden erzeugt und trotzdem eingecheckt, und bei beiden
 * faellt es niemandem auf, wenn sie veralten:
 *
 * - `dist/index.cjs` ist das, was GitHub bei anderen Leuten ausfuehrt – nicht
 *   der Quelltext daneben. Vergisst jemand den Build, laeuft in fremden Repos
 *   wochenlang eine aeltere Version.
 * - `docs/gallery/*.svg` steht im README. Aendert sich das Sprite, zeigt die
 *   Galerie weiter die alte Kreatur.
 *
 * Deshalb ist das ein Fehler, keine Warnung.
 */

import { execFileSync } from "node:child_process";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Aufruf: check-generated.js <pfad> [<pfad> ...]");
  process.exit(2);
}

const status = execFileSync("git", ["status", "--porcelain", "--", ...paths], {
  encoding: "utf8",
}).trim();

if (status === "") {
  console.log(`Aktuell: ${paths.join(", ")}`);
  process.exit(0);
}

console.error("Diese erzeugten Dateien passen nicht zum Quelltext:\n");
console.error(status);
console.error(
  "\nBitte `npm run build` und `npm run gallery` laufen lassen und das\n" +
    "Ergebnis mitcommitten. Beides wird eingecheckt, weil GitHub das Bundle\n" +
    "direkt ausfuehrt und das README die Galerie direkt einbindet.",
);
process.exit(1);
