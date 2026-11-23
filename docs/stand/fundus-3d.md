# Stand: 3D-Fahrzeuge (Unterchat fundus-3d)

Zuletzt aktualisiert: 23.11.2026. Auftrag: neue, sauber lizenzierte 3D-Quellen mit vielen Fahrzeugen. Nichts in `index.mjs`, `config.json`, `src/*`, `crawler/lib/*`, `thumbs.mjs` geändert, nichts committet, kein Lauf gegen `data/katalog`.

## Ergebnis in vier Sätzen

Eine Quelle ist sauber und gebaut: **Gazebo Fuel** (`crawler/sources/fuel.mjs`). Ein Probelauf mit Zustandsdatei im Temp-Ordner brachte 2.642 gültige 3D-Modelle (459 CC0, 2.171 CC BY, 12 CC BY-SA), davon ordnet die Taxonomie 192 unter „Fahrzeuge & Raumfahrt“ (grob 80 bis 125 echte Fahrzeuge, der Rest sind Schuhe und Spielzeug, siehe unten). Das ist ein Plus, aber kein Sprung: Frei lizenzierte Fahrzeugmodelle sind selten, die großen Quellen (Sketchfab, Objaverse) scheitern an den Bedingungen oder brauchen eine Entscheidung von Fynn. Für Sketchfab gibt es eine belegte Ablehnung, für Objaverse und eine OpenGameArt-Liste je eine Entscheidungsvorlage.

## Geprüfte Quellen

| Quelle | Urteil | Kern des Belegs |
|---|---|---|
| **Gazebo Fuel** | gebaut | Öffentliche REST-API ohne Schlüssel, Lizenz je Modell als Feld, robots.txt erlaubt alles, keine Nutzungsbedingungen für die API auffindbar |
| Sketchfab | abgelehnt | Nutzungsbedingungen verbieten das Einsammeln und Neu-Veröffentlichen von Inhalten |
| Objaverse (Hugging Face) | nicht gebaut, Entscheidung für Fynn | Technisch offen, rechtlich Sketchfab-Inhalte auf Umwegen, Vorschaubilder nur bei Sketchfab |
| OpenGameArt, Listenseiten | nicht gebaut, Entscheidung für Fynn | robots.txt erlaubt es, aber die Vorgabe lautet „kein HTML-Scraping“ |
| Smithsonian 3D | schon da (`smithsonian.mjs`), kaum Fahrzeuge | 1.937 CC0-Modelle, nur etwa 4 Fahrzeuge |
| Wikimedia Commons | schon da (Gruppe `3d`), wenig Fahrzeuge | Kategorien mit zweistelligen Zahlen |
| BlendSwap | nicht gebaut | Keine API, Download nur mit Konto, Content-Signal `ai-train=no` |
| Thingiverse | nicht gebaut | API verlangt Token (401 ohne), robots sperrt `/download:*` und `/*/zip` |

### Gazebo Fuel (gebaut)

- API: `https://fuel.gazebosim.org/1.0/models?per_page=100&page=N&order=asc`, Gesamtzahl im Header `X-Total-Count` (3.472 Modelle am 23.11.2026). Kein Schlüssel, kein Login, `Access-Control-Allow-Origin: *`.
- Lizenz je Modell maschinenlesbar (`license_name`, `license_url`). Verteilung über alle 3.472: CC BY 4.0 2.805, CC0 620, CC BY-SA 4.0 12, NC/ND-Varianten 35 (die fliegen über `normalizeLicense` raus).
- robots.txt: `https://app.gazebosim.org/robots.txt` enthält nur `User-agent: *` und die Sitemap, keine Sperre. `fuel.gazebosim.org/robots.txt` gibt 404. Eine Nutzungsbedingungen-Seite gibt es nicht (`app.gazebosim.org/terms` ist 404).
- Einzige rechtliche Seite: https://gazebosim.org/docs/all/fuel_copyright/. Zitat: „Open Robotics isn't able to mediate rights ownership disputes.“ Beim Betreiber gibt es also eine Entfernung auf Anzeige (E-Mail an info@osrfoundation.org), aber keine Prüfung der Rechtekette. Die Lizenz nennt der Hochladende. Fuel kennt Forks, und manche Hochladende laden fremde Modelle neu hoch. Das ist die Quelle des Restrisikos (gelb, wie bei Commons): Lizenz und Hochladender stehen an jedem Eintrag, „Eintrag melden“ und die Sperrliste greifen.
- Dateien: Vorschaubild `…/1.0/<owner>/models/<name>/tip/files/thumbnails/1.png` und ZIP `…/1.0/<owner>/models/<name>.zip` (SDF, Meshes, Texturen) liegen beim API-Host. Geprüft mit curl: 200/206 mit Browser-User-Agent und fremdem Referer, ACAO `*`, Range geht. **HEAD antwortet mit 405**; `check-links.mjs` fällt laut Kommentar auf GET mit Range zurück, bitte beim ersten Lauf prüfen.
- Zahlen im Probelauf (35 Anfragen, ein Lauf, Zyklus fertig): 2.642 Modelle, verworfen 35 wegen Lizenz, 421 ohne Vorschaubild, 374 Kopien (gleicher Name und gleiche Größe bei anderem Besitzer, der älteste Upload gewinnt).
- Wer hochlädt: GoogleResearch 1.033 (gescannte Alltagsobjekte, CC BY: Schuhe, Spielzeug, Haushalt), OpenRobotics 1.023 (Simulationsmodelle), danach viele Einzelne. Wer die GoogleResearch-Scans nicht will, trägt `"ausschliessen": ["GoogleResearch"]` ein.
- Vorschau ist nur das Bild, kein 3D im Viewer: die Modelle bestehen aus SDF mit OBJ, DAE oder STL, der Viewer kann nur glTF.

**Fahrzeugmenge.** 192 Einträge landen in „Fahrzeuge & Raumfahrt“. Davon sind 67 GoogleResearch-Scans, die meisten falsch einsortiert (Regel `boat` trifft „Boat Shoe“, `van` trifft die Marke „Vans“, `bus` und `train` treffen Spielzeug „Sorting Bus“). Die übrigen 125 sind echte Fahrzeuge, Roboterplattformen und Varianten: Ambulance, Bus, Fire truck, Pickup, SUV, Hatchback (mehrere Farben), Prius Hybrid, Polaris Ranger, Cessna C-172, Submarine (mehrere Zustände), Mars Rover, NASA Perseverance, Subway-Wagen (R32, R160), Quadrocopter und UAV-Konfigurationen (viele Varianten, X1 bis X4), Fahrrad, Segelboot-Drohnen (WAM-V, MBARI Tethys). Schätzung ehrlich: **rund 80 bis 125 eigenständige Fahrzeugmodelle**, je nachdem, ob man die UAV-Varianten einzeln zählt. Die 41 bisherigen Fahrzeuge im Katalog sind meist NASA-Modelle von Commons und Poly-Haven-Schiffe; einen Abgleich der Titel habe ich nicht gemacht.

### Sketchfab (abgelehnt)

- Die Daten-API selbst ist ohne Schlüssel erreichbar (`https://api.sketchfab.com/v3/search?type=models&downloadable=true&license=cc0&q=car` gab 200 mit Titel, Lizenz, Vorschaubildern, Kategorie `cars-vehicles`). Das Problem sind die Bedingungen.
- Nutzungsbedingungen, gültig ab 27. Oktober 2026 (https://sketchfab.com/terms, Betreiber jetzt „KitBash SF Operations LLC“): „Except where explicitly allowed by this Agreement, collect, aggregate, mine, scrape, or otherwise use any Sketchfab Content or User Content for the purposes of publishing, selling, distributing or otherwise making the content available to others to use, download or copy“ ist verboten. Dazu ein eigenes Verbot für „NoAI Content“. Das ist dieselbe Klasse wie beim Freesound-Ausschluss (Katalog aus der Quelle bauen und weitergeben).
- API-Vertrag (https://sketchfab.com/developers/terms) Ziffer 4.6: „The use of the Sketchfab download API requires the end user to be authenticated to the service using a Sketchfab account.“ Es gäbe also keine direkten Dateilinks, und Fundus müsste Sketchfab-Anmeldung einbauen.
- robots.txt (`https://sketchfab.com/robots.txt`) sperrt nur `/admin*`, `/i/*` und die AR-Weiterleitung. Die Seite „developers/guidelines“ gibt eine AWS-WAF-Abfrage (HTTP 202). Die habe ich nicht umgangen, gelesen wurden nur die zwei Verträge oben.

### Objaverse (nicht gebaut, Entscheidung für Fynn)

Der einzige Weg zu Fahrzeugen im vierstelligen Bereich. Fakten (Dataset-Karte, README von `allenai/objaverse`, und ein Metadaten-Shard von 3,6 MB gelesen):

- Lizenz: „The use of the dataset as a whole is licensed under the ODC-By v1.0 license. Individual objects in Objaverse are all licensed as creative commons distributable objects“: CC BY 721.000, CC BY-NC 25.000, CC BY-NC-SA 52.000, CC BY-SA 16.000, CC0 3.500. „The metadata will provide the license for each object.“ Stimmt: Feld `license` (`by`, `by-sa`, `cc0`, `by-nc`, `by-nc-sa`).
- Im Shard `metadata/000-000.json.gz` (5.000 Objekte): 188 haben die Kategorie `cars-vehicles` (3,8 %), davon 176 CC BY, 2 CC BY-SA, 10 NC. Auf alle rund 160 Shards hochgerechnet etwa **30.000 Fahrzeugmodelle**.
- Technik: Dateien `glbs/<shard>/<uid>.glb` auf huggingface.co (Weiterleitung auf `us.aws.cdn.hf.co`, `Access-Control-Allow-Origin: *`, 3,5 MB beim Stichprobenmodell). `huggingface.co/robots.txt`: `User-agent: *` / `Allow: /`.
- **Probleme, deshalb nicht gebaut:** (1) Die Vorschaubilder und die Seiten (`viewerUrl`) liegen bei `media.sketchfab.com` und `sketchfab.com`. Fundus müsste also doch Sketchfab-Bilder holen und eigene Kopien (320 px) bilden, genau das, was oben verboten ist. (2) Die Daten sind ein Stand von 2022 (Sketchfab-Autoren können Modelle und Lizenzen seither geändert oder gelöscht haben; Kenntnis nach einem Hinweis ist dann gegeben, siehe `docs/RECHT.md`, Zeile „Falsch angegebene Lizenz“). (3) Der Zweck des Datensatzes ist Forschung. (4) Ohne Vorschaubild wäre jede Karte leer, da `thumbs.mjs` keine Modelle rendert.
- Wenn Fynn es trotzdem will: eigener Adapter mit Etappen über die Shards, nur `by`, `by-sa`, `cc0` und Kategorie `cars-vehicles`, Landeseite = `viewerUrl`, Download = HF-Datei. Die Vorschaubilder wären der Knackpunkt (Rechtsfrage, eine Anwältin oder ein Anwalt sollte draufsehen).

### OpenGameArt, Listenseiten (nicht gebaut, Entscheidung für Fynn)

- `https://opengameart.org/robots.txt` (Gruppe `*`): `Crawl-delay: 10`, gesperrt ist u. a. `/search/`. Die Seite `/art-search-advanced?keys=car&field_art_type_tid[]=10` (3D Art) ist NICHT gesperrt. Sie liefert 24 Treffer je Seite mit Blätterfunktion, jede Detailseite enthält Art, Tags, Lizenzen, Vorschau, Dateien und Autor im selben Aufbau wie der Feed (gemessen mit `low-poly-cars`, Node 52834).
- Treffer „car“ in 3D-Art sind echte Fahrzeugpakete (Cartoon Vehicles Pack, Low poly cars, Muscle Car 3D Model, PSX Style Cars, Racing Kart, 3D old jeep, Rigged Car …), viele CC0 und CC BY.
- Warum nicht gebaut: `docs/stand/fundus-2d.md` und die Übergabe halten fest „Mehr ginge nur per HTML-Scraping: nicht bauen“, und bei Openclipart hat Fynn sich auf den Feed beschränkt. Außerdem gehört `opengameart.mjs` dem Unterchat fundus-2d; ein zweiter Adapter mit anderer Quell-ID würde Einträge doppeln, einer mit derselben ID würde `data/katalog/opengameart.json` überschreiben.
- Vorschlag, falls Fynn das freigibt: Strang „3D-Art nach Stichwort“ in `opengameart.mjs` (je Begriff Listenseiten, danach Detailseiten), 10 s Abstand wie beim Feed, Zustand in `data/crawlstand/opengameart.json`. Wie viele Fahrzeugpakete es insgesamt gibt, habe ich nicht gezählt (die erste Trefferseite für „car“ in 3D Art zeigt 24 Pakete). Die Menge pro Lauf ist durch die 10 s Abstand begrenzt (rund 360 Seiten je Stunde). Hinweis: manche Pakete sind Spiegel von Kenney und Quaternius (dort per robots und Lizenzbedingungen abgelehnt). Wenn die Urheber selbst bei OpenGameArt unter CC0 hochgeladen haben, ist das ihre Entscheidung, aber Fynn sollte es wissen.

### Smithsonian 3D (schon da, nur Konfiguration)

- `smithsonian.mjs` holt 3D-Modelle schon (Suche `online_media_type:"3D Models" AND media_usage:"CC0"`), `config.json` hat `"modelle": 200`, und `SMITHSONIAN_API_KEY` fehlt noch (To-do `fundus:api-schluessel`). Mit dem Demo-Schlüssel von api.data.gov geprüft: 1.937 CC0-Modelle insgesamt. Fahrzeuge darunter: nur 1903 Wright Flyer, Bell X-1, Apollo 11 Command Module, Space Shuttle Orbiter Discovery (alle National Air and Space Museum). Der Rest sind Knochen, Fossilien, Statuen.
- Empfehlung: `"modelle": 2000` und `"budget": 80` setzen, sobald der Schlüssel da ist. Das bringt rund 1.900 Modelle, aber nur 4 Fahrzeuge. Trotzdem sinnvoll für die Gesamtzahl, kein Beitrag zum Fahrzeugziel.
- Der Server `3d-api.si.edu` beantwortet `/api/v1.0/content/file/search?q=…` auch ohne Schlüssel (liefert Dateien je Modell, aber weder Lizenz noch Museum). Das reicht nicht für einen eigenen Adapter, weil die Lizenz fehlt.

### Wikimedia Commons (schon da)

Die Gruppe `3d` in `config.json` (`filetype:3d -intitle:Noto`) holt STL und GLB. Gemessen am 23.11.2026 (`srsearch=filetype:3d <Wort>`): car 94, ship 89, locomotive 21, rocket 13, boat 13, aircraft 10, train 9, airplane 4, helicopter 1, truck 1. Dazu „Category:3D models of aircraft“ mit 44 Dateien und „Category:3D models of vehicles“ mit 14. Das sind Trefferzahlen mit unscharfen Wörtern, die echte Menge liegt eher bei 100 bis 200. Wird beim Wikimedia-Lauf ohnehin eingesammelt, wenn der Strang `3d` fertig ist (Stand in `data/crawlstand/wikimedia.json` prüfen). Die Anfragen kamen nach etwa zehn schnellen Aufrufen als Nicht-JSON zurück (Drosselung), der Adapter hält deshalb seinen Abstand ein.

### Nicht oder nur oberflächlich geprüft

BlendSwap (robots erlaubt `*`, Content-Signal `search=yes, ai-train=no, use=reference`, Weiterleitung `blendswap.com` → `www`, keine API gefunden, Download nur mit Konto) und Thingiverse (robots sperrt `/download:*`, `/*/zip`; die API antwortet ohne Token 401, Bedingungen nicht gelesen). Beide nur kurz angesehen, nicht gebaut: kein belegbarer Weg ohne Konto oder HTML-Scraping. Mehr Quellen, die ich nicht angefasst habe, weil sie schon abgelehnt sind: Kenney, Quaternius, Poly Pizza, NASA 3D Resources, BlenderKit.

## Gebaut

| Code | Quelle | Datei | Menge | Zustand |
|---|---|---|---|---|
| D1 | Gazebo Fuel | `crawler/sources/fuel.mjs` | 2.642 Modelle (192 laut Taxonomie Fahrzeuge) | `data/crawlstand/fuel.json` (`cfg.stand` für Probeläufe), Seite je Anfrage, `gesehen` merkt Kopien |

Tests: `tests/adapters-3d.test.mjs`, 11 Tests, alle grün (`node --test tests/adapters-3d.test.mjs`), Fixture `tests/fixtures/fuel-models.json` (11 gekürzte echte Zeilen der API-Antwort). Ohne Netz: der Crawl-Test ersetzt `fetch`. Probelauf live mit Mini-Budget (3 Seiten) und danach vollständig (35 Seiten) gegen Zustandsdateien im Temp-Ordner, alle Einträge bestehen `validateItem`. `npm test` gesamt: 187 von 187 grün.

## Zeile für `crawler/sources/index.mjs`

```js
import fuel from './fuel.mjs';
// SOURCES = [wikimedia, commonsaudio, wikimediavideo, polyhaven, ambientcg, khronos, fuel, cleveland, wellcome, smithsonian, ...]
```

Nach `khronos` einreihen, vor `openverse`. Zusätzlich `QUELLRANG` in `crawler/lib/dedupe.mjs` ergänzen (sonst Rang 50 und Openverse schlägt `fuel`; Openverse hat keine 3D-Modelle, also praktisch ohne Folgen).

## `config.json`-Eintrag

```json
"fuel": { "budget": 40, "proSeite": 100, "wiederholenNachTagen": 14 }
```

Optional `"ausschliessen": ["GoogleResearch"]` (lässt die 1.033 gescannten Alltagsobjekte weg, entfernt dabei 67 falsch einsortierte „Fahrzeuge“). Ein Lauf braucht 35 Anfragen bei 1,5 s Abstand, rund eine Minute. Der Katalog wächst über das Merge in `crawl.mjs`; Einträge, die Fuel später löscht, bleiben im Bestand, bis die Linkprüfung sie findet.

## `VORSCHAU_HOSTS` in `src/seiten.js`

`['Gazebo Fuel', 'fuel.gazebosim.org (Vorschaubilder und Downloads)']`. Die Landeseite `app.gazebosim.org` wird nur verlinkt, nicht geladen. Nach dem Crawl läuft `thumbs.mjs` mit 2.642 Bildern gegen einen Host; ein eigener Abstand dort wäre höflich (Vorschlag 500 ms). Die Vorschaubilder von Fuel sind PNG oder JPG (Stichprobe: 44 KB).

## Lücken in `crawler/lib/taxonomy.mjs` (nur gelesen, nicht geändert)

Gemessen an den 2.642 Fuel-Einträgen. Fehlend im Zweig „Fahrzeuge & Raumfahrt“:

- `uav`, `quadrotor`, `quadcopter`, `multirotor`, `vtol`, `auv`, `rov`, `ugv`, `usv` (Fuel hat über 20 Einträge „X3 UAV Config n“; „Quadrotor“ steht heute in Sonstiges, die „UAV“-Einträge kommen nur über andere Wörter in Schlagwörtern oder Beschreibung in den Fahrzeugordner)
- `cart`, `golf cart`, `wheelchair`, `caddy`, `buggy`, `atv`, `trailer`, `dumpster truck` (eigene Regel)
- `space station` („International Space Station“ landet in Sonstiges, gehört zu Weltraum), `capsule`, `pickup` (kommt nur über Tags an)
- `subway`, `metro` (R32 und R160 werden nur über Tags erkannt)

Falsche Treffer (zu breit) in derselben Regel:

- `boat` trifft „Boat Shoe“ (Schuhe von GoogleResearch), `van` trifft die Marke „Vans“, `bus`, `train`, `car` treffen Spielzeug („Sorting Bus“, „Baby Car“, „Cars II“). Auch „Car Wheel“ und „Gimbal Small 2D“ landen im Fahrzeugordner. Vorschlag: Schuh-Regel („shoe“, „sneaker“, „boot“, „sandal“) vor der Fahrzeugregel prüfen, `Kleidung & Ausrüstung` ist schon da, wird aber erst nach den Fahrzeugen geprüft.

## Weitere Fahrzeugquellen, die ich nicht gefunden habe

Frei lizenzierte, per API abrufbare Fahrzeugmodelle mit eigener Vorschau und Lizenz je Objekt sind rar. Was nicht trägt: Sketchfab (Bedingungen), Thingiverse und BlendSwap (Konto oder Token, kein Zugang ohne Scraping), Poly Pizza, Kenney, Quaternius (abgelehnt), Objaverse und OpenGameArt-Listen (Entscheidung offen). Wer mehr will, muss eine der beiden Entscheidungen oben treffen.

## Entscheidungen für Fynn

1. **Objaverse** mit Vorschaubildern von Sketchfab bauen? Bringt rund 30.000 Fahrzeuge, aber der Kern der Sketchfab-Bedingungen (Weitergabe aus der Quelle, Kopien der Vorschaubilder) gilt für genau diese Bilder. Rechtliche Prüfung nötig. Ohne Bilder lohnt sich der Adapter nicht.
2. **OpenGameArt** Listenseiten (3D-Art nach Stichwort) freigeben? Eine kleine, aber echte Menge Fahrzeugpakete, nur mit 10 s Abstand. Gehört in `opengameart.mjs` (fundus-2d).
3. **Fuel** einbinden, mit oder ohne GoogleResearch-Scans (1.033 Alltagsobjekte, kein Fahrzeug)?
