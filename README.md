# Fundus

Katalog freier Assets: Bilder, 3D-Modelle, Texturen und HDRIs, Musik, Sounds, Skripte, ganze Projekte, Claude-Code-Skills
und Schriften. Jede Karte nennt Urheber, Lizenz und Ursprung. Vorschau und Download kommen direkt von der Quelle,
Fundus selbst speichert keine Dateien.

## So funktioniert es

```
Quellen-APIs ──crawl──▶ data/katalog/<quelle>.json ──links──▶ data/linkstatus.json
                              │
                              └──thumbs──▶ public/vorschau/ + data/vorschauen.json (dHash)
                                                │
             publish (Doppelte zusammenführen, Unterordner, aufteilen)
                                                │
        public/data/start.json, index/<art>.json, karten/*.json ──▶ Website (Vite, statisch)
```

- **Crawler** (`crawler/crawl.mjs`): ein Adapter pro Quelle in `crawler/sources/`. Holt nur Metadaten, normalisiert
  die Lizenz (`crawler/lib/licenses.mjs`) und verwirft alles ohne offene Lizenz (keine NC/ND). Jede Quelle hat ihre
  eigene Datei unter `data/katalog/` (ein Eintrag pro Zeile), deshalb können mehrere Quellen gleichzeitig laufen.
  Große Quellen arbeiten in Etappen: ein Lauf verbraucht ein Anfragebudget und merkt sich unter `data/crawlstand/`,
  wo er weitermacht. Der Bestand wächst so über Tage, ohne eine Quelle zu überlasten.
- **Linkprüfung** (`crawler/check-links.mjs`): fragt Ursprungsseite, Vorschau und Downloads jedes Eintrags ab.
  Nach zwei Fehlläufen in Folge fliegt der Eintrag aus dem veröffentlichten Katalog. 429/503 zählen als „unklar“.
  Bericht unter `reports/`.
- **Vorschaubilder** (`crawler/thumbs.mjs`): holt pro Eintrag das Vorschaubild der Quelle einmal, verkleinert es auf
  320 px (WebP, etwa 10 bis 20 KB) und legt es unter `public/vorschau/` ab. Dabei entsteht ein Bild-Fingerabdruck (dHash).
  Schriften bekommen ein Musterbild („Aa“ in der Schrift selbst); erkennt der Renderer die Schrift nicht, gibt es
  lieber kein Bild als ein falsches.
- **Veröffentlichen** (`crawler/publish.mjs`): nur gültige, erreichbare, nicht gesperrte Einträge; Doppelte werden
  zusammengeführt (gleiche Prüfsumme laut Quelle, gleicher SKILL.md-Text, bei Fotos aus verschiedenen Quellen fast gleicher dHash), jeder Eintrag bekommt
  einen Unterordner (`crawler/lib/taxonomy.mjs`). Ausgabe aufgeteilt: `start.json` (gemischte Auswahl für den ersten
  Bildschirm), `index/<art>.json` (eine kompakte Zeile pro Objekt; die Seite lädt einen Ordner erst, wenn man ihn
  öffnet, und alle erst bei einer ordnerübergreifenden Suche) und 256 Dateien unter `karten/` mit den vollen
  Einträgen. Gemeldete Einträge kommen in
  `data/gesperrt.json` (`{ "<id>": "Grund, Datum" }`).
- **Website** (`src/`): statisches Vite-Projekt ohne Framework (Gestaltung: `DESIGN.md`). Mini-Vorschaubilder kommen vom eigenen Server; große Vorschauen, Hörproben, 3D-Ansicht (three.js) und
  Schriftproben laden erst nach Opt-in von der Quelle. Pakete (glTF mit Texturen, Skill-Ordner) setzt der Browser aus
  den Einzeldateien der Quelle zu einer ZIP zusammen.

## Quellen

| Quelle | Inhalte | Schlüssel |
|---|---|---|
| Wikimedia Commons | Bilder (exzellente Bilder) | nein |
| Poly Haven | 3D-Modelle, Texturen, HDRIs (CC0) | nein |
| ambientCG | Materialien (CC0) | nein |
| Openverse | Bilder, Musik, Sounds (Flickr, Freesound, Jamendo …) | nein (anonym 200 Anfragen/Tag) |
| GitHub | Projekte, Skripte, Claude-Code-Skills | optional `GITHUB_TOKEN` (sonst langsam) |
| Fontsource | Schriften (OFL, Apache) | nein |
| Iconify | Icon-Sets (je Set ein Eintrag, Lizenz je Set) | nein |
| Internet Archive | Musik aus der Netlabel-Sammlung (CC0, BY, BY-SA, PDM) | nein |
| Smithsonian Open Access | CC0-Bilder und 3D-Modelle | `SMITHSONIAN_API_KEY` (ohne Schlüssel übersprungen) |

Freesound direkt ist gebaut (`freesound.mjs`), aber abgeschaltet: die API-Bedingungen verbieten, daraus eine ähnliche
Datenbank aufzubauen. Freesound-Sounds kommen über Openverse. Openverse selbst arbeitet in Etappen: jeder Lauf verbraucht
höchstens ein Anfragebudget und merkt sich in `data/crawlstand/openverse.json`, wo er weitermacht.

Bewusst nicht dabei: ccMixter (sperrt Hotlinking), Jamendo direkt (kommerziell nur mit Vertrag), NASA (keine formale
Lizenz), Art Institute of Chicago (Cloudflare-Abfrage) und Metropolitan Museum (Imperva-Bot-Schutz), beide Adapter liegen
abgeschaltet bei. Pixabay, Pexels und Unsplash haben eigene Lizenzen statt offener und fallen deshalb heraus.
Was je Quelle gecrawlt wird, steht in `crawler/config.json`.

## Befehle

```powershell
npm install
npm run crawl          # alle Quellen; einzeln: node crawler/crawl.mjs --quelle polyhaven
npm run links          # Linkprüfung komplett (dauert Stunden); nachts rotierend: node crawler/check-links.mjs --max 5000
npm run vorschau       # Mini-Vorschaubilder für neue Einträge
npm run daten          # public/data/ neu schreiben
npm run dev            # http://localhost:4570
npm test               # Lizenzen, Adapter gegen echte API-Antworten, Dedupe, Linkprüfung, Katalogdaten
npm run build          # statische Seite in dist/
```

Umgebungsvariablen: `FUNDUS_KONTAKT` (URL der Website, landet im User-Agent; Wikimedia verlangt eine Kontaktangabe),
`GITHUB_TOKEN` (optional, hebt das GitHub-Limit von 60 auf 5000 Anfragen pro Stunde), `OPENVERSE_CLIENT_ID` und
`OPENVERSE_CLIENT_SECRET` (mehr als 200 Openverse-Anfragen am Tag), `FREESOUND_TOKEN`, `SMITHSONIAN_API_KEY`.

Speicher: Die Vorschaubilder brauchen etwa 15 KB pro Objekt. Cloudflare Pages erlaubt 20.000 Dateien pro
Veröffentlichung; ab dieser Größe gehören `public/vorschau/` in einen Objektspeicher (etwa Cloudflare R2).

`.github/workflows/katalog.yml` führt Crawl, Linkprüfung und Tests nachts aus, sobald das Repo auf GitHub liegt.

## Vor dem Veröffentlichen

1. Betreiberangaben in `src/betreiber.js` eintragen, sonst zeigen Impressum, Datenschutz und Meldeseite Platzhalter.
2. Hoster wählen und in der Datenschutzerklärung nachziehen.
3. `docs/RECHT.md` lesen, besonders „Offene Punkte“.
4. Logo und Favicon: `public/favicon.svg` ist ein Platzhalter (Buchstabe F), kein fertiges Logo.

Gestaltung und Begründungen: `DESIGN.md`.
