# fundus-gruppen: zusammengehörige Einträge als Gruppenordner

Stand: 26.11.2026, Branch `gruppen` (Arbeitskopie `E:\Entwicklung\07_Tools\Medien\Fundus-gruppen`). Nicht deployt.

## Auftrag

Zusammengehörige Einträge (Poly-Haven-Reihen wie „Brass Vase 01 bis 04“, game-icons.net mit 35 Gestaltern, Bildserien
eines Urhebers) erscheinen als eine Ordnerkarte statt als Dutzende Einzelkarten. Erst messen, dann nur gruppieren, was
sauber ist.

## Messung

Skript: `node crawler/gruppen-messen.mjs [--probe 8] [--seed 1]`. Es nimmt dieselben Filter und Zusammenführungen wie
`publish.mjs` (gültig, nicht gesperrt, Dubletten zusammengeführt) und gibt Zahlen je Schlüssel plus eine Stichprobe je
Quelle und Art aus. Gemessen auf zwei Ständen:

- **eingecheckter Stand** (Commit `ade935e`, Daten vom 26.11.2026 21:37 UTC): 59.972 veröffentlichte Einträge.
  Reproduzierbar, alle Zahlen unten beziehen sich darauf, wenn nicht anders angegeben.
- **laufender Aufhol-Crawl** (Hauptordner, nur gelesen, Daten vom 26.11.2026 22:28 UTC): 169.677 Einträge,
  979 Gruppen mit 24.143 Mitgliedern. Nach dem Crawl einfach das Skript noch einmal laufen lassen.

Gruppe heißt hier: mindestens 3 Mitglieder (`MINDEST` in `crawler/lib/gruppen.mjs`).

| Schlüssel | Gruppen | Mitglieder | Urteil |
|---|---|---|---|
| `collection` + Urheber | 79 | 15.997 | **genommen.** Emoji-Sets, 21 Streamline-Serien, 30 Skill-Repositories, game-icons.net je Gestalter (24 Gestalter mit mindestens 3 Icons, die übrigen Icons bleiben einzeln) |
| Titelstamm mit Zähler (Quelle, Art, Urheber) | 483 | 3.971 | **genommen.** Nummerierte Reihen, Folios eines Buchs, Sätze eines Musikstücks, Aufnahmen einer Art bei xeno-canto |
| gleicher Titel ohne Zähler (ab 3 Wörtern) | 66 | 374 | verworfen: oft verschiedene Fotos mit gleicher Bildunterschrift (John Thomson, Wellcome) oder Sammelbegriffe |
| Commons-Kategorie (spezifischste geteilte je Urheber) | 1.925 | 11.601 | verworfen: in 6 von 20 Stichprobengruppen eine Sammelkategorie ohne Thema (Auflösung, Prüfvermerk, „videos from youtube“, Interpretin statt Werk) |
| Urheber allein (Bildquellen) | 823 | 14.700 | verworfen: keine Serie, größte „Wellcome Collection“ mit 1.661 Einträgen |
| Internet Archive, Sammlung | 6 | 569 | verworfen: „freemusicarchive“ hat 193 Einträge von 127 Urhebern |
| Internet Archive, Album (gleicher Titel und Urheber) | 0 | 0 | trägt nicht, jedes Album ist schon ein Eintrag |
| Iconify-Set | 0 | 0 | trägt nicht, jeder Eintrag ist schon ein ganzes Set |

Regeln für den Titelstamm (`stamm()` in `crawler/lib/gruppen.mjs`):

- Zähler am Ende: `01`, `12r`, `(3)`, `(2 of 6)`, `No. 2`, `fol. 1r`, Dateizähler wie `XC250491` oder `DSCF2224`.
- Kein Zähler: Jahre (`Paris 1889`), Modellbezeichnungen mit Buchstaben vorn (`Citroën C1`), Ziffern ohne Trenner.
- Poly Haven und ambientCG nummerieren ihre Reihen selbst, über Autoren hinweg („Barrel 01“ von Jorge Camacho,
  „Barrel 03“ von Serhii Khromov). Dort zählt der Urheber nicht, abweichend vom Wortlaut des Auftrags. Mit Urheber
  wären es im Rohbestand 78 statt 113 Poly-Haven-Gruppen gewesen, und Fynns Beispiel wäre zerfallen.
- Ohne bekannten Urheber gruppiert nur ein echter Zähler (Cleveland „Button (1 of 7)“).
- Der Name ist der gemeinsame Anfang der Titel bis zum Wortende, ohne Zählerwort („Circus, No. 1“ wird „Circus“).

**Falsche Zusammenlegungen**, Stichprobe der gewählten Regeln mit bis zu 8 Gruppen je Quelle und Art (seed 1):
146 Gruppen geprüft, **2 falsch**: „Messerschmitt Me 262 / 163 / 410“ (Modellnummern, Commons-Grafik) und
„Panjabi Manuscript 255 / 256“ (Signaturen verschiedener Handschriften, Wellcome). Eine zweite Stichprobe (seed 7, bis 6
je Quelle und Art) fand dieselben zwei und keine weiteren. Musik extra geprüft (Verdacht „Symphony No. 5 / 6 / 7“):
alle 19 Commons-Musikgruppen sind Sätze oder Variationen eines Werks („Haydn 35“ mit drei Sätzen, „Chopin op25“).

Wirkung im eingecheckten Stand (562 Gruppen, 19.968 Mitglieder, 33,3 % des Katalogs):

| Ordner | Einträge | Karten gruppiert |
|---|---|---|
| Icons & UI | 14.906 | 331 |
| Claude-Skills | 1.430 | 87 |
| Materialien | 3.490 | 1.724 |
| Umgebungen & Licht | 1.443 | 1.170 |
| Sounds | 3.687 | 3.205 |
| 3D-Modelle | 4.563 | 4.344 |
| Videos | 4.381 | 4.126 |
| Bilder | 17.612 | 17.204 |

## Umsetzung

**Daten** (`crawler/lib/gruppen.mjs` neu, `crawler/lib/ausgabe.mjs`, `crawler/publish.mjs`)

- `bildeGruppen(items)` setzt `it.serie = { id, name, anzahl }`. Ids sind stabil: Art, Punkt, Anfang von sha1(Schlüssel),
  etwa `3d.0d2d2382`. Das volle Objekt landet mit in `karten/<xx>.json`.
- Neues letztes Feld in `FELDER`: `serie` = `[id, anzahl]` oder `null`. Leser lesen über `felder`, alter Code ignoriert es.
- `index/<art>/gruppen.json` je Art mit Gruppen: Name, Anzahl, Mitglieder je Unterordner, Teile mit Mitgliedern, bis 4
  Bilder (eigene Vorschau zuerst, sonst kleines Bild der Quelle), Urheber und Lizenz, wenn einheitlich. 0,3 bis 43 KB.
- `index/gruppenbloecke.json`: `[erste Zeilennummer, Zeilen, Gruppen-id]` je Lauf einer Gruppe (18 KB). Damit faltet der
  MCP Treffer, ohne ihre Teile zu laden.
- Ordnung der Teile jetzt Unterordner, Gruppe, Tags, Mischwert: die Mitglieder einer Gruppe liegen je Unterordner
  beieinander. Eine Gruppe braucht so höchstens ihre Größe durch 500 plus einen Teil (OpenMoji mit 2.466: 6 Teile).
- `stand.json` `.index.gruppen` = Gruppen je Art. Dateien in `dist/`: eingecheckter Stand 549 (vorher 537), also eine
  Datei je Art mit Gruppen plus eine.

**Seite** (`src/katalog.js`, `src/main.js`, `src/karte.js`, `src/styles.css`, `src/symbole.js`)

- Rasteransicht: eine Gruppe ist eine Ordnerkarte an der Stelle ihres besten Mitglieds. Mosaik aus 1 bis 4 Bildern, ein
  zweites Blatt schaut oben heraus, die Anzahl steht auf einer kleinen Pille. Darunter Name und „Gruppe · Quelle“.
- Klick öffnet `#/?art=…&serie=…`: alle Mitglieder in natürlicher Reihenfolge („Vase 2“ vor „Vase 10“), Zurück-Knopf
  zum Ordner, Anzahl mit Urheber. Filter des Ordners bleiben, die Seite springt zum Titel.
- Größe auf der Karte: im Ordner die ganze Gruppe, im Unterordner die Mitglieder dort, mit Lizenz-, Format- oder
  Quellfilter die übrig gebliebenen. Bleibt nur eines, ist es eine normale Karte.
- Umschalter „Gruppiert / Einzeln“ neben „Raster / Liste“, gemerkt in `localStorage` (`fundus.gruppen`). Er ist versteckt,
  wo er nichts ändert: in der Suche, in einer Gruppe und in der gemischten Startstichprobe.
- Die Suche findet weiter einzelne Einträge. Die Startstichprobe bleibt bewusst einzeln: sie mischt alle Arten und
  bräuchte sonst beim ersten Laden alle Gruppendateien.
- Listenansicht: Gruppenzeile mit Ordnersymbol, „Gruppe mit N Objekten“.
- Detailblatt: „Gehört zur Gruppe X mit N Objekten“ mit Link.

**MCP** (`mcp/src/kern.mjs`, `mcp/src/werkzeuge.mjs`)

- `fundus_search` faltet die Treffer einer Gruppe auf einer Seite in die erste Zeile:
  `Brass Vase 03 [group 3d.0d2d2382: 4 entries, 4 here]`. `limit` zählt Zeilen. Kopf: „showing 1-12 in 6 rows“ und ein
  Satz, was die Marke heißt. Der Cursor bleibt eine Position; eine spätere Seite kann dieselbe Gruppe noch einmal zeigen.
- Neuer Parameter `group`: listet die Mitglieder, Kopf mit Name und Urheber. Unbekannte id gibt eine klare Fehlermeldung.
- `fundus_details` nennt die Gruppe und wie man sie auflistet.
- Kosten, eingecheckter Stand, je 10 Zeilen, frischer Kern:

| Anfrage | gefaltet: Dinge / Abrufe | ungefaltet: Dinge / Abrufe |
|---|---|---|
| „paving“ | 10 / 4 | 5 / 3 |
| „cat“ in icon | 10 / 9 | 4 / 5 |
| „day environment“ | 10 / 2 | 1 / 2 |
| „sparrow“ | 10 / 6 | 6 / 4 |
| Liste icon | 10 / 2 | 1 / 1 |

  „Dinge“ = verschiedene Gruppen oder Einzeleinträge. Die Antwort ist je Seite etwa gleich lang (rund 1.000 bis 1.700
  Zeichen), zeigt aber bis zu zehnmal mehr Verschiedenes. Dazu kommt einmal je Datenstand `gruppenbloecke.json`.

## Tests und Prüfung

- `npm test`: 283 von 283 grün. Neu `tests/gruppen.test.mjs` (Stamm, Namen, Schlüssel, Gruppendateien, Läufe, Seite mit
  Fetch-Stub, MCP-Faltung und Mitgliederliste). Angepasst: `tests/bewertung.test.mjs` (FELDER endet jetzt auf `serie`).
- Browser: `npm run build:web` in der Arbeitskopie, dann
  - Vite (Port 4575) mit den Mini-Vorschauen aus dem Hauptordner (Verknüpfung `public/vorschau`): 3D, Icons, Materialien,
    Umgebungen, Gruppe öffnen (Poly Haven, game-icons Delapouite mit 2.022), Zurück, Umschalter, Liste, Suche „paving“
    (einzeln), Link im Detailblatt, hell und dunkel. Keine Konsolenfehler.
  - `wrangler dev` (Port 4576): Seite lädt Gruppendateien, `/mcp` mit `fundus_search` (gefaltet, `group`) und
    `fundus_details`. Vorschaubilder fehlen dort, weil R2 lokal leer ist.

## Für den Orchestrator

- Geänderte Dateien (nur diese gehören zum Branch): `crawler/lib/gruppen.mjs` (neu), `crawler/gruppen-messen.mjs` (neu),
  `crawler/lib/ausgabe.mjs`, `crawler/publish.mjs`, `src/katalog.js`, `src/main.js`, `src/karte.js`, `src/styles.css`,
  `src/symbole.js`, `mcp/src/kern.mjs`, `mcp/src/werkzeuge.mjs`, `tests/gruppen.test.mjs` (neu), `tests/bewertung.test.mjs`,
  dieses Dokument.
- Seite und Worker zusammen deployen. Alter Code mit neuen Daten läuft (Feld wird ignoriert), neuer Code mit alten Daten
  zeigt keine Gruppen.
- Bekannte Fehlerart: Modell- oder Signaturnummern sehen aus wie Zähler (2 von 146). Wenn das stört: Mindestabstand der
  Zähler prüfen oder Gruppen mit nicht fortlaufenden dreistelligen Nummern auslassen.
- Mögliche Erweiterung, nicht gebaut: Emoji-Sets zusätzlich nach Unicode-Gruppe teilen (OpenMoji hat 2.466 Mitglieder).
