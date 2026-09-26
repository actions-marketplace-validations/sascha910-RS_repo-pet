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
 * `docs/social-preview.png` steht bewusst **nicht** auf der Liste, obwohl es
 * ebenfalls erzeugt und eingecheckt wird. Die Pixel sind reproduzierbar, die
 * Datei ist es nicht: die Deflate-Ausgabe haengt von der zlib-Version ab, die
 * in der jeweiligen Node-Version steckt. Ein Byte-Vergleich meldete dann bei
 * jedem Versionsunterschied eine Abweichung, die keine ist - und liesse
 * nebenbei bei jedem Lauf eine geaenderte Datei im Arbeitsverzeichnis liegen.
 * Die Kachel wird ohnehin von Hand hochgeladen; ein veralteter Stand im Repo
 * bricht nichts.
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
  "\nBitte `npm run build:check` laufen lassen - es erzeugt Bundle und\n" +
    "Galerie neu - und das Ergebnis mitcommitten. Beides wird eingecheckt,\n" +
    "weil GitHub das Bundle direkt ausfuehrt und das README die Galerie\n" +
    "direkt einbindet.",
);
process.exit(1);
