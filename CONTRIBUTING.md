# Mitarbeiten

## Einrichten

```bash
npm install
npm test
```

Node 24 oder neuer – dieselbe Version, die `action.yml` als Runtime deklariert.

## Am Sprite-Design arbeiten

Das ist der Teil, für den es eine Anleitung braucht. Der Rest erklärt sich im
Code.

```bash
npm run preview     # schreibt preview.html, dann im Browser öffnen
```

`preview.html` zeigt alle vier Stimmungen in je drei Sättigungsstufen, einmal
auf hellem und einmal auf dunklem Grund.

**Sieh es dir dort an und nirgends sonst.** Die SVGs hängen in der Vorschau als
`data:`-URI in einem `<img>` – genau so, wie GitHub sie später einbindet. In
einem `<img>` gelten andere Regeln als im Dokument: kein JavaScript, keine
externen Fonts. Was inline im Browser funktioniert, sagt nichts darüber, ob es
in einer README läuft.

Der Ablauf:

1. Eine Datei in `src/sprites/` ändern – `content.ts`, `happy.ts`, `sad.ts`
   oder `sick.ts`. Jeder Frame ist ein 24×24-Raster aus Zeichen, ein Zeichen
   pro Pixel. Die Legende steht in `src/sprites/format.ts`.
2. `npm run preview` und hinsehen.
3. `npm test`. Ändert sich ein Snapshot, hat sich das Bild geändert – das ist
   der Zweck. Erst die Vorschau beurteilen, dann `npx vitest run -u`.
4. Hat sich das Aussehen geändert: `npm run gallery` und `npm run social`,
   damit die Bilder im README und die Social-Preview-Kachel nachziehen.
   `build:check` erledigt beides mit, prüft aber zusätzlich, ob du es auch
   committet hast.

### Die eine Regel, die beim ersten Versuch zubeißt

Im **Nahtband** – Spalten 10 bis 13 – muss jede Zeile ein einziges,
wiederholtes Zeichen tragen. Dort verdoppelt oder entfernt der Renderer
Spalten, um die Sättigung als Körperbreite zu zeigen. Was überall gleich ist,
kann man verdoppeln oder löschen, ohne dass sich die Form ändert – nur die
Breite.

`frame()` prüft das beim Import und nennt Zeile und Inhalt. Ein Verstoß ist
also kein stiller, schiefer Pixel, sondern ein Fehler beim Testlauf.

Praktisch heißt das: **kein Detail darf in der Mitte liegen.** Bei dieser
Kreatur fällt das mit dem Entwurf zusammen, weil die Lücke zwischen den
Augäpfeln genau das Band ist.

Eine reine Verschiebung ist keine neue Zeichnung – dafür gibt es
`shiftColumns()`. Wer 24 Zeilen kopiert, um sie um ein Pixel zu versetzen, hat
beim nächsten Ändern zwei Posen, die auseinanderlaufen.

### Größenbudget

Ein fertiges SVG muss unter 15 KB bleiben; ein Test prüft das für jede
Stimmung in jeder Breite. Bei drei Frames ist es knapp. Wird es eng, ist der
nächste Hebel, `height="1"` aus den Rechtecken in eine CSS-Regel zu ziehen.

## Vor dem Commit

```bash
npm run typecheck
npm test
npm run build:check
```

`build:check` schlägt fehl, wenn `dist/`, `docs/gallery/` oder
`docs/social-preview.png` nicht zum Quelltext passen. Alle drei werden
eingecheckt: GitHub führt bei einer JavaScript-Action `dist/index.cjs` direkt
aus, das README bindet die Galerie direkt ein, und die Preview-Kachel lädt man
von Hand in die Repo-Einstellungen hoch. Veraltet eines davon, merkt es
niemand.

## Die Action lokal durchspielen

Ohne Workflow, gegen die echte API, ohne etwas zu schreiben:

```bash
npm run build
INPUT_GITHUB_TOKEN="$(gh auth token)" \
INPUT_REPOSITORY="owner/repo" \
INPUT_OUTPUT_BRANCH="pet-output" \
INPUT_OUTPUT_FILENAME="pet.svg" \
INPUT_DRY_RUN="true" \
GITHUB_STEP_SUMMARY=/tmp/summary.md \
GITHUB_OUTPUT=/tmp/output.txt \
node dist/index.cjs 2>&1 | sed 's/::add-mask::.*/::add-mask::[maskiert]/'
```

Das `sed` am Ende ist nicht optional. `core.setSecret()` schreibt
`::add-mask::<token>` auf stdout; im Runner fängt GitHub das ab, im Terminal
steht sonst dein Token im Klartext.

## Sprache

Kommentare, Doc-Comments, Test-Namen und Commit-Messages sind auf Deutsch,
**ohne Umlaute in Quelldateien** (`Saettigung`, `laeuft`). Bezeichner bleiben
englisch (`satiety`, `health`).

Fließtext, der nach außen geht – dieses Dokument und die beiden READMEs –
verwendet dagegen korrekte Umlaute. Ein öffentliches README mit „Saettigung"
sieht nach kaputtem Encoding aus.

Kommentare begründen, *warum* ein Wert so ist, nicht *was* die Zeile tut. Jede
neue Konstante bekommt diese Begründung.
