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
 * - `docs/social-preview.png` ist die Kachel, die beim Teilen des Repos
 *   erscheint. Sie wird von Hand in die Einstellungen geladen und faellt
 *   danach niemandem mehr auf.
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
  "\nBitte `npm run build:check` laufen lassen - es erzeugt Bundle, Galerie\n" +
    "und Preview-Kachel neu - und das Ergebnis mitcommitten. Alle drei werden\n" +
    "eingecheckt, weil GitHub das Bundle direkt ausfuehrt, das README die\n" +
    "Galerie einbindet und die Kachel von Hand hochgeladen wird.",
);
process.exit(1);
