# Stand der Steuerzentrale (Orchestrator)

Zuletzt aktualisiert: 23.11.2026, mittags (nach Limit-Pause). Dieser Chat steuert mehrere Unterchats; diese Datei reicht, um ohne den
alten Verlauf weiterzumachen. Die Unterchats führen je eine eigene Datei in diesem Ordner (`docs/stand/<name>.md`).

## Projekt in drei Sätzen

Fundus ist ein Katalog freier Assets (`README.md`, `DESIGN.md`, `docs/RECHT.md`, `CLAUDE.md`): Node-Crawler holt
Metadaten aus offenen Quellen, die statische Vite-Seite zeigt sie. Dateien bleiben bei der Quelle; einzige Ausnahme sind
eigene Mini-Vorschaubilder (320 px). Ziel des Besitzers (Fynn): Katalog so groß wie möglich, alle Asset-Arten,
besonders Musik und Sounds.

## Entscheidungen des Besitzers (nicht neu verhandeln)

- Design: modern, schlank, rund, Claude-Farben. Karteikarten und Retro-Rechner wurden verworfen.
  Design-System in Claude Design: https://claude.ai/artifact/PbB1SVi6UF7Svba5Hn8fc9 (aus `src/styles.css` abgeleitet).
- Kein Proxy für Dateien; eigene Mini-Vorschaubilder ja.
- Schalter „Vorschauen von Quellen“: lädt große Vorschauen, Hörproben, 3D-Ansicht und für Objekte ohne eigenes
  Vorschaubild ein kleines Bild der Quelle, jeweils erst kurz bevor die Karte sichtbar wird; 3D im Raster nur als Bild.
- Dieser Chat orchestriert; neue Arbeitspakete laufen als echte Unterchats (nicht als Hilfsagenten).

## Unterchats (alle im selben Ordner, committen nicht selbst, feste Dateizuständigkeiten)

| Name | Session-ID | Auftrag | darf ändern |
|---|---|---|---|
| fundus-index | local_0eccb925-dcf6-41cc-9bf3-ae2ba6ebce72 | Index für 100.000+ Einträge aufteilen, schlanke Suche | `crawler/publish.mjs` (Ausgabeteil, `FELDER`/`zeile`), `src/katalog.js`, eigene neue `crawler/lib/*`, `tests/index.test.mjs` |
| fundus-arten | local_c3b5337d-7203-4c40-ac5a-a0a3db328176 | neue Asset-Arten (Video, Pinsel, Paletten, LUTs, Shader …) | `crawler/lib/schema.mjs` (KINDS ergänzen), `crawler/lib/taxonomy.mjs`, `src/symbole.js` (ergänzen), eigene Adapter, `tests/adapters-arten.test.mjs` |
| fundus-audio | local_5e1212c6-cd93-4413-a157-b2d8fab39af5 | Musik und Sounds (Commons-Audio, Internet Archive in Etappen, Incompetech, FreePD …) | `crawler/sources/internetarchive.mjs`, eigene Adapter (Kürzel A1–A9), `tests/adapters-audio.test.mjs` |
| fundus-2d | local_45c1eeb9-00a8-4018-8d4c-03d3c2faec1a | 2D-Grafik, Spiele-Assets, Code (Kenney, OpenGameArt, Openclipart, Godot, Blender …) | eigene Adapter (Kürzel B1–B9), `tests/adapters-2d.test.mjs` |
| fundus-bilder | local_bb5076b3-2542-44ae-8eb6-dec1c7ffb5c4 | Bilder, Materialien, 3D (Commons in Etappen, Museen, Texturen) | `crawler/sources/wikimedia.mjs`, eigene Adapter (Kürzel C1–C9), `tests/adapters-bilder.test.mjs` |

Nur der Orchestrator ändert: `crawler/sources/index.mjs`, `crawler/config.json`, `src/main.js`, `src/karte.js`,
`src/styles.css`, `src/seiten.js` (Datenschutz-Hosts in `VORSCHAU_HOSTS`), `crawler/crawl.mjs`, `crawler/thumbs.mjs`,
`crawler/check-links.mjs`, `crawler/lib/store.mjs`, `crawler/lib/dedupe.mjs`, Doku.

Seit 23.11. mittags laufen alle fünf Unterchats auf Sonnet 5.5 (Wunsch des Besitzers: Unterchats günstiger, Haiku
nur für wirklich einfache Aufgaben). Bis dahin hatte keiner eine Stand-Datei geschrieben.

Hinweis: Die drei Quellen-Pakete liefen vorher als Hilfsagenten mit Fable und sind am Fable-Limit abgebrochen, ohne
Dateien zu hinterlassen. Sie wurden als Unterchats mit Opus neu gestartet.

## Einbindung 23.11.2026 nachmittags (Orchestrator)

Alle fünf Unterchats sind fertig (Stand-Dateien `docs/stand/fundus-*.md`). Eingebunden:
- `crawler/sources/index.mjs`: commonsaudio, wikimediavideo, khronos, cleveland, wellcome, blender, godot, opengameart,
  openclipart (Feed). Zurückgehalten mit Begründung im Kopf der Datei und in `docs/RECHT.md`: rijksmuseum, europeana, nga,
  godotshaders, smk. To-do für Fynn: `fundus:quellen-entscheiden`.
- `crawler/lib/dedupe.mjs` `QUELLRANG`: alle direkten Quellen eingetragen (vorher hätte Openverse jede neue Quelle
  geschlagen, weil Unbekannte Rang 50 bekamen). Museen stehen jetzt vor Commons.
- `crawler/config.json`: Einträge laut Stand-Dateien; `wikimedia` jetzt mit `gruppen` (inkl. Quality images, Clipart,
  Texturen, 3D).
- OGA-BY 3.0/4.0 in `crawler/lib/licenses.mjs` (Lizenztext gelesen), bei Gleichstand gewinnt CC BY.
- Quellnamen: „Wikimedia Commons (Audio)“ und „(Video)“, damit der Quellenfilter sie unterscheidet.
- `src/seiten.js`: Hosts der eingeschalteten Quellen in `VORSCHAU_HOSTS`; `melden` liest jetzt Indexzeilen (Absturz mit `?id=` behoben).
- `src/main.js`: Patch aus fundus-index (`beimNachladen`, Gesamtzahl aus `stand.perKind` während ein Ordner lädt).
- `crawler/thumbs.mjs`: Accept-Header mit `*/*` (Openverse antwortete sonst 406), opengameart.org 10 s Abstand.
- Probelauf aller zehn Adapter mit Mini-Budget: alle Einträge schema-gültig.
- Erster echter Crawl (23.11. nachmittags): 42.337 veröffentlichte Objekte (vorher 17.881). Musik 3.249, Sound 3.684,
  Video 4.381, Bild 17.615, Skript 2.109, 3D 1.919. Im Browser geprüft: Videos-Ordner, Hörproben Commons und Internet
  Archive, Suche, Khronos-Detail, Meldeseite mit `?id=`. Danach thumbs-Lauf für die neuen Einträge, dann Linkprüfung.

Noch offen aus den Stand-Dateien: Videoprobe in der Detailansicht (`PREVIEW_TYPES` um `video`, Zweig in `karte.js`,
`preview.video` in `check-links.mjs`), `minisearch` aus `package.json` entfernen. Openclipart-Sitemap: entschieden, nur der Feed
(Fynn, 23.11.2026), kein Eintrag mehr offen.

## Einbindung 23.11.2026 abends: 3D-Fahrzeuge, Icons, KI-Anbindung

- fundus-3d (`docs/stand/fundus-3d.md`): Gazebo Fuel (`fuel.mjs`) eingeschaltet, 2.642 Modelle. Sketchfab abgelehnt
  (Bedingungen). Offen für Fynn: Objaverse (Sketchfab-Vorschaubilder), OpenGameArt-Listenseiten für 3D-Fahrzeuge.
- fundus-icons (`docs/stand/fundus-icons.md`): OpenMoji, Twemoji, Noto Emoji (2D), Fluent Emoji, game-icons, Streamline
  eingeschaltet, 14.643 Einzelicons. Offen für Fynn: Noto 3D (Lizenz der 3D-Dateien unklar). Vorschlag a2 (alle
  Iconify-Icons als Set-Ansicht im Browser) noch nicht gebaut.
- fundus-mcp (`docs/stand/fundus-mcp.md`, `docs/KI-ANBINDUNG.md`, `mcp/`): MCP-Server, lokal geprüft (Probelauf gegen
  Port 4570). CI installiert `mcp/` vor `npm test`. Hosten braucht Cloudflare-Konto (Fynn), dann `functions/mcp.js`.
  Seite „KI anschließen“ in `src/` erst, wenn eine öffentliche Adresse steht.
- Taxonomie: Icons nach `meta.stil`; 3D neu „Schuhe“ und „Spielzeug“ vor Fahrzeugen (Google-Scans in Fuel), Drohnen,
  U-Bahn, Golfwagen usw. als Fahrzeuge. Fahrzeuge & Raumfahrt jetzt 320 (vorher 41).
- Katalog: 59.622 Objekte. 3D 4.561, Icons 14.906.
- **Vorschau-Speicher:** schon über 22.000 Dateien, mit Icons und Fuel bald rund 40.000. Grenze Cloudflare Pages 20.000
  Dateien: R2 oder ein anderer Speicher ist vor dem Hosten Pflicht (Entscheidung Fynn).
- `check-links.mjs`: GitHub-Dateiseiten (`github.com/…/blob/…`) werden nicht mehr abgefragt, wenn dieselbe Datei roh
  bei raw.githubusercontent.com geprüft wird (`rohAdresse()`, Test in `pipeline.test.mjs`). Erspart die 429 bei den Icons.

## Einbindung 23.11.2026 spät: Bewertungen und Skills (fundus-bewertung)

- Echte Bewertungen: Internet Archive (174 Musikstücke) und Blender Extensions (998, aus den Listenseiten, abschaltbar mit
  `blender.bewertungen: false`). Beliebtheit: GitHub-Sterne, Downloads (Poly Haven, ambientCG, Fuel, IA, Blender).
- Standardsortierung `empfohlen` (Bayes-Mittel, dann Beliebtheit je Quelle normalisiert), Anzeige: Sterne-Balken mit
  Tooltip, Beliebtheit als Zahl, bei Skills „der Sammlung“.
- Skills: 44 Sammlungen in `github.skillRepos`, Ausschlussliste. Ohne `GITHUB_TOKEN` bricht der Lauf nach rund 55
  Anfragen ab: 1.430 Skills, nur 343 mit Sternen. Mit Token neu crawlen.
- Skills werden reihum nach Sammlung gemischt (`reihumNachSammlung` in `crawler/lib/bewertung.mjs`).
- Katalog: 59.971 Objekte.

## Wenn ein Unterchat seinen Bericht schickt: einbinden

1. Bericht und `docs/stand/<name>.md` lesen, neue Dateien ansehen.
2. Adapter in `crawler/sources/index.mjs` eintragen (direkte Quellen VOR `openverse`), `config.json`-Eintrag ergänzen.
3. Hosts für Vorschau und Download in `VORSCHAU_HOSTS` in `src/seiten.js` nachtragen.
4. Neue Lizenzen (z. B. OGA-BY) erst nach Lesen des Lizenztexts in `crawler/lib/licenses.mjs`, Entscheidung in
   `docs/RECHT.md` notieren.
5. Neue Arten: `ARTEN` in `src/katalog.js` ergänzen (gehört fundus-index, solange der läuft: dort abstimmen).
6. `npm test` mit allen Testdateien, dann `node crawler/crawl.mjs --quelle <id>`, `node crawler/thumbs.mjs`
   (NUR wenn kein anderer thumbs-Lauf läuft), `node crawler/publish.mjs`, im Browser prüfen.

## Datenhaltung (seit dieser Nacht)

- `data/katalog/<quelle>.json`: Bestand je Quelle (`crawler/lib/store.mjs`). Die alte Einzeldatei liegt als
  `data/katalog.alt.json` (kann weg, sobald alles läuft).
- `data/crawlstand/<id>.json`: Fortschritt von Quellen, die in Etappen arbeiten (Openverse, bald Commons, Internet Archive).
- `data/vorschauen.json`: Register der Mini-Vorschaubilder (Pfad, Größe, dHash, Fehler; `endgueltig` nur bei 404/410
  oder unlesbarem Bild, sonst nächster Lauf versucht erneut).
- `data/linkstatus.json`: Linkprüfung. Massenhafte 403/429 eines Hosts zählen als „unklar“, nicht als tot.
- `public/data/`: von `publish.mjs` erzeugt (`stand.json`, `start.json`, `index/<art>.json`, `karten/<xx>.json`).

## Zahlen zuletzt

17.881 veröffentlichte Objekte (Commons 5.787, Openverse 2.949, ambientCG 2.724, Poly Haven 2.392, Fontsource 2.074,
GitHub ~1.700, Iconify 263). Vorschaubilder: 12.376 fertig, 344 Fehler (303 Schriften ohne darstellbare Buchstaben,
29 Netzfehler), Nachlauf am 23.11. mittags gestartet.
Linkprüfung: erst 1.698 Einträge geprüft (1.594 ok, 234 unklar, 0 tot). Die nächtliche Prüfung steckt in
`.github/workflows/katalog.yml` und lief nie, weil es noch kein Git-Repo gibt.

## Laufende oder offene Dinge

- Ein langer Vorschaubild-Lauf (`crawler/thumbs.mjs`) aus der ersten Crawl-Kette läuft eventuell noch mit älterem Code.
  NICHT parallel einen zweiten starten (sie würden sich das Register und Dateien gegenseitig löschen). Prüfen mit
  `tasklist | grep node` bzw. ob `data/vorschauen.json` deutlich mehr als 432 Einträge hat.
- Nachladen der Kartenbilder beim Scrollen am 23.11. im sichtbaren Browser geprüft: lädt jeweils rund eine
  Bildschirmhöhe voraus, nichts auf Vorrat.
- API-Schlüssel: To-do für Fynn in Discord (`fundus:api-schluessel`): GITHUB_TOKEN, OPENVERSE_CLIENT_ID/SECRET,
  SMITHSONIAN_API_KEY, EUROPEANA_API_KEY. Danach Openverse-Budget in `config.json` hochsetzen.
- To-do `fundus:betreiberangaben`: Impressum/Datenschutz-Angaben in `src/betreiber.js` fehlen.
- Vorschaubilder überschreiten bald 20.000 Dateien (Grenze von Cloudflare Pages): Speicher wie R2 einplanen.
- Git seit 23.11. (Branch `main`, erster Commit `79495f7`, mit Fynns Zustimmung). Nur der Orchestrator committet (Fynn erlaubt Commits auf main nach jedem fertigen Schritt ohne Rückfrage, Push nicht),
  Unterchats nicht. Kein Remote: die nächtliche Action in `.github/workflows/katalog.yml` läuft erst, wenn Fynn ein
  GitHub-Repo anlegt und pusht (und die Variable FUNDUS_KONTAKT setzt). `g.html` (fremde Webseite, Debug-Rest) liegt
  bewusst ungetrackt.
- Fehler in der Browser-Konsole „menueListenFuellen“ stammen von einer alten, längst ersetzten Seitenversion im Cache
  der Vorschau, nicht vom aktuellen Code.

## Hosting auf fynn.land (Absprache mit dem fynn.land-Hauptchat, 23.11.2026)

Auskunft, keine Freigabe: gebaut oder deployt wird erst nach Fynns ausdrücklichem Ja.
- Empfehlung: eigene Subdomain `fundus.fynn.land` als eigener Cloudflare Worker (wie dicehoc, studienverlaufsplan),
  nicht Pages und nicht als Pfad. Vite-`base` bleibt `/`. Erster Deploy legt die Domain über
  `routes: [{ pattern: "fundus.fynn.land", custom_domain: true }]` an.
- Worker mit Static Assets plus Script: `/mcp` im selben Worker (`assets.run_worker_first: ["/mcp"]`), Vorschaubilder
  über ein R2-Binding vom selben Origin (CSP bleibt `'self'`, nur ein Host im Datenschutz). `observability` aus.
  `/mcp` braucht Ratenlimits und den Not-Aus GUARD wie fynnland (`worker/guard.mjs`, `docs/SICHERHEITSPAKET.md`,
  `docs/KOSTEN-UND-EINNAHMEN.md` im fynnland-Repo).
- Limits Workers Static Assets: 20.000 Dateien je Version (Free), 100.000 (Paid), 25 MiB je Datei. Index 486 Dateien,
  Vorschaubilder gehören nach R2.
- Fynn richtet selbst ein: R2-Bucket (braucht Zahlungsmittel), API-Token als Repo-Secret für den Deploy.
- Eintrag auf fynn.land: Paket `site/content/apps/fundus/` baut der fynn.land-Chat. Fundus liefert DE+EN: Name,
  Tagline, 4–6 about-Zeilen, 3–4 Tags, page.md/page.en.md, tile.svg (weiß auf transparent), background.webp
  (1920×1200, < 400 KB). Bereiche: Spiele, Programme, Apps, Für Claude Code; neuer Tab nur durch Fynn.
- Rechtstexte: fynn.land/impressum.html und /datenschutz.html gibt es; entweder dort ergänzen oder eigene Seiten wie
  dicehoc. Offener Rechtspunkt: Fundus liefert eigene Vorschaubilder fremder Werke selbst aus, vor dem Start klären.
- **Umgesetzt (ohne Deploy):** `wrangler.jsonc` (Worker `fundus`, Assets aus `dist/`, R2 `fundus-vorschau` als
  `VORSCHAU`, GUARD, `RL_MCP` 60/min, Namespace 3001, observability aus, Route `fundus.fynn.land`, dev-Port 4572),
  `worker/index.mjs` (nur `/vorschau/*` aus R2 mit Pfadprüfung und Edge-Cache, `/mcp` mit Not-Aus und Limit),
  `worker/schutz.mjs`, `public/_headers` (CSP: Skripte/Stile `'self'`, Bilder/Medien/Verbindungen `https:`, weil große
  Vorschauen und Modelle nach Zustimmung direkt von den Quellen kommen), Theme-Skript nach `public/thema.js`
  ausgelagert, `scripts/web-bauen.mjs` (`npm run build:web`, dist ohne Vorschaubilder: 517 Dateien),
  `scripts/vorschau-r2.mjs` (`liste`/`abgleich`, MD5 gegen ETag; `thumbs.mjs` zählt Bucket-Inhalte als vorhanden).
  Workflow: R2- und Deploy-Schritte nur mit Repo-Variable `FUNDUS_DEPLOY=1`; Secrets `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Lokal mit `wrangler dev` geprüft: Seite, Vorschau
  aus lokalem R2, `/mcp` (Suche, Vorschau), Prius und Toy Car in 3D unter der CSP.

- 23.11.2026 abends: Linkprüfung `--max 5000` lief beim Herunterfahren noch, Ergebnis verloren (schreibt erst am Ende). Nach dem Neustart erneut starten. Cloudflare: R2 im Konto noch nicht freigeschaltet, Bucket und Tokens folgen.

## Test mit echter KI, 26.11.2026

- `npm run build:web`, dann `npx wrangler dev` (Port 4572, wie in Produktion). Claude Code (`claude -p`, Sonnet 5.5)
  bekam nur `http://127.0.0.1:4572/mcp` als HTTP-Server. Auftrag „drei CC0-Stühle als glTF, ansehen, schönsten
  auswählen, Lizenz und Links“: Suche, Details, Namensnennung und Download-Links kamen richtig an (10 Schritte, rund 35 s).
- Vorschauen fehlten zuerst, weil im lokalen R2 nur 7 Testbilder lagen (kein Code-Fehler). Nach
  `npx wrangler r2 object put fundus-vorschau/<pfad> --local` sah die KI die drei Bilder und beschrieb sie richtig.
- Cloudflare: wrangler ist angemeldet (OAuth), R2 meldet weiter „Please enable R2“ (Code 10042). `fynnland-admin` mit
  `Guard` läuft schon für fynn.land. Ratelimit-Namespaces dort: 2001 bis 2003, Fundus nimmt 3001.
- Offenes Risiko: Gratis-Tarif erlaubt 10 ms CPU je Anfrage. Eine Suche parst bis zu 12 Indexteile; nach dem ersten
  Deploy prüfen, ob `/mcp` Fehler 1102 bekommt. Sonst Workers Paid (5 US-Dollar im Monat), dann auch `KONTAKTBOGEN=1`.

## Live seit 26.11.2026 abends

- R2 im Konto aktiviert (0 $, Gratis-Kontingent, Fynn), Bucket `fundus-vorschau` angelegt, erster Upload der 50.100
  Vorschaubilder mit `wrangler r2 bulk put` über die OAuth-Anmeldung (Liste `.cache/r2-bulk.json`, kein R2-Token nötig).
  Für den nächtlichen Abgleich in CI braucht es weiterhin einen R2-Token als Secret.
- `npx wrangler deploy`: Worker `fundus`, Version 45d2a962, Domain `fundus.fynn.land`. `/mcp` antwortet live.
- Ratenlimit: Anthropics Ausgangsnetze (160.79.104.0/21, 153.61.208.0/20) zählen in `RL_MCP_KI` (1.200/min,
  Namespace 3002), alle anderen in `RL_MCP` (60/min). Grund: claude.ai- und Desktop-Connectors teilen sich wenige Adressen.
- Claude Code beim Besitzer: `claude mcp add --transport http --scope user fundus https://fundus.fynn.land/mcp`.
  claude.ai-Connector trägt Fynn selbst ein (Einstellungsseiten sind für die Chrome-Erweiterung gesperrt).
- `docs/KI-ANBINDUNG.md` und `mcp/src/stdio.mjs` zeigen auf die echte Adresse.
- Offen: fynn.land-Eintrag `status: "soon"` auf live stellen (fynn.land-Chat), Seite „KI anschließen“ in `src/`,
  `fundus-mcp` auf npm (Entscheidung Fynn), CPU-Zeit im Gratis-Tarif beobachten.

## 27.11.2026 vormittags: Aufhol-Lauf live, Einordnung der Projekte, große Ordner

- Katalog: 567.713 Einträge (GitHub 317.898, Commons Audio 65.923, Wellcome 54.822, Cleveland 41.856, Internet Archive
  26.978). Runde 1 und 2 der Vorschaubilder sind live (126.249), Runde 3 lief am Vormittag.
- **Vorschaubilder schneller** (`crawler/thumbs.mjs`, `poolNachHost`): Die Warteschlange lief in Katalogreihenfolge,
  also immer nur ein Host, und dessen Mindestabstand bestimmte das Tempo (3,9 Bilder/s). Jetzt nimmt jeder der 16
  Arbeiter das nächste Bild des Hosts, der zuerst frei ist. Gemessen: Wellcome 8,2/s (125 ms, vorher 27.005 Abrufe ohne
  429), Internet Archive 4,1/s (250 ms, bewusst gelassen), beide gleichzeitig. `UV_THREADPOOL_SIZE=16` setzen.
  Ein laufender thumbs-Lauf darf nur direkt nach einem Speichern des Registers beendet werden; `vorschau-r2.mjs
  abgleich` löscht im Bucket, was das Register nicht nennt.
- **Projekte einsortiert** (`crawler/lib/projekte.mjs`, eingebunden in `taxonomy.mjs`): 26 Unterordner statt drei.
  Reihenfolge der Belege: GitHub-Themen stimmen ab (bei Gleichstand entscheidet die Beschreibung), dann das erste
  Fachwort der Beschreibung, dann der Name, dann eine fachgebundene Sprache, dann „Bibliotheken & Werkzeuge“.
  Sonstiges: 41.990 von 315.632 (vorher 299.250). Der Rest hat meist weder Themen noch eine englische Beschreibung;
  mehr ginge nur mit dem README. Die Art (`kind`) bleibt `projekt`, die Lizenzregel für Medienarten ist unberührt.
- **Sterne exakt**: `empfohlen` (in `ausgabe.mjs` und `src/katalog.js`) nimmt bei gleichem Rang die Zahl selbst. Der
  Rang deckelt beim 99. Perzentil, die rund 3.000 meistbesternten Projekte standen deshalb gemischt.
- **Große Ordner**: Arten mit mehr als 20.000 Zeilen (`GROSS`) luden im Hintergrund jeden Teil (Projekte 634 Dateien,
  94 MB). Sie bekommen `index/<art>/kopf2.json` (Plätze 241 bis 2.400) und laden von selbst nie alles; nach dem zweiten
  Kopf verweist ein Satz auf Unterordner und Suche. Filter, die jede Zeile brauchen (Lizenz, Format, Quelle, andere
  Sortierung), laden weiterhin alles. `stand.index.arten[].kopf2` markiert solche Arten.
- **Liste lädt beim Scrollen nach** (`src/main.js`, `mehrZeigen`): angehängt, nicht neu gebaut; der Knopf bleibt.
- Gemessen, nicht umgesetzt: Unter den GitHub-Projekten sind nach Themen 441 Schrift-Repositories (176 mit OFL),
  2.255 Skill-Repositories, aber nur 23 mit 3D-Themen und CC-Lizenz. GitHub ist keine 3D-Quelle.
- Bekannter Fehler, nicht behoben: Schriftmuster für `githubschriften` nehmen den Repository-Namen als Familiennamen.
  214 von 305 scheitern („nicht erkannt“ oder „ohne darstellbare Buchstaben“), und einzelne gelungene zeigen eine
  Ersatzschrift. Der Familienname müsste aus der Schriftdatei gelesen werden.
- **Bilder einsortiert** (`unterBild` in `taxonomy.mjs`): Sonstiges von 47.567 auf 9.452. Neue Ordner für Museums- und
  Medizinbestände (Handschriften & Buchseiten, Medizin & Anatomie, Porträts & Menschen, Skulptur & Objekte, Historische
  Fotografie, Wissenschaft & Mikroskopie, Karten, für Cleveland Textilien, Keramik & Glas, Metallarbeiten, Schmuck &
  Münzen, Waffen & Rüstungen). Cleveland: Objekttyp in `tags[0]` entscheidet vor dem Titel, bei Bildern danach.
  Wellcomes `meta.art` zählt für Bilder nicht. Schwächster Ordner: Medizin & Anatomie (5 von 50 Proben falsch, vor
  allem über `hospital`). Rest in Sonstiges: Wellcome 5.856 (3.340 ohne Schlagworte), Commons 3.481.
- „Alle Objekte“: Der Knopf heißt „Mehr aus allen Ordnern anzeigen“; große Ordner sind dort nur mit ihrem Kopf dabei,
  am Ende steht ein Hinweis.
- **Vor 03:17 UTC pushen oder den Workflow ausschalten:** `katalog.yml` läuft mit `FUNDUS_DEPLOY=1` vom gepushten
  Stand. Ohne Push kehrt der alte Seitencode zurück, und `vorschau:r2` löscht im Bucket jedes Vorschaubild, das das
  gepushte Register nicht nennt.
- Offen: Sterne zählen nur auf der Seite. Der MCP-Server liefert ohne Suchwort die Indexreihenfolge und zeigt keine
  Sterne; eine Suche bricht Gleichstände zufällig.

## 27.11.2026 mittags: MCP und Startansicht

- Runde 3 der Vorschaubilder ist live: 179.999 Bilder im Register, 179.865 veröffentlicht, 53.729 davon in 110 Minuten.
- **Detaildateien** (`karten/`): 4.096 Dateien nach drei Hex-Stellen statt 256 (größte 437 KB statt 3,4 MB).
  `stand.index.karten` nennt die Stellenzahl, ältere Daten ohne Feld haben 2. `src/katalog.js` versucht bei 404 die
  andere Stellenzahl, weil `stand.json` eine Stunde im Browser-Cache liegt (`/data/*` in `public/_headers`).
  Drei `fundus_details` in einem Aufruf brauchten vorher 1,9 s (kalt), danach 1,7 s kalt und 0,4 bis 0,6 s warm;
  belastbar ist die Dateigröße, die Zeiten schwanken mit dem Isolate.
- **Beliebtheit in der MCP-Suche** (`gereiht` in `mcp/src/kern.mjs`): `index/<art>/beste.json` hält die bis zu 30.000
  beliebtesten Zeilen einer Art (Refs, beste zuerst). Treffer daraus zählen mal 1 + BONUS (1,5) für den ersten Platz,
  fallend mit dem Logarithmus des Platzes. Geprüft an 19 festen Anfragen (`node mcp/scripts/rang-messen.mjs`,
  mit BONUS 0 als Vergleich): Godot bei „game engine“, Hugo bei „static site generator“, Alacritty bei „terminal
  emulator“, MarkText bei „markdown editor“ und Milvus bei „vector database“ lagen alle jenseits von Platz 50 und
  stehen jetzt auf 1, 1, 2, 3 und 12; Arten ohne
  Beliebtheit (Bilder, Icons) unverändert. Suchzeilen haben eine Spalte `popularity`, wenn die Seite Zahlen hat.
  Ohne Suchwort liefert `fundus_search` weiter die Indexreihenfolge.
- Gemessen: Die Verbindung ist zustandslos, ein Kern mit Zwischenspeichern je Isolate, Daten über `ASSETS` (kein
  Weg ins Internet). Warm rund 0,1 s je Aufruf, kalt 0,3 bis 0,7 s, weil Cloudflare zwischen mehreren Isolates wechselt
  und jedes seine Speicher neu füllt. `suche-messen.mjs` (ohne Projekt-Anfragen, vor dem Umbau): Median 4,5 ms,
  höchstens 27 ms auf dem Entwicklungsrechner. Projekt-Suchen laden 4 bis 8 Indexteile und brauchen dort samt
  Dateilesen 15 bis 105 ms; ob das im Worker die CPU-Grenze des Tarifs berührt, zeigt nur das Cloudflare-Dashboard.
- **Startansicht**: Die Anleitungen der fünf Reiter liegen übereinander (kein Sprung mehr beim Wechsel, vorher bis
  84 px), Kopieren-Knöpfe behalten ihre Breite. `Fraunces Ersatz` (Georgia, `size-adjust: 89%`) und zwei
  vorgeladene Schriftdateien (`vite.config.js`): Die Überschrift brach vorher mit Georgia zweizeilig um und sprang
  beim Eintreffen der Schrift um 64 px.
- Link „fynn.land“ im Kopf (ab 921 px Breite) und im Fuß. Das Nachladen beim Scrollen hält nach vier Seiten
  (600 Karten) an und wartet auf den Knopf, damit Impressum und Datenschutz im Fuß erreichbar bleiben.
- Kosten: `/mcp` und jedes Vorschaubild (`/vorschau/*`) laufen durch das Worker-Skript und zählen als
  Worker-Anfrage; die Seite und `/data` nicht. Grenze je Besucher: 60 MCP-Aufrufe je Minute, Anthropics Adressen
  1.200. Ein Tagesdeckel für `/mcp` fehlt.
- Impressum und Datenschutz stehen zusätzlich am Ende der Seitenleiste (ab 761 px). Schmaler lädt die Liste nicht von
  selbst nach, nur per Knopf: mit zwei Spalten läge der Fuß nach 600 Karten rund 120.000 px tief.

## 27.11.2026 abends: Rechteprüfung Musik vollständig, live

- Voller Lauf mit der gebündelten Suche (`--max-minuten 360 --treffer-neu`): 35.850 Titel in 3 h 44 min mit 5.566
  Suchen. Nach dem ersten Durchgang fehlten 2.366 Antworten, nach dem dritten 99; die holt der nächste Lauf.
  Von 52.435 Musikeinträgen sind 193 ungeprüft.
- Ergebnis: 35 Einträge „fremd“ (vorher 23), 459 „zum Ansehen“. 13 kamen neu dazu, einer ist wieder sichtbar
  („For you“ von Czxttkl, ein chinesisches Lied; die gebündelte Suche zählt 36 gleichnamige Werke statt weniger).
- Die 13 neuen an der Quelle angesehen (Commons-Beschreibung, Titelliste im Internet Archive). Neun stehen jetzt in
  `crawler/config.json` unter `rechte.freigegeben`. Der Chat hat sie eingetragen, Fynn hat am 27.11.2026
  abends bestätigt, dass alle neun sichtbar bleiben. Alle neun waren vorher ungeprüft und damit schon sichtbar.
  - Von der Quelle selbst belegt (2): `internetarchive:AIOT_YesAnd` (Album, laut Beschreibung live improvisierte
    Stücke, neun eigene Titel) und `internetarchive:out-of-my-dreams` (laut Beschreibung eine Komposition von
    George L Smyth nach einem Haiku von Ryōkan).
  - Geschlossen, nicht belegt (7): fünf Stücke von Antti Luode auf Commons (Happy Children, El paso, Mostly
    Harmless, T R O U B L E, Walking the dog). Die Seiten sagen nur „by Antti Luode“; im Katalog stehen 1.785 Stücke
    von ihm. Dazu `internetarchive:cemetery-gates_202611` und
    `internetarchive:electric-funeral`: Alben von La Machine de la Mort mit 15 und 25 Titeln, Beschreibung leer.
    Das Stück „Cemetery Gates“ dauert dort 3:01, „Electric Funeral“ 2:37; bei MusicBrainz liegt der Median der
    Aufnahmen von Pantera bei 7:10 (24 Aufnahmen, kürzeste 5:14), der von Black Sabbath bei 4:50 (22 Aufnahmen).
- Ausgeblendet bleiben vier neue: „I Got Rhythm“ (laut Beschreibung ein Cover, Ira Gershwin starb 1983), „Ain't
  misbehavin“ (laut Beschreibung das Lied von Waller und Brooks), „Ain't That A Kick In The Head“ von Kyle Dearn
  (Genre Swing, 2:26; die Aufnahmen von Dean Martin liegen bei MusicBrainz im Median bei 2:25, also vermutlich ein
  Cover, nicht belegt) und „Anyone of US“ von ARDOSANT (Beschreibung „AA“, nicht zu klären).
- Muster der Fehltreffer: Ein Album im Internet Archive wird über seinen Albumtitel mit einem Lied verglichen. Unter
  den 22 schon vorher ausgeblendeten stehen auch Bearbeitungen traditioneller Melodien (The Marines' Hymn, Maggie
  Mae, Over the Hills and Far Away, Faith of Our Fathers, National Emblem); nicht geprüft und nicht angefasst.
- Live: 567.702 Einträge, 25 fremde Lieder und 1 gesperrtes ausgelassen, 328 Tests grün, `ZUGANG "1"`, `KONTO "0"`.
- GitHub: Es gab noch keinen geplanten Lauf. Das Repository besteht seit 26.11.2026 19:16 UTC; der einzige Lauf
  (von Hand, 26.11. 19:54 UTC) lief im Schritt `npm run vorschau` in die 90-Minuten-Grenze, damals ohne
  `--max-minuten`. Der Lauf in der Nacht zum 28.11. ist der erste mit Zeitgrenze und `FUNDUS_DEPLOY=1`.
- **Stufe 2 des MCP-Zugangs ist eingeschaltet** (`KONTO: "1"`, 27.11.2026 abends, mit Fynns Ja). Geprüft bis zur
  Anmeldeseite, Einzelheiten in `docs/MCP-ZUGANG-ENTWURF.md` (letzter Abschnitt). Offen ist der Durchlauf mit einem
  echten Konto: anmelden, verbinden, zweites Gerät, abmelden, Zugang löschen.

## 27.11.2026 spät: Skills und 3D-Modelle aus den Projekten umsortiert (lokal, nicht live)

- **GitHub-Projekte wechseln die Art beim Bau** (`projektArt` in `crawler/lib/projekte.mjs`, aufgerufen in
  `crawler/publish.mjs` vor der Unterkategorie; der gespeicherte Katalog bleibt `projekt`).
  - Skill: KI-Bezug und der Name sagt Skill (`comfy-skills`, `…-skill`, `….skill`) oder die Beschreibung („A Claude
    skill for …“, „Agent Skills for …“). Topics allein zählen nicht. Was die Beschreibung zuerst nennt, entscheidet:
    Registries, Runtimes, CLIs und Konverter rund um Skills bleiben Projekte. Stichprobe 50 Treffer: 1 bis 2 Grenzfälle.
  - 3D: nur unter CC oder gemeinfrei (wie `MEDIENARTEN` im GitHub-Adapter) und nur, wenn die Beschreibung Modelle,
    druckbare Teile, STL- oder CAD-Dateien nennt; Listen, Datensätze, Bibliotheken, Drucker und Elektronik-CAD nicht.
- Ergebnis im Bau: Projekte 315.632 → 313.594, Claude-Skills 2.167 → 4.188, 3D-Modelle 7.839 → 7.856; Gesamtzahl
  unverändert 567.702.
- **Skill-Ordner neu** (`unterSkill` in `taxonomy.mjs`): ganze Wörter, die Namen der Agenten und das Wort „Skill“
  werden vorher entfernt, das erste Fachwort entscheidet. Vorher landeten 1.934 von 2.341 Skills in „Entwicklung“
  („code“ in „Claude Code“). Neu: Skill-Sammlungen (830, nur umgezogene Repositories mit vielen Skills), Dokumente &
  Präsentationen, Marketing & Vertrieb, Sicherheit. Sonstiges: 409.
- Der Projektordner „KI-Agenten & Skills“ heißt jetzt „KI-Agenten & MCP“ (9.082).
- Sterne eines umgezogenen Repositories heißen nicht mehr „der Sammlung“ (`src/karte.js`, `src/main.js`).
- Gemessen, nicht umgesetzt: 312 Projekte mit Code-Lizenz nennen 3D-Modelle oder STL-Dateien in der Beschreibung;
  ein guter Teil davon sind Werkzeuge (Viewer, Generatoren), die echten Modell-Repositories darunter bleiben wegen der
  Medienlizenz-Regel Projekte. Ob sich die Regel ändert, entscheidet Fynn.
- Offen: 27 umgezogene Sammlungen (etwa `anthropics/skills`) stehen neben der Gruppe ihrer einzeln gelesenen Skills.
