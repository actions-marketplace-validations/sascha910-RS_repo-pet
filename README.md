# repo-pet

GitHub Action, die den Zustand eines Repos als Tamagotchi-Kreatur rendert.

Eigenstaendiges Projekt – TypeScript, Node 20, ESM.

## Stand

Session 1 von 4: Stats-Sammler und Zustandsableitung. Noch kein SVG, noch
keine Action-Verpackung.

## Module

- `src/types.ts` – gemeinsame Typen (`RepoStats`, `PetState`, `Mood`)
- `src/state.ts` – `deriveState(stats)`, rein und ohne Netzwerk. Alle
  Schwellwerte stehen als benannte Konstanten oben in der Datei und sind
  dort begruendet.
- `src/stats.ts` – `collectStats(octokit, owner, repo)` gegen die GitHub-
  REST-API. Fehlende Features (kein CI, keine Issues, leeres Repo) ergeben
  neutrale Defaults; ein erschoepftes Kontingent wirft `RateLimitError`.

## Befehle

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # nach dist/
npm run demo -- owner/repo
```

Die Demo braucht ein Token aus `GITHUB_TOKEN` oder `GH_TOKEN`; ersatzweise
zieht sie eines aus `gh auth token`. Sie schreibt JSON nach stdout und
Diagnosen nach stderr, laesst sich also nach `jq` weiterreichen.

## Zustandsmodell

`satiety` (0-100) kommt aus den Commits der letzten 7 Tage und sinkt mit
jedem Tag Stillstand nach einer Schonfrist von zwei Tagen. `health` (0-100)
startet bei einer neutralen Baseline und wird vom letzten CI-Ergebnis sowie
vom Verhaeltnis offener zu kuerzlich geschlossenen Issues verschoben.
`mood` kombiniert beides, wobei Krankheit Vorrang hat: rotes CI bleibt
sichtbar, auch wenn fleissig committed wird.

Ein brandneues, leeres Repo landet bewusst auf `sad` – es hat nichts zu
fressen, unterscheidet sich damit aber sauber vom verwahrlosten Repo mit
rotem CI (`sick`).
