# fundus-suche: Trefferquote der Suche (vor allem für KIs über MCP)

Stand 26.11.2026. Lokal fertig, Tests grün (266), gegen den lokalen Worker (Port 4572) und die Seite (Port 4570)
geprüft. Nichts committet, nichts deployt.

## Was sich geändert hat

1. **Rückfall bei wenigen Treffern (nur MCP).** Passen weniger als 3 Einträge auf alle Wörter (nach Art und
   Unterordner), hängt `kern.suchen` Einträge an, die mindestens die Hälfte der Wörter haben (aufgerundet), höchstens
   100. Erreichen weniger als 10 die Hälfte, reicht ein Wort (eine Namensliste wie „press start pixelify silkscreen
   vt323“ fand sonst nichts oder nur einen Namen). Mit Zeilenfiltern (Lizenz, Format, Quelle, Schlagwort, Vorschau)
   hängen die Teiltreffer immer hinten an, denn der Filter kann alle ganzen Treffer verwerfen („calm ambient“ mit
   `license_group: frei` gab „No matches“, obwohl es 3 ganze Treffer gab, alle mit Namensnennung). Reihenfolge: mehr
   passende Wörter zuerst, dann das seltenere Wort (ein Wort mit wenigen Einträgen zählt mehr), dann Titel vor
   Schlagwort vor Beschreibung. Gleich gute Treffer bleiben nach Position zusammen, damit eine Seite in wenigen
   Indexteilen liegt (CPU). Die Antwort sagt es im Kopf („1 match for all words of …, then 100 matching only
   some words“ bzw. „No entry matches all words …“), eine letzte Spalte `missing` nennt die fehlenden Wörter. Der
   Cursor bleibt gültig (eine feste Folge: erst ganze, dann Teiltreffer).
2. **Beschreibung durchsuchbar**, als vierte Gewichtsklasse (0,5, unter Titel 3, Schlagworte 2, Urheber/Formate 1).
   Gefiltert in `beschreibungsWoerter()`: nur lateinische Schrift (chinesische Beschreibungen ergaben sonst lange
   Müllterme), 2 bis 24 Zeichen, keine Zahlen, keine Füllwörter (Englisch und Deutsch), je Eintrag höchstens 60.
   Beschreibungen haben fast nur 3D, Skripte, Skills und Projekte (6.234 Einträge); für Icons und Musik hilft der
   Rückfall, nicht die Beschreibung. Den SKILL.md-Text selbst hat der Katalog nicht, nur dessen Beschreibung.
3. **Artnamen im Index** (Deutsch und Englisch, `ARTNAMEN` in `crawler/publish.mjs`): „pixel heart icon“, „sunset
   hdri“, „pixel font“, „calm music“ passen jetzt auf alle Wörter. Die Zeilen einer Art liegen nebeneinander, ein Name
   kostet in der Kachel wenige Bytes.
4. **Plural und Einzahl** zur Suchzeit (`einzahl()`, englisch: chairs/chair, cats/cat, berries/berry, boxes/box),
   Faktor 0,9 zwischen genau (1) und Wortanfang (0,5). Der Index wächst dadurch nicht.
5. **Kachelbudget in Bytes.** Die Größe zählte Zeichen statt UTF-8-Bytes; `k_.json` (seltene Schriften) lag bei
   74.971 B. Jetzt sind alle Kacheln unter 64 KB.
6. **Werkzeugbeschreibung** von `fundus_search`: welche Felder durchsucht werden, und dass bei weniger als 3 ganzen
   Treffern Teiltreffer mit Spalte `missing` folgen. Hinweis bei null Treffern: Synonym, Englisch oder Deutsch,
   weniger Filter.

## Messungen

**Index** (`public/data/suche`, gleicher Katalog, 59.971 Einträge):

| | Kacheln | Terme | roh | gzip | größte Kachel |
|---|---|---|---|---|---|
| vorher | 89 | 69.135 | 2.862 KB | 1.186 KB | 74.971 B (über 64 KB) |
| nachher | 103 | 74.528 | 3.241 KB | 1.339 KB | 62.428 B |

Eine Suche lädt weiter 1 bis 2 Kacheln je Wort, die einzelne Kachel ist nicht größer geworden.

**CPU einer kalten Suche** (`node mcp/scripts/suche-messen.mjs --daten dist/data`, frischer Kern je Suche, Dateien
im Speicher, ohne `stand.json`, Median aus 7 Läufen, Limit 10; alter Code aus HEAD gegen den alten Index direkt
davor gemessen, weil die Zeiten mit der Last auf dem Rechner um das Doppelte schwanken): Median über 18 Suchen
2,2 ms vorher, 2,4 ms nachher; Maximum 5,4 ms („wooden chair“, 5 Indexteile) vorher, 5,5 ms nachher („pixel coin“
im Rückfall, 8 Indexteile, weil jedes Icon-Set genau eine Münze hat). Suchen mit gleich vielen Dateien kosten
gleich viel; teurer werden nur Suchen, die vorher nichts fanden (0 Dateien) und jetzt Treffer laden. Teuer ist das
Parsen der Indexteile (je etwa 160 KB). Zwei Kniffe halten den Rückfall billig: Kandidaten kommen nur aus den
kleinsten Wortlisten (ein Artname trifft 15.000 Icons und wird nur nachgeschlagen), und Teiltreffer mit denselben
Wörtern und gleicher Klasse bleiben nach Position zusammen („pixel heart icon“: erst 9,3 ms und 7 Teile, jetzt
3,2 ms und 1 Teil).

**Feste Suchen** (Treffer auf alle Wörter, vorher → nachher):

| Suche | vorher | nachher |
|---|---|---|
| pixel heart icon [icon] | 0 | 1 + 100 Teiltreffer |
| pixel heart [icon] | 1 | 1 + 100 Teiltreffer |
| pixel coin [icon] | 2 | 2 + 100 Teiltreffer |
| calm music | 1 | 5 |
| calm piano [musik] | 0 | 0 + 100 Teiltreffer |
| sunset hdri | 69 | 296 |
| wood floor texture | 5 | 127 |
| commit [skill] | 0 | 14 |
| git commit [skill] | 0 | 14 |
| code review [skill] | 39 | 166 |
| chairs [3d] | 30 | 39 |
| cats [bild] | 23 | 69 |

**Eval mit echter KI** (`node mcp/scripts/eval-ki.mjs`, `claude -p` mit Sonnet 5.5, nur der lokale Worker, vier
Aufgaben, je drei Läufe vorher und nachher):

Mittelwerte je Aufgabe (vorher 3 Läufe, nachher 4 mit dem Endstand). „Leer“ = Suchen ohne eine einzige Zeile.

| Aufgabe | Fundus-Aufrufe vorher → nachher | leere Suchen | Antwort (Zeichen) | Werkzeugtext (Zeichen) |
|---|---|---|---|---|
| 1 Pixel-Schrift, Herz, Münze | 5,3 → 4,8 | 0 → 0 | 828 → 893 | 2.762 → 4.565 |
| 2 ruhige freie Musik | 2,7 → 1,3 | 1,0 → 0,3 | 634 → 655 | 3.726 → 1.723 |
| 3 CC0-HDRI Sonnenuntergang, Holzboden | 2,0 → 2,0 | 0 → 0 | 451 → 559 | 1.552 → 1.503 |
| 4 Skill für Git-Commits oder Code-Review | 2,3 → 1,5 | 1,0 → 0 | 384 → 332 | 1.870 → 1.159 |
| **Summe** | **12,3 → 9,6** | **2,0 → 0,3** | 2.297 → 2.439 | 9.910 → 8.950 |

Inhaltlich: Aufgabe 4 fand vorher nie einen Commit-Skill („commit“ in `skill`: 0 Treffer), nachher in jedem Lauf
`git-workflow-and-versioning` (über die Beschreibung). Aufgabe 2 kommt mit einer Suche aus, weil „calm ambient“ mit
`license_group: frei` jetzt die gemeinfreien Ambient-Alben als Teiltreffer zeigt. Aufgabe 1 bleibt teuer, weil die
Daten es nicht hergeben: Es gibt genau ein Pixel-Herz (im Kreis), und Fontsource kennt keine Klasse „pixel“
(Press Start 2P und Silkscreen sind nur „display“), also sucht die KI Schriftnamen aus dem Gedächtnis. Der
Werkzeugtext von Aufgabe 1 wächst, weil „pixel heart“ jetzt Teiltreffer statt einer Zeile liefert.

Zwischenstände (nicht in der Tabelle): Ein erster Nachher-Stand ohne Rückfall bei Zeilenfiltern und ohne
Ein-Wort-Stufe brauchte für Aufgabe 2 im Mittel 4 Aufrufe. Läufe, die das Ratenlimit des Workers trafen (60 je
Minute gilt auch unter `wrangler dev`), zählen nicht; das Skript meldet sie jetzt, zwischen Läufen gut 70 s warten.

## Dateien

| Datei | Änderung |
|---|---|
| `crawler/lib/suchindex.mjs` | vierte Klasse, `beschreibungsWoerter`, `einzahl`, Budget in Bytes, `wortPunkte`, `kartenFuer`, `undVerknuepft`, `teilTreffer`, `kachelnFuerWort`, `kachelnFuerAnfrage`; `suche()` bleibt die UND-Suche mit gleicher Schnittstelle |
| `mcp/src/suchindex.mjs` | Kopie (`npm --prefix mcp run sync`) |
| `crawler/publish.mjs` | `ARTNAMEN`, `suchfelder` mit Artname (Klasse 2) und Beschreibung (Klasse 3) |
| `mcp/src/kern.mjs` | Rückfall in `suchen` (`RUECKFALL_UNTER = 3`), Rückgabe `voll`, `rueckfall`, Zeilen mit `fehlt` |
| `mcp/src/werkzeuge.mjs` | Kopfzeile, Spalte `missing`, Werkzeugbeschreibung |
| `mcp/scripts/eval-ki.mjs` | Eval mit `claude -p` gegen einen laufenden Server |
| `mcp/scripts/suche-messen.mjs` | Trefferzahlen und CPU fester Suchen über einen Datenordner |
| `tests/index.test.mjs`, `tests/mcp.test.mjs` | Beschreibung, Einzahl, Bytebudget, Plural, Teiltreffer, Rückfall mit Cursor, Kopfzeile |

`stand.index.version` bleibt 2: Das Format ist nur erweitert (eine vierte Liste je Term). Alter Code mit neuem Index
übergeht die vierte Liste (`GEWICHTE[3]` fehlt dort, der Vergleich mit `NaN` setzt nie einen Punkt) und findet
Artnamen schon; neuer Code mit altem Index findet einfach keine Beschreibungstreffer.

## Für `src/katalog.js` (nicht geändert, dort arbeitet der Startseiten-Chat)

Die Seite nutzt dieselbe `suche()` und bekommt Beschreibung, Artnamen und Plural ohne Codeänderung (geprüft im
Browser: „pixel heart icon“ 1 statt 0, „git commit“ 23 statt 0, keine Konsolenfehler). Zu übernehmen wäre:

1. `kachelnNoetig` durch `kachelnFuerAnfrage(w.q, k.schluessel)` ersetzen (holt auch die Kachel der Einzahl, wenn
   sie woanders liegt; fehlt sie, wird sie nur übersprungen).
2. Rückfall wie im Kern: `const { ws, karten } = kartenFuer(w.q, k.kacheln, k.schluessel)`, ganze Treffer mit
   `rangfolge(undVerknuepft(karten))`, bei weniger als 3 (nach Art) `teilTreffer(ws, karten, { filter })` anhängen
   und in der Oberfläche als „passt auf einige Wörter“ kennzeichnen (Maske → fehlende Wörter).
3. Achtung Ladevolumen: `sucheLaden` lädt alle Indexteile mit Treffern. Ein Artname allein („icons“, „photo“,
   „music“) trifft jetzt die ganze Art, also so viel wie der Ordner (Icons: 30 Teile). Besser nur die Teile der
   sichtbaren Seite laden, wie `kern.suchen`, oder ein einzelnes Artwort als Ordner öffnen.

## Grenzen

- Plural nur Englisch. Deutsche Plurale (Bäume, Stühle) findet nur der Wortanfang oder die Tippfehlertoleranz.
- Ein Artwort innerhalb derselben Art („icon“ mit `kind: icon`) passt immer und hilft nicht beim Eingrenzen; im
  Rückfall zählt es trotzdem als Wort (kostet nur Nachschlagen).
- Teiltreffer sind auf 100 begrenzt; der Kopf nennt dann 100.
- Schriften tragen keine Stilklasse wie „pixel“ oder „handwriting“ (Fontsource liefert nur display, monospace, …).
  Das zu ergänzen wäre Arbeit am Schrift-Adapter, nicht an der Suche.
- `fundus_search` liefert bei Teiltreffern eine Spalte mehr; der Werkzeugtext wächst dadurch um wenige Zeichen je Zeile.
