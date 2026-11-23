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
