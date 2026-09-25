# Wie schnell ist ein Update sichtbar?

Kurzfassung: **nach spaetestens fuenf Minuten, ohne Cache-Buster.**

Das ist wichtig festzuhalten, weil die verbreitete Ratschlaege zu
README-Bildern – „GitHub cached aggressiv", „du brauchst einen
PURGE-Request", „haeng einen Zeitstempel an die URL" – hier *nicht* gelten.
Sie stammen aus der Welt der Shields.io-Badges, und die funktioniert anders.

Alle Werte unten sind am 25.09.2026 direkt an den Servern gemessen, nicht aus
der Dokumentation uebernommen.

## Camo fasst die Datei nicht an

GitHub leitet Bilder in gerendertem Markdown ueber den Bildproxy
`camo.githubusercontent.com` – aber nur solche von **fremden** Hosts. Eine
URL auf `raw.githubusercontent.com` wird unveraendert durchgereicht.

Nachgewiesen an der README von `home-assistant/core`, die beides enthaelt:
Bilder von externen Hosts stehen dort als `camo.githubusercontent.com/...`,
Bilder aus dem eigenen Repo als `raw.githubusercontent.com/...`.

Damit entfaellt die gesamte Camo-Problematik: keine stundenlangen
Proxy-Caches, kein `curl -X PURGE`, keine Cache-Buster-Query.

## Was der Server tatsaechlich sagt

```
content-type:  image/svg+xml
cache-control: max-age=300
etag:          "aaf1d3cb..."
vary:          Authorization, Accept-Encoding
```

Drei Punkte daran:

**`image/svg+xml`.** Nur die raw-Adresse liefert diesen Content-Type. Ueber
`github.com/.../blob/...` kommt eine HTML-Seite, die sich nicht in ein `<img>`
haengen laesst. Deshalb baut `svgRawUrl()` genau diese URL.

**`max-age=300`.** Fuenf Minuten, an Fastly und im Browser. Das ist die
gesamte Verzoegerung zwischen Commit und sichtbarem Update. Ein Cache-Buster
wuerde nichts beschleunigen – ein `?v=123` wird zwar klaglos akzeptiert und
beantwortet, aendert aber nur den Cache-Key und loest kein frueheres
Nachladen im Browser eines Dritten aus.

**`vary: Authorization`.** Angemeldete und anonyme Besucher bekommen
getrennte Cache-Eintraege. Wer gerade committet hat, sieht das Update unter
Umstaenden frueher als ein fremder Leser – kein Fehler, nur nichts, worauf
man sich verlassen sollte.

## Die Content-Security-Policy bestaetigt den Renderer

`raw.githubusercontent.com` liefert SVGs mit:

```
content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox
```

Das ist die Begruendung fuer die Bauweise in `render.ts`, schwarz auf weiss:

- `style-src 'unsafe-inline'` erlaubt den `<style>`-Block **ausdruecklich** –
  die CSS-`@keyframes`-Animation laeuft.
- `default-src 'none'` plus `sandbox` verbieten Skripte. JavaScript und SMIL
  waeren tot, auch wenn wir sie einbauten.

Die Entscheidung „Animation nur ueber CSS" war damit nicht vorsichtig,
sondern die einzig moegliche.

## Folge fuer den Workflow

Ein taeglicher Cron reicht vollkommen. Enger zu takten bringt nichts: das
Bild aendert sich ohnehin nur, wenn sich der Zustand aendert, und die
fuenf Minuten Cache liegen weit unter jedem sinnvollen Intervall.

Wenn ein Update „nicht ankommt", liegt es fast nie am Cache. Die
wahrscheinlichere Ursache ist, dass gar kein Commit entstanden ist – die
Action ueberspringt ihn bei unveraendertem SVG absichtlich.
