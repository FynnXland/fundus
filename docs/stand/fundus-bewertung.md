# fundus-bewertung: Bewertungen, Beliebtheit, empfohlene Sortierung, Skill-Auswahl

Stand 23.11.2026. Code fertig, `npm test` grün, Publish in einen Temp-Ordner geprüft. Nichts committet, kein Crawl gegen
`data/katalog`, kein thumbs-Lauf. **Damit die Seite richtig läuft, muss der Orchestrator `src/main.js` anpassen
(Abschnitt „Was der Orchestrator einbinden muss“); `src/katalog.js` ohne diesen Patch nicht committen**, sonst lädt jeder
Ordner komplett und zeigt zwei Sortierungen ohne Beschriftung.

## Kurz

- Echte Bewertungen (Durchschnitt mit Skala und Stimmenzahl) liefern nur zwei Quellen: **Internet Archive** (Suche) und
  **Blender Extensions** (Listenseiten, nicht die API). Alle anderen liefern höchstens Zählwerte (Beliebtheit).
- Beliebtheit: GitHub-Sterne, Downloads bei Poly Haven, ambientCG, Gazebo Fuel, Internet Archive und Blender. Wird nie in
  Sterne umgerechnet.
- Neue Felder `rating` und `popularity` am Eintrag, `bew`, `pop`, `rang` am Ende der Indexzeile, Anzeige-Vertrag in
  `katalog.js`: `o.bewertung = { sterne, anzahl, quelle }`, `o.beliebtheit = { wert, label }`, dazu `o.rang`.
- Sortierung `empfohlen` (Standard), `bewertung`, `gemischt` bleibt. Der Kopf jeder Art (240 Zeilen) sind jetzt die besten
  240, nicht die ersten der gemischten Reihenfolge.

## Quellen: was liefert welches Feld (geprüft 23.11.2026, alle 25 eingeschalteten Quellen)

Echte Bewertung heißt: Durchschnitt auf einer Skala mit Anzahl Stimmen, von der Quellseite selbst.

| Quelle | Echte Bewertung | Beliebtheit | Beleg |
|---|---|---|---|
| Internet Archive | **ja**, 1 bis 5 Sterne | Downloads | Suchantwort (`advancedsearch.php`, `fl[]=avg_rating&fl[]=num_reviews&fl[]=downloads`): `{"identifier":"EAR020","avg_rating":4.33,"num_reviews":3,"downloads":7527}`. Ohne Stimmen fehlen `avg_rating` und `num_reviews` im Treffer. Kommt mit der Suche, keine Anfrage je Eintrag. Von 584 gespeicherten Einträgen haben 175 eine Bewertung. |
| Blender Extensions | **ja**, 0 bis 5 Sterne | Downloads | Die API v1 hat beides nicht (Felder: id, name, tagline, archive_*, type, license, tags, maintainer …). Die Listenseiten `/add-ons/?page=N` und `/themes/?page=N` (16 Karten je Seite, 78 + 19 Seiten) zeigen je Karte `title="Rated 5.0 out of 5"`, `(176)` Stimmen und `title="114000 downloads"`. Karten ohne Stimmen haben nur Downloads. Siehe „Offene Entscheidung“. |
| GitHub | nein | GitHub-Sterne | `stargazers_count` in jeder Repo-Antwort, auch in der Suche. Bei Skills: Sterne der Sammlung, nicht des einzelnen Skills (siehe unten). |
| Poly Haven | nein | Downloads | `download_count` je Asset in der Listenantwort `api.polyhaven.com/assets?t=models`, z. B. ArmChair_01: 33171. |
| ambientCG | nein | Downloads | `downloadCount` (dazu `downloadCountMonth`, `popularityScore`) in `/api/v2/full_json`, z. B. Concrete049: 30613. |
| Gazebo Fuel | nein | Downloads | `downloads` und `likes` je Modell in der Listenantwort, z. B. Ambulance: downloads 326, likes 0. Likes sind fast überall 0, deshalb Downloads. |
| Godot Asset Library | **nein, Feld ist leer** | nein | `rating` ist in allen 4.721 Assets der Liste `"0"` (alle 10 Seiten zu 500 gelesen, kein Wert ungleich 0), es gibt keine Stimmenzahl. Kein Downloadzähler. |
| OpenGameArt | nein im Feed | nein im Feed | Der Feed (`latest/rss.xml`, die 10 neuesten) hat weder Favoriten noch Sterne. Die Seiten haben beides, aber dafür bräuchte es eine HTML-Anfrage je Eintrag bei Crawl-Delay 10 Sekunden. Nicht umgesetzt. |
| Fontsource | nein | nein in der Liste | `api.fontsource.org/v1/fonts` hat keine Zähler. jsDelivr hat Abrufe je Paket (`data.jsdelivr.com/v1/stats/packages/npm/@fontsource/<id>`), aber eine Anfrage je Schrift (2.000+). Nicht umgesetzt. |
| Openverse | nein | nein | Felder der Antwort: id, title, creator, license, provider, source, category, filesize, tags, … keine Zähler. |
| Wikimedia Commons, Commons Audio, Commons Video | nein | nein | Die Abfragen liefern Metadaten und Lizenzen, keine Zähler. Seitenaufrufe gäbe es nur über eine eigene Statistik-API je Datei. |
| Khronos, Cleveland, Wellcome, Smithsonian | nein | nein | Fixtures und Antworten ohne Zähler oder Bewertungen (`mediaCount` bei Smithsonian ist die Zahl der Medien, keine Beliebtheit). |
| Openclipart (Feed) | nein | nein | Atom-Feed hat Autor, Tags, Zusammenfassung. |
| Iconify, OpenMoji, Twemoji, Noto Emoji, Fluent Emoji, game-icons, Streamline | nein | nein | Einträge sind Icons oder Sets aus einem Repo. Die Sterne dieses Repos gehören allen Icons gleich und sagen über das einzelne Icon nichts, deshalb nicht übernommen. |

### Offene Entscheidung für Fynn: Blender

Die Bewertungen von Blender stehen nur auf den HTML-Listenseiten. `blender.mjs` liest sie jetzt mit (97 zusätzliche
Anfragen, 2 Sekunden Abstand, dazu die eine API-Anfrage wie bisher). robots.txt erlaubt `/` für alle (Content-Signal
`search=yes, ai-train=no, use=reference`; wir bauen einen Suchkatalog und zeigen die Zahl mit Verweis, wir trainieren nichts).
Die Terms of Service binden laut Kopf von `blender.mjs` nur Uploader. Wenn Fynn das nicht will: in `config.json`
`"blender": { "bewertungen": false }`, dann bleibt der Adapter wie vorher. Der Parser hängt am Markup der Karten
(`cards-item`, `Rated x out of 5`, `(n)`); ändert sich das, finden `parseCards` keine Karten, die Einträge bleiben ohne
Bewertung (der Crawl bricht nicht ab, das Log sagt „0 Karten gelesen“).

## Schema (`crawler/lib/schema.mjs`, `crawler/lib/bewertung.mjs`)

```js
rating:     { value, min, max, count, source: { name, url } }   // optional
popularity: { value, label, source: { name, url } }             // optional, label: 'GitHub-Sterne' | 'Downloads' | 'Favoriten' | 'Likes'
```

- Fünf-Sterne-Zahl: `5 * value / max`, gerundet auf 2 Stellen (`sterne5()`). `min` wird nicht verwendet (bei Internet Archive
  ist es 1, bei Blender 0). Keine Bewertung bei `count` 0, kein Wert außerhalb der Skala.
- `validateItem` prüft beide Felder nur, wenn sie da sind (`pruefeBewertung`): Stimmenzahl ganzzahlig und über 0, Wert auf der
  Skala, `source.name` und `source.url` (http/https), Label aus der Liste, Beliebtheit über 0.
- `makeItem` reicht `raw.rating` und `raw.popularity` durch (Änderung in `crawler/lib/item.mjs`, nicht auf der Liste der
  Dateien, aber ohne sie kommt nichts an). Hilfen: `bewertung({...})` und `beliebtheit({...})` bauen die Objekte und
  liefern `undefined`, wenn die Quelle nichts Brauchbares hat.
- Die vollständigen Einträge in `karten/<xx>.json` tragen `rating` und `popularity` unverändert (Detailansicht, `bewertungAusEintrag` in `src/util.js` passt dazu).

## Indexzeile und Vertrag für die Anzeige

`FELDER` in `crawler/publish.mjs` hat drei neue Felder **ganz am Ende** (alte Reihenfolge unverändert, der MCP-Server liest
nach Feldnamen, `tests/mcp.test.mjs` ist grün):

| Feld | Inhalt |
|---|---|
| `bew` | `[sterne5, anzahl, quellname]` oder `null`, z. B. `[4.33, 3, "Internet Archive"]` |
| `pop` | `[wert, label]` oder `null`, z. B. `[33171, "Downloads"]` |
| `rang` | Ganzzahl, Rangwert der Sortierung `empfohlen`, 0 ohne Bewertung und Beliebtheit |

Abweichung von „oder fehlend“: Reihen haben feste Länge, fehlend heißt `null` (bei `rang` 0). Das ist der Preis der festen Feldliste.
`rang` kam zu den zwei verlangten Feldern dazu, weil der Browser sonst nicht sortieren kann (die Normalisierung je Quelle
braucht alle Einträge und läuft beim Veröffentlichen).

`src/katalog.js` macht daraus (die Rohfelder `bew` und `pop` werden entfernt):

```js
o.bewertung  = { sterne, anzahl, quelle }   // oder undefined
o.beliebtheit = { wert, label }              // oder undefined
o.rang       = Zahl
```

Das Feld `quelle` heißt hier der Name der Quelle, die die Bewertung zeigt. Bei Beliebtheit gibt es keinen Quellnamen in der
Zeile; er ist immer der Name der Quelle des Eintrags (`o.quellname`), `beliebtheitHtml` in `src/util.js` erwartet `p.quelle`:
dort `o.quellname` mitgeben. Bei Skills sind die Sterne die der Sammlung (`o.sammlung`): der Tooltip muss „GitHub-Sterne der
Sammlung“ sagen, sonst stimmt er nicht.

Außerdem neu in `src/katalog.js`: `STANDARD_SORT = 'empfohlen'` und `SORTIERUNGEN = { empfohlen, bewertung, gemischt, neu, name, quelle }`
(`bewertung`: „Beste Bewertung“). `stand.json` hat neu `mitBewertung` und `mitBeliebtheit`, je Art die Zahl der Einträge.

## Rangformel (`rangwerte()` in `crawler/lib/bewertung.mjs`)

Ein Wert je Eintrag, berechnet beim Veröffentlichen:

```
bewertet     20000 + 9999 * bayes / 5
beliebt      10000 + 9999 * min(1, ln(1 + wert) / ln(1 + p99))
sonst        0   (bleibt in der gemischten Reihenfolge, Gleichstand entscheidet die Kennnummer)
```

- **Bayes-Mittel** `bayes = (C * m + n * s) / (C + n)`; `s` = Sterne des Eintrags (0 bis 5), `n` = Stimmen, `m` = Mittel aller
  bewerteten Einträge **derselben Quelle** (mindestens 20, sonst alle Quellen, sonst 3,5), `C = 5`.
  Begründung mit den echten Zahlen (584 Internet-Archive-Einträge, 175 bewertet): Mittel 4,25 Sterne; 65 haben 1 Stimme,
  49 haben 2, 45 haben 3 bis 4, 16 haben 5 bis 19, keiner mehr. Mit `C = 5` landet eine einzelne Fünf bei
  (5 · 4,25 + 5) / 6 = 4,38, vier Stimmen mit 4,8 bei 4,50, tausend Stimmen mit 4,8 bei 4,80. 5,0 bei einer Stimme steht
  also nicht vor 4,8 bei 1.000, und die meisten Einträge (bis 4 Stimmen) werden spürbar zum Mittel gezogen, weil ihre Stimmen
  wenig wiegen. Ein kleineres `C` (2) ließe eine einzelne Fünf schon bei 4,50 stehen, ein größeres (10) würde
  bei den heutigen Zahlen fast alles bei 4,3 zusammendrücken (eine Fünf: 4,32). Der Parameter ist `BAYES_GEWICHT`.
- **Bewertet vor beliebt vor nichts**, wie der Besitzer es wollte. Folge: jeder Eintrag mit auch nur einer schlechten Bewertung
  (Bayes ab 0) steht vor jedem Eintrag ohne Bewertung, auch vor einem mit einer Million Downloads. Heute bewertet nur Internet Archive
  (Musik) und Blender (Skripte) so, die Wirkung ist auf diese Arten begrenzt.
- **Beliebtheit** logarithmisch, je **Quelle und Art** durch das 99. Perzentil geteilt (ein einzelner Ausreißer mit 11 Millionen
  Abrufen drückt sonst alle anderen auf null) und bei 1 gekappt. So haben 200.000 GitHub-Sterne und 30.000 Poly-Haven-Downloads
  beide den Höchstwert ihrer Gruppe. Gruppen mit weniger als 20 Werten (z. B. ein paar GitHub-Sound-Repos) nehmen das
  Perzentil der ganzen Quelle, sonst aller Zahlen; sonst bekäme jede winzige Gruppe mit einem Eintrag die Höchstnote.
- Gleichstände (alle Skills einer Sammlung haben dieselben Sterne): gemischte Reihenfolge.

### Ordnung der Dateien

- `index/<art>/kopf.json`: die 240 Zeilen mit dem höchsten `rang` (Gleichstand: gemischt). Ein Ordner zeigt sofort das Beste.
- `index/<art>/<nn>.json` bleiben nach Unterordner, Schlagworten, Mischwert geordnet (so braucht eine Suche wenig Teile, Messung im
  Kopf von `ausgabe.mjs`). Ein Unterordner lädt alle seine Teile und sortiert im Browser nach `rang`.
- `start.json`: je Art zuerst die Einträge mit Bild oder Text, darunter die mit dem höchsten `rang`, dann reihum über die Arten.
- „Alle Objekte“ (Wurzel, wenn alles geladen ist): die Arten werden **nach Platz gemischt** (jeweils der Beste jeder Art, dann der
  Zweitbeste …), nicht nach `rang` quer über die Arten, denn `rang` gilt nur innerhalb einer Art (Bilder, Icons, Schriften haben keinen).
- `bedarf()`: `empfohlen` (und keine Angabe) braucht nur den Kopf. `bewertung`, `gemischt`, `neu`, `name`, `quelle` brauchen den ganzen Ordner.
- `bewertung` („Beste Bewertung“): erst alle mit Bewertung nach Rang (Bayes), dann der Rest in gemischter Reihenfolge, ohne Beliebtheitsstufe.
- Suchtreffer bleiben nach Relevanz, solange die Sortierung `empfohlen` steht.

## Adapter (was sich geändert hat)

| Datei | Änderung |
|---|---|
| `crawler/sources/internetarchive.mjs` | `fl[]` der Suche um `avg_rating`, `num_reviews`, `downloads` erweitert; `parseItem(data, { kind, stats })`, `stats` = der Suchtreffer; neu `bewertungVon()` |
| `crawler/sources/blender.mjs` | liest zusätzlich die Listenseiten (`parseCards`, `mitKarten`); abschaltbar mit `bewertungen: false` |
| `crawler/sources/github.mjs` | `popularity` für Projekte, Skripte, Asset-Repos und Skills; Skill-Auswahl nach Sternen (`waehleSkillRepos`); `tree.truncated` wird gemeldet; neu `skillAusschliessen` |
| `crawler/sources/polyhaven.mjs`, `fuel.mjs` | `popularity` Downloads aus der Liste |
| `crawler/sources/ambientcg.mjs` | `popularity` Downloads (**nicht auf der Liste der mir gehörenden Dateien**, die Zeile ist klein, ohne sie fehlt eine Quelle) |
| `crawler/lib/item.mjs` | reicht `rating` und `popularity` durch (ebenfalls nicht auf der Liste) |
| `crawler/bewertungen-nachtragen.mjs` (neu) | siehe nächster Abschnitt |
| `tests/fixtures/` | `internetarchive-bewertung.json`, `blender-liste.html` neu; `ambientcg-asset.json` um `downloadCount` ergänzt |

### Vorhandene Einträge nachziehen (ohne Crawl)

Einträge, die schon im Katalog stehen, haben die Felder erst nach einem erneuten Abruf. Je Quelle:

| Quelle | Weg |
|---|---|
| GitHub, Poly Haven, ambientCG, Blender | ein normaler `node crawler/crawl.mjs --quelle github,polyhaven,ambientcg,blender` (liest die ganze Liste, ersetzt die Einträge) |
| Internet Archive | arbeitet in Etappen über Wochen und besucht einen Eintrag nie zweimal. `node crawler/bewertungen-nachtragen.mjs --quelle internetarchive` holt Bewertung und Downloads für alle gespeicherten Einträge (50 Kennungen je Anfrage, 15 Anfragen für 584 Einträge, eine pro Sekunde) und schreibt `data/katalog/internetarchive.json` **an Ort und Stelle** zurück (`--von`/`--nach` für andere Dateien, `--probe 100` schreibt nichts). Neu gecrawlte Einträge bringen die Werte selbst mit. Bewertungen ändern sich: der Lauf ist auch der Weg, sie später aufzufrischen. |
| Gazebo Fuel | läuft in einem 14-Tage-Zyklus. `node crawler/bewertungen-nachtragen.mjs --quelle fuel` setzt die Downloads sofort aus `meta.abrufe` (offline) |

## Probe

`npm test`: 246 Tests grün (21 neue in `tests/bewertung.test.mjs`; `tests/index.test.mjs` angepasst: „Alle Ordner mit Rückruf“
prüft jetzt die Mischung nach Platz). `node --test tests/mcp.test.mjs`: 23 grün.
Publish in einen Temp-Ordner (Kopie von `internetarchive`, `github`, `polyhaven`, `fuel`, `ambientcg`, `openverse` aus
`data/katalog`, Internet Archive mit dem Nachtrags-Skript angereichert, Beliebtheit der anderen aus `meta` und der
Poly-Haven-Liste nachgezogen, `cwd` im Temp-Ordner, `--ziel` dort; `data/katalog` selbst blieb unberührt, ebenso `config.json`): `stand.json` zeigt `mitBewertung: { musik: 174 }`,
`mitBeliebtheit: { 3d: 3164, textur: 871, hdri: 999, musik: 381, sound: 198, skript: 198, projekt: 292, skill: 1081 }` (die Beliebtheit der Skills dort aus den Sternen meiner Suche je Sammlung); der Kopf von
`musik` beginnt mit „The Four Seasons (Vivaldi)“ `[5, 8, "Internet Archive"]`, `rang` 29427, danach Einträge mit
5 Sternen bei 5 und 4 Stimmen.

## Was der Orchestrator einbinden muss

1. **`src/main.js`** (sonst läuft die Seite mit dem neuen `katalog.js` schlecht):
   - Zeile 19: `sort: 'gemischt'` → `sort: STANDARD_SORT` (Import aus `./katalog.js`).
   - Zeile 92: `params.get('sort') ?? 'gemischt'` → `params.get('sort') ?? STANDARD_SORT`.
   - Zeile 151: `SORT_TEXT` um `empfohlen: 'Empfohlen'` und `bewertung: 'Beste Bewertung'` ergänzen.
   - Zeile 251: `: 'gemischt'` → `: STANDARD_SORT`.
   - Zeile 269: `!(k === 'sort' && v === 'gemischt')` → `!(k === 'sort' && v === STANDARD_SORT)` (der Standard bleibt aus der Adresse).
   - Wer `sort=gemischt` in der Adresse hat, bekommt den ganzen Ordner geladen (richtig, aber langsamer).
2. **Anzeige:** `o.bewertung` und `o.beliebtheit` wie oben. Bei Beliebtheit `quelle: o.quellname`, bei Skills im Tooltip „der Sammlung“.
3. **`crawler/config.json`:** Vorschlag unten für GitHub; für Blender nichts nötig (Standard an).
4. **Crawl** (wenn Fynn es will): `--quelle github,polyhaven,ambientcg,blender`, dann die zwei Nachtragsläufe, dann `node crawler/publish.mjs`.
5. **`GITHUB_TOKEN`** (To-do `fundus:api-schluessel`): ohne Token reichen 60 Kernanfragen pro Stunde nicht (siehe unten).
6. **Folge für `crawler/lib/dedupe.mjs` (`inhaltsDubletten`):** bei gleichem Skill in mehreren Sammlungen gewinnt heute der erste
   Eintrag (alle `github`, gleicher Rang). Besser: die Sammlung mit den meisten Sternen (`popularity.value`) als Sieger.
7. `docs/RECHT.md`: eine Zeile zu den Blender-Listenseiten (siehe „Offene Entscheidung“).

## Teil A: Skills von GitHub

Heute 1.219 Skills in 33 Sammlungen. Es fehlten gerade die meistbesternten: obra/superpowers (324.770 Sterne),
DietrichGebert/ponytail (197.351), Leonxlnx/taste-skill (120.508), addyosmani/agent-skills (119.932), pbakaus/impeccable (115.436),
mvanhorn/last30days-skill, blader/humanizer, diagram-design, emilkowalski/skills. Ursache in `github.mjs`: `chosen` schnitt die
Sammlungen in der Reihenfolge ab, in der die Suchen sie lieferten (die ersten 40 der ersten Suchen), nicht nach Sternen. Behoben:
`waehleSkillRepos()` nimmt zuerst `skillRepos` (genannte Sammlungen), dann die gefundenen nach Sternen absteigend (höchstens
`skillReposMax`) und lässt `skillAusschliessen` aus der Suche heraus. Außerdem meldet der Adapter jetzt `tree.truncated`.

### Wie ermittelt (23.11.2026, ohne Token)

1. Repository-Suche, nach Sternen sortiert (10 Anfragen): `topic:claude-skills` (17.492 Treffer), `agent-skills` (46.998),
   `claude-code-skills`, `anthropic-skills`, `claude-skill`, `agent-skill`, `skill-md`, `skills` + `claude-code`, „awesome claude skills“,
   „SKILL.md“ in der README. 248 verschiedene Repos (ohne Forks und Archivierte), darunter viele Apps, die nur „skills“ im Thema führen.
2. Für 64 Repos ab 8.000 Sternen mit Whitelist-Lizenz (dazu anthropics/skills, trailofbits/skills und ComposioHQ/awesome-claude-skills) den Git-Baum gelesen (zählt die `SKILL.md`; die Lizenz kam als `license.spdx_id` aus der Suche).
3. Awesome-Listen: die README von acht Listen gelesen (VoltAgent/awesome-agent-skills 379 Links, hesreallyhim/awesome-claude-code 240,
   heilcheng 230, BehiSecc 217, ComposioHQ 37, travisvn 19 …): 898 verschiedene Repos. Für die 34 Repos, die in mindestens zwei
   Listen stehen und deren Sterne ich noch abfragen konnte (dann stoppte das Suchlimit), ist keines über 8.400 Sterne; das größte ist
   trailofbits/skills (8.366, CC BY-SA 4.0, 99 Skills), es steht in der Tabelle. Die Listen verlinken die lange Schleppe, nicht die
   Spitze; die Spitze steht schon in der Suche.

### Vorschlag für `skillRepos` (44 Sammlungen, höchstens 1.605 Skills)

Auswahlkriterium: Das Repo ist in erster Linie eine Skill-Sammlung oder ein einzelner Skill (Zweck des Repos), die Lizenz steht auf der
Whitelist, es ist nicht archiviert und kein Fork. Sterne vom 23.11.2026, „Skills“ = gefundene `SKILL.md`. Der Adapter nimmt je Repo
höchstens `skillsProRepo`; gleicher Text unter `.agents/skills` und `.claude/skills` wird beim Veröffentlichen über die Prüfsumme
zusammengeführt.

| Repo | Sterne | Skills | Lizenz | Katalog |
|---|---|---|---|---|
| obra/superpowers | 324.770 | 15 | MIT | neu |
| anthropics/skills | 199.317 | 20 | je Skill | schon drin |
| DietrichGebert/ponytail | 197.351 | 12 | MIT | neu |
| Leonxlnx/taste-skill | 120.508 | 1 | MIT | neu |
| addyosmani/agent-skills | 119.932 | 26 | MIT | neu |
| pbakaus/impeccable | 115.436 | 26 | Apache-2.0 | neu |
| tt-a1i/archify | 99.020 | 6 | Apache-2.0 | schon drin |
| mvanhorn/last30days-skill | 73.232 | 1 | MIT | neu |
| blader/humanizer | 72.636 | 1 | MIT | neu |
| cathrynlavery/diagram-design | 70.771 | 1 | MIT | neu |
| coreyhaines31/marketingskills | 62.188 | 53 | MIT | schon drin |
| ayghri/i-have-adhd | 62.040 | 2 | MIT | schon drin |
| emilkowalski/skills | 59.024 | 20 | MIT | neu |
| K-Dense-AI/scientific-agent-skills | 58.204 | 177 | MIT | schon drin |
| obsidianmd/obsidian-skills | 53.537 | 7 | MIT | schon drin |
| wshobson/agents | 42.833 | 185 | MIT | schon drin |
| alchaincyf/nuwa-skill | 38.883 | 16 | MIT | schon drin |
| virgiliojr94/book-to-skill | 38.838 | 1 | MIT | neu |
| zarazhangrui/frontend-slides | 32.812 | 2 | MIT | neu |
| alchaincyf/huashu-design | 30.649 | 1 | MIT | neu |
| op7418/guizang-ppt-skill | 30.311 | 1 | AGPL-3.0 | neu |
| alirezarezvani/claude-skills | 30.332 | 501 (Deckel 200) | MIT | schon drin |
| wheresryan22/anatomy | 28.850 | 1 | MIT | neu |
| OthmanAdi/planning-with-files | 28.206 | 18 | MIT | schon drin |
| JimLiu/baoyu-skills | 27.826 | 23 | MIT | schon drin |
| titanwings/distilly | 26.802 | 1 | MIT | neu |
| KKKKhazix/khazix-skills | 22.480 | 6 | MIT | neu |
| google/elephant-goldfish-model | 22.343 | 8 | Apache-2.0 | schon drin |
| latent-spaces/brag | 22.326 | 2 | MIT | schon drin |
| Vincentwei1021/video-shotcraft | 22.241 | 1 | Apache-2.0 | neu |
| wanshuiyin/Auto-claude-code-research-in-sleep | 19.651 | 197 | MIT | neu |
| elementalsouls/Claude-BugHunter | 19.147 | 83 | MIT | schon drin |
| nidhinjs/prompt-master | 16.259 | 1 | MIT | schon drin |
| yusufkaraaslan/Skill_Seekers | 15.361 | 26 | MIT | schon drin |
| Orchestra-Research/AI-Research-SKILLs | 14.769 | 98 | MIT | schon drin |
| Jeffallan/claude-skills | 12.498 | 70 | MIT | schon drin |
| SnailSploit/Claude-Red | 11.430 | 79 | MIT | schon drin |
| chuspeeism/dashi-ppt-skill | 11.027 | 1 | AGPL-3.0 | neu |
| alchaincyf/zhangxuefeng-skill | 10.815 | 1 | MIT | schon drin |
| gamedev-skills/awesome-gamedev-agent-skills | 10.545 | 80 | Apache-2.0 | neu |
| zenstory-ai/oh-story-claudecode | 8.850 | 14 | MIT | schon drin |
| jnMetaCode/superpowers-zh | 8.585 | 21 | MIT | neu |
| op7418/guizang-social-card-skill | 8.231 | 1 | AGPL-3.0 | neu |
| trailofbits/skills | 8.366 | 99 | CC-BY-SA-4.0 | neu |

Lizenz-Hinweise: anthropics/skills hat keine Lizenz am Repo; der Adapter liest die `LICENSE.txt` je Skill-Ordner. Die
Dokument-Skills (docx, pdf, pptx, xlsx) haben eine eigene, nicht offene Lizenz und fallen weg (heute 16 von 20 drin). Die AGPL-3.0-Repos
(guizang-ppt-skill, dashi-ppt-skill, guizang-social-card-skill) stehen auf der Whitelist, trailofbits/skills ist CC BY-SA 4.0.

**Bewusst nicht in der Liste** (`skillAusschliessen`, damit sie nicht über die Suche hereinkommen):
- Apps mit ein paar Entwickler-Skills im Repo: morluto/rea (475.161 Sterne, 6 Skills), paperclipai/paperclip, nexu-io/open-design,
  career-ops-hq/career-ops, CherryHQ/cherry-studio, reactive-resume/reactive-resume, alibaba/open-code-review, zhayujie/CowAgent,
  nanocoai/nanoclaw, heygen-com/hyperframes, Egonex-AI/Understand-Anything, guillaumemeyer/watermarks-remover,
  teng-lin/notebooklm-py, thedotmack/claude-mem. Die Sterne gehören der App; ohne diese Regel stünden ihre Skills wegen dieser
  Sterne ganz oben im Skill-Ordner (die Sterne eines Skills sind die der ganzen Sammlung, siehe unten). Im Test mit der alten
  Auswahl stellte paperclip (83 Skills) 77 der 240 Zeilen im Skill-Kopf.
- Riesige Sammelbecken, bei denen der Deckel `skillsProRepo` nach Pfad schneidet statt nach Güte: affaan-m/ECC (309.367 Sterne, 1.089
  `SKILL.md`, darunter Spiegelordner wie `.agents/skills`), sickn33/agentic-awesome-skills (50.196, **10.020**), davila7/claude-code-templates (923),
  github/awesome-copilot (482, für Copilot), anthropics/claude-plugins-official (57, Plugins von Dritten).
- Lizenz nicht erkennbar oder nicht auf der Whitelist (bleiben draußen, wie vorgegeben): ComposioHQ/awesome-claude-skills (80.137 Sterne,
  keine Lizenz am Repo; 864 `SKILL.md`, davon nur 13 Ordner mit eigener `LICENSE.txt`, das sind Kopien aus anthropics/skills),
  hesreallyhim/awesome-claude-code (NOASSERTION), travisvn/awesome-claude-skills und BehiSecc/awesome-claude-skills (keine Lizenz, Listen),
  deanpeters/Product-Manager-Skills (NOASSERTION), code-yeongyu/oh-my-openagent und mksglu/context-mode (NOASSERTION).
- Nur Listen ohne `SKILL.md`: VoltAgent/awesome-agent-skills (37.476 Sterne) und VoltAgent/awesome-openclaw-skills (53.951), je 0 Skills.

### Vorschlag für `crawler/config.json`, Abschnitt `github`

Nur diese Schlüssel ersetzen, `projekte`, `skripte`, `weitere` bleiben:

```json
{
  "skillSuchen": [
    "topic:claude-skills stars:>1000",
    "topic:agent-skills stars:>1000",
    "topic:claude-code-skills stars:>500",
    "topic:anthropic-skills stars:>200",
    "topic:claude-skill stars:>300"
  ],
  "skillRepos": [
    "obra/superpowers",
    "anthropics/skills",
    "DietrichGebert/ponytail",
    "Leonxlnx/taste-skill",
    "addyosmani/agent-skills",
    "pbakaus/impeccable",
    "tt-a1i/archify",
    "mvanhorn/last30days-skill",
    "blader/humanizer",
    "cathrynlavery/diagram-design",
    "coreyhaines31/marketingskills",
    "ayghri/i-have-adhd",
    "emilkowalski/skills",
    "K-Dense-AI/scientific-agent-skills",
    "obsidianmd/obsidian-skills",
    "wshobson/agents",
    "alchaincyf/nuwa-skill",
    "virgiliojr94/book-to-skill",
    "zarazhangrui/frontend-slides",
    "alchaincyf/huashu-design",
    "op7418/guizang-ppt-skill",
    "alirezarezvani/claude-skills",
    "wheresryan22/anatomy",
    "OthmanAdi/planning-with-files",
    "JimLiu/baoyu-skills",
    "titanwings/distilly",
    "KKKKhazix/khazix-skills",
    "google/elephant-goldfish-model",
    "latent-spaces/brag",
    "Vincentwei1021/video-shotcraft",
    "wanshuiyin/Auto-claude-code-research-in-sleep",
    "elementalsouls/Claude-BugHunter",
    "nidhinjs/prompt-master",
    "yusufkaraaslan/Skill_Seekers",
    "Orchestra-Research/AI-Research-SKILLs",
    "Jeffallan/claude-skills",
    "SnailSploit/Claude-Red",
    "chuspeeism/dashi-ppt-skill",
    "alchaincyf/zhangxuefeng-skill",
    "gamedev-skills/awesome-gamedev-agent-skills",
    "zenstory-ai/oh-story-claudecode",
    "jnMetaCode/superpowers-zh",
    "op7418/guizang-social-card-skill",
    "trailofbits/skills"
  ],
  "skillAusschliessen": [
    "affaan-m/ECC",
    "sickn33/agentic-awesome-skills",
    "davila7/claude-code-templates",
    "github/awesome-copilot",
    "nexu-io/open-design",
    "morluto/rea",
    "paperclipai/paperclip",
    "career-ops-hq/career-ops",
    "CherryHQ/cherry-studio",
    "reactive-resume/reactive-resume",
    "alibaba/open-code-review",
    "zhayujie/CowAgent",
    "nanocoai/nanoclaw",
    "heygen-com/hyperframes",
    "Egonex-AI/Understand-Anything",
    "guillaumemeyer/watermarks-remover",
    "teng-lin/notebooklm-py",
    "anthropics/claude-plugins-official",
    "thedotmack/claude-mem"
  ],
  "proSuche": 50,
  "skillsProRepo": 200,
  "skillReposMax": 15
}
```

- `skillsProRepo` 120 → 200: K-Dense (177), wshobson/agents (185) und Auto-claude-code-research-in-sleep (197) werden sonst
  bei 120 nach Pfadreihenfolge abgeschnitten; alirezarezvani/claude-skills (501) bleibt gedeckelt.
- `skillSuchen` mit Mindeststernen, damit die Suche nur große Treffer liefert; `skillReposMax` 40 → 15 (die Plätze, die die Suche nach
  Sternen neben den 44 genannten bekommt; jeder gefundene Treffer kostet eine Baumabfrage).
- **Kosten:** Jede genannte Sammlung braucht 2 Kernanfragen (`/repos/<name>` und den Baum), jede gefundene 1, dazu die Suche
  (eigenes Limit, 10 je Minute). Das sind rund 90 bis 105 Kernanfragen. **Ohne `GITHUB_TOKEN` (60 je Stunde) bricht der Lauf
  nach rund 55 ab**: Der Adapter wartet nur, wenn das Limit in höchstens 70 Sekunden zurückkommt, sonst werden weitere Repos
  übersprungen (steht im Log). Mit Token (5.000 je Stunde) kein Problem; das To-do `fundus:api-schluessel` ist dafür Voraussetzung.
  Die Skill-Dateien kommen von `raw.githubusercontent.com` (anderes Limit, 150 ms Abstand): rund 1.600 Anfragen, 4 bis 5 Minuten.
- Skills, die heute im Katalog stehen und nicht mehr geliefert werden, bleiben (`merge` in `crawl.mjs` löscht nichts).

### Sterne bei Skills

Ein Skill hat keine eigenen Sterne. `popularity` eines Skills sind die Sterne der Sammlung, in der er liegt (`popularity.source.url`
ist das Repo). Alle Skills einer Sammlung haben darum denselben Rangwert, innerhalb gilt die gemischte Reihenfolge. Die Anzeige
muss sagen, dass es die Sterne der Sammlung sind.

