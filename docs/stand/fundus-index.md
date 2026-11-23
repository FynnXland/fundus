# fundus-index: Index für 100.000+ Einträge

Stand 23.11.2026. Fertig und eingespielt, bis auf den kleinen Patch in `src/main.js` (unten), den nur der Orchestrator
einspielen darf. Ohne den Patch läuft die Seite vollständig, nur ohne den Geschwindigkeitsgewinn für Ordner.

## Dateien

| Datei | Inhalt |
|---|---|
| `public/data/stand.json` | wie bisher, dazu `index`: Teile je Art, Kacheln, Lizenzgruppen, Felder |
| `public/data/start.json` | gemischte Auswahl, Felder mit `art` vorne |
| `public/data/index/<art>/kopf.json` | die ersten 240 Zeilen der Art in gemischter Reihenfolge |
| `public/data/index/<art>/<nn>.json` | Teile zu 500 Zeilen, sortiert nach Unterordner, Schlagworten, Mischwert |
| `public/data/suche/k_<schlüssel>.json` | Suchkacheln (Wort → Zeilennummern), höchstens 64 KB roh |
| `public/data/karten/<xx>.json` | wie bisher, jeder Eintrag trägt dazu `indexTeil` (Nummer seines Teils) |

Code: `crawler/lib/suchindex.mjs` (Kacheln, Suche, läuft in Node und im Browser), `crawler/lib/ausgabe.mjs`
(Teile, Köpfe, Kacheln, `stand.index`), `crawler/publish.mjs` (`FELDER`, `zeile`, `suchfelder`, `--ziel <ordner>`),
`src/katalog.js` (Laden im Browser), `tests/index.test.mjs`.

Die Zeilen sind schlanker: `art`, `quellname` und `gruppe` stehen nicht mehr drin (`katalog.js` ergänzt sie aus
`stand.sources` und `stand.index.lizenzgruppen`), `utm_*` ist aus `fremd` entfernt (das Bild lädt ohne).

## Neue Art ergänzen

Eintrag in `KINDS` (`crawler/lib/schema.mjs`) und in `ARTEN` (`src/katalog.js`). Teile, Kopf und Suche entstehen
beim nächsten `npm run daten` von selbst; eine Art ohne Einträge bekommt keine Dateien.

## So lädt die Seite

- Start: `stand.json` und `start.json` (26 KB gzip).
- Ordner: Kopf (25 KB gzip), im Hintergrund der Rest. Ein Unterordner lädt nur die Teile, in denen er liegt.
- Suche: die Kacheln der Suchwörter, dann nur die Teile, in denen Treffer liegen.
- Filter, die jede Zeile brauchen (Lizenz, Format, Quelle, andere Sortierung): laden den Ordner vollständig.

## Patch für `src/main.js` (nur Orchestrator)

Ohne `beimNachladen` wartet `hole()`, bis ein Ordner vollständig da ist (richtig, aber langsamer). Mit dem Patch zeigt
ein Ordner nach dem Kopf schon etwas.

1. Import erweitern: `import { ladeKatalog, beimNachladen, filtern, bedarf, hat, hole, ARTEN, LIZENZGRUPPEN, SORTIERUNGEN } from './katalog.js';`
2. In `katalogLaden()` nach `zustand.katalog = await ladeKatalog();`:
   ```js
   beimNachladen(zustand.katalog, (was) => {
     if (imKatalog() && bedarf(zustand.filter, zustand.wurzelAlle) === was) trefferZeigen({ behalteAnzahl: true });
   });
   ```
3. Die Zahl über dem Raster: Solange der Rest lädt, ist `liste.length` kleiner als die Art. Für einen Ordner ohne
   Filter und für „Alle Objekte“ steht die Gesamtzahl schon in den Daten: in `trefferZeigen` für `gesamt` bei
   `f.art && !f.unter && !f.q` den Wert `k.stand.perKind[f.art]` nehmen, bei `zustand.wurzelAlle` ohne Filter
   `k.stand.total`, sonst `liste.length`. (Filter, die alles brauchen, sind immer vollständig.)
4. Ladetext (`ladeanzeige`): Bedarfe sind jetzt Zeichenketten `bild`, `bild!`, `bild|Holz`, `alle`, `alle!`, `s|<art>|<unter>|<suche>`.
   Der bisherige Text passt für `alle` und `bild`; die anderen zeigen „Ordner wird geladen …“, für die Suche wäre „Suche läuft …“ besser.

## Bekannte Grenzen

- Die Suche toleriert Tippfehler erst ab fünf Buchstaben und findet Wortanfänge ab zwei Buchstaben. Das alte MiniSearch
  fand bei kurzen Wörtern viel Unsinn („cat“: 947 statt 332 Treffer, dazu „car“, „cut“). Es fehlt nichts Echtes:
  neue Treffer sind in allen 25 Probewörtern eine Teilmenge der alten, außer „serif“ (2 mehr, Bindestrich-Wörter).
- „Ähnliche Objekte“ und „Mehr von …“ arbeiten mit den geladenen Zeilen der Art. Der Teil des geöffneten Eintrags wird
  mitgeladen (Nachbarn im Teil teilen Unterordner und Schlagworte), eine Sammlung über mehrere Teile ist daher nur so
  vollständig wie das, was gerade geladen ist.
- `minisearch` wird von `src/` nicht mehr gebraucht; die Abhängigkeit in `package.json` kann raus (Orchestrator).
- Vorbestehend, nicht von hier: `melden` in `src/seiten.js` liest aus `katalog.byId` volle Einträge (`it.title`,
  `it.source.name`), `byId` hält aber nur Indexzeilen (`titel`, `quellname`). Mit geladenem Ordner und `?id=` bricht die Seite.
