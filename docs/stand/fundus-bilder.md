# Stand: Bilder, Materialien, 3D (Unterchat fundus-bilder)

Zuletzt aktualisiert: 23.11.2026. `npm test`: 169 von 169 grün (`tests/adapters-bilder.test.mjs`: 51 Tests). Nichts committet, nichts in `index.mjs`, `config.json`, `src/seiten.js` geändert. Hinweis: `git status` im Projektordner meldet „On branch main“ mit einem Commit und vielen geänderten Dateien anderer Chats, die Übergabe sagte „kein Git“. Ich habe kein Git benutzt.

## Entscheidungen für Fynn und den Orchestrator (zuerst lesen)

1. **Rijksmuseum (C5) erst nach Entscheidung eintragen.** `https://iiif.micr.io/robots.txt` enthält einen von Cloudflare verwalteten Block (`User-agent: *`, `Content-Signal: search=yes,ai-train=no,use=reference`, `Allow: /`, dazu Sperren für viele KI-Crawler) und danach, nach `# END Cloudflare Managed Content`, die Zeilen `User-agent: *` und `Disallow: /`. Nach RFC 9309 heben sich `Allow: /` und `Disallow: /` für dieselbe Gruppe auf (gleich lang, erlaubt gewinnt), das Museum bietet den IIIF-Dienst selbst zur Nachnutzung an und jedes Vorschaubild wird einmal geholt. Die Datei ist trotzdem widersprüchlich. Das ist eine Entscheidung, keine Programmierfrage. Der Adapter selbst liest nur `data.rijksmuseum.nl/oai` (kein robots.txt dort, Azure-404).
2. **SMK (C3):** nur eintragen, wenn der Vorschaulauf lange Wartezeiten verträgt (siehe Risiken). Besucher, die „Vorschauen von Quellen“ einschalten, warten bei kalten Bildern bis zu 84 s auf die große Vorschau.
3. **NGA (C4), Lizenzzuordnung ist eine Annahme.** Belegt ist: Datensatz unter CC0 (README und Seite „Free Images and Open Access“), Datenwörterbuch: `openaccess` „1 = open access image with no usage restrictions“, Seite (im Browser gelesen, 23.11.2026): „Images of these works are available free of charge for any use, whether commercial or non-commercial.“ Das Wort CC0 steht dort nur für die Daten, nicht für die Bilder. Der Adapter führt die Bilder trotzdem als CC0. Wer das für zu weit hält, ändert `license: 'cc0'` in `nga.mjs` oder lässt die Quelle weg.
4. **Europeana (C6) nicht in die Liste eintragen**, bis ein Projektschlüssel da ist (laut Terms genügt ein persönlicher Schlüssel nicht für den Betrieb) und ein Probelauf die Datengeber-Hosts bestätigt hat. Der Adapter ist live ungeprüft, die Fixture nachgebaut.

## Gebaut

`stand-helfer.mjs` ist kein Adapter (nur Zustandsfunktionen), nicht in `index.mjs` eintragen.

| Code | Quelle | Datei | Menge (aus der Quelle) | Zustand |
|---|---|---|---|---|
| (alt) | Wikimedia Commons in Etappen | `wikimedia.mjs` | Featured ~22.800, Valued ~56.600, Quality ~474.900, Clipart ~3.100, Texturen ~370, STL ~7.800 | `data/crawlstand/wikimedia.json` |
| C1 | Cleveland Museum of Art | `cleveland.mjs` | 41.902 CC0 mit Bild | `cleveland.json`, `cfg.budget` Seiten à 200 |
| C2 | Wellcome Collection | `wellcome.mjs` | 76.029 (pdm, cc-by, cc-0); erreichbar mindestens rund 53.000, siehe Lücke | `wellcome.json`, ein Strang je Lizenz, Typ, Zeitfenster |
| C3 | Statens Museum for Kunst | `smk.mjs` | 39.548 public_domain mit Bild | `smk.json` |
| C4 | National Gallery of Art | `nga.mjs` | 63.890 offene Hauptbilder | `nga.json` (letzte Objektnummer), `cfg.limit` Einträge je Lauf |
| C5 | Rijksmuseum | `rijksmuseum.mjs` | 848.910 Objekte, davon bei den ersten 50 Sätzen 48 PDM und 2 geschützt | `rijksmuseum.json` (OAI-Token), `cfg.budget` Seiten à 50 |
| C6 | Europeana | `europeana.mjs` | unbekannt | nur mit `EUROPEANA_API_KEY`, sonst `[]` und Log |
| C8 | Khronos glTF Sample Assets | `khronos.mjs` | 113 von 153 Modellen (31 CC0 und 40 CC-BY mit 3D-Vorschau, 31 CC0 und 11 CC-BY mit Screenshot, Live-Lauf) | kein Zustand |

Abweichung von der Übergabe: **Rijksmuseum läuft ohne `RIJKSMUSEUM_API_KEY`**. Die alte Schlüssel-API ist abgelöst; OAI-PMH (`data.rijksmuseum.nl/oai`, EDM) braucht keinen Schlüssel und liefert Rechte je Objekt (`edm:rights`).

Nicht vergeben: C7 (Library of Congress), C9. Fixtures in `tests/fixtures/` (Beschreibung in `tests/fixtures/README.md`).

## Zeile für `crawler/sources/index.mjs`

Neue Quellen vor `openverse` (Dedupe-Reihenfolge, direkte Quellen zuerst). Ohne Rijksmuseum und Europeana, bis die Punkte oben entschieden sind:

```js
import khronos from './khronos.mjs';
import cleveland from './cleveland.mjs';
import nga from './nga.mjs';
import wellcome from './wellcome.mjs';
import smk from './smk.mjs';
// import rijksmuseum from './rijksmuseum.mjs';   // erst nach Entscheidung 1
// import europeana from './europeana.mjs';       // erst mit Projektschlüssel
// SOURCES = [wikimedia, polyhaven, ambientcg, smithsonian, khronos, cleveland, nga, wellcome, smk, github, fontsource, iconify, internetarchive, openverse]
```

## `config.json`-Einträge (Vorschlag)

```json
"wikimedia": { "gruppen": [
  { "id": "exzellent", "art": "bild", "kategorie": "Category:Featured_pictures_on_Wikimedia_Commons" },
  { "id": "wertvoll", "art": "bild", "kategorie": "Category:Valued_images_sorted_by_promotion_date" },
  { "id": "qualitaet", "art": "bild", "kategorie": "Category:Quality_images" },
  { "id": "clipart", "art": "grafik", "kategorie": "Category:PD_OpenClipart" },
  { "id": "clipart-openclipart", "art": "grafik", "kategorie": "Category:Images_from_openclipart.org" },
  { "id": "kacheltexturen", "art": "textur", "kategorie": "Category:Tileable_textures" },
  { "id": "nahtlose-muster", "art": "textur", "kategorie": "Category:Seamless_patterns" },
  { "id": "3d", "art": "3d", "suche": "filetype:3d -intitle:Noto" } ],
  "budget": 300, "maxMinuten": 40, "wiederholenNachTagen": 14 },
"cleveland": { "budget": 25, "proSeite": 200 },
"nga": { "limit": 5000 },
"wellcome": { "budget": 40 },
"smk": { "budget": 25, "proSeite": 200 },
"rijksmuseum": { "budget": 30 },
"europeana": { "budget": 20 },
"khronos": {}
```

## Hosts für `VORSCHAU_HOSTS` in `src/seiten.js`

`thumb.wikimedia.org` (fehlt, dort steht nur `upload.wikimedia.org`), `openaccess-cdn.clevelandart.org`, `iiif.wellcomecollection.org`, `iip-thumb.smk.dk`, `api.smk.dk` (Download), `api.nga.gov`, `raw.githubusercontent.com` (Khronos), `iiif.micr.io` (Rijksmuseum), `api.europeana.eu` und die Hosts der Datengeber (Europeana, Downloads).

## Prüfungen mit curl (Bot-UA `FundusBot/0.1`, Browser-UA Chrome 131, ohne Referer)

| Quelle | Vorschaubild | große Vorschau | Download |
|---|---|---|---|
| Cleveland | `openaccess-cdn…/1915.534_web.jpg` 200 image/jpeg (Bot und Browser) | gleiche Datei | `_print.jpg` 200 image/jpeg, `_full.tif` 200 image/tiff |
| Khronos | `raw.githubusercontent.com/…/screenshot.jpg` 200 image/jpeg, ACAO `*` | `.glb` 200, ACAO `*` | `.glb`, `.gltf`, `.bin` 200, ACAO `*` |
| Rijksmuseum | `iiif.micr.io/<id>/full/400,/0/default.jpg` 200, ACAO `*` | `…/1600,/…` 200 (bei 1024-px-Bild nicht abgelehnt) | `…/max/0/…` 200 |
| Wellcome | Bot: 200 image/jpeg, ACAO `*`; Chrome-UA ohne Browser-Header per curl: 403 (WAF), im echten Browser (Pane, Seite example.com, `Image` mit `referrerPolicy no-referrer`): 400, 1024 und 1600 px laden; Werkseite lädt im Browser | wie links | `!3000,3000` und `max` 200 (Bot) |
| SMK | `iip-thumb.smk.dk/…/!1024,/…` 200, ACAO `*`, aber kalt 21 bis 84 s | gleiche Datei | `api.smk.dk/api/v1/download/…` 200 image/jpeg (21 MB), ACAO `*` |
| NGA | `api.nga.gov/iiif/<uuid>/full/!400,400/…` 200, ACAO `*` | `!1024,1024` 200 | `!2048,2048` und `full/full` 200 |

## Risiken und Limits je Quelle

- **Cleveland:** Terms (clevelandart.org/terms-and-conditions, Abschnitt Open Access Collection API): Mengenbegrenzung der Anfragen „at its sole discretion“ möglich, keine Zusage zur Verfügbarkeit. Abstand 1,5 s. robots.txt des API-Hosts sperrt nur Amazonbot; die Seite `clevelandart.org` hat `Crawl-delay: 10` (wird nur als Link genutzt). Der alte Host `openapi.clevelandart.org` gibt es nicht mehr, richtig ist `openaccess-api.clevelandart.org`.
- **Wellcome:** API ohne dokumentiertes Limit (1,5 s Abstand). Die API liefert je Abfrage nur die ersten 10.000 Werke (Seite 101 gibt 400). Lücke: rund 20.000 undatierte PDM-Bilder und die letzten rund 4.800 CC-BY-Digitalbilder werden nicht erreicht (Sortierung nach Datum ändert die Reihenfolge undatierter Werke nicht, geprüft). Die Bild-WAF sperrt Clients ohne Browser-Header (siehe Tabelle), der Bot-UA kommt durch; wird das später auch dem Bot verwehrt, Quelle abschalten. Ein Schnappschuss der ganzen Sammlung liegt unter `data.wellcomecollection.org/catalogue/v2/works.json.gz` (544 MB), ungenutzt.
- **SMK:** API ohne Limitangabe (1,5 s Abstand). Bildserver rendert jede Größe beim ersten Aufruf (21 bis 84 s, danach 1 s); der Adapter nimmt nur `!1024,` (einmal rendern), `thumbs.mjs` braucht Timeout ab 120 s und einen zweiten Versuch. Hunderte kalter Renderanfragen belasten deren Server, daher klein anfangen (`budget` niedrig). Kein robots.txt (API: Express-404).
- **NGA:** `api.nga.gov/robots.txt`: `Crawl-delay: 10` und ein Hinweis, vor dem Crawlen von nga.gov Kontakt aufzunehmen (Whitelisting). Der Adapter holt nur die zwei CSV von GitHub (175 MB je Lauf, 14 s). `thumbs.mjs` muss für `api.nga.gov` 10 s Abstand halten (64.000 Bilder: über sieben Tage Dauerlauf, daher `limit` klein halten). Landeseite `www.nga.gov/collection/art-object-page.<id>.html` (301 auf `/artworks/<id>-<name>`, 200).
- **Rijksmuseum:** 50 Sätze (390 KB) je Anfrage, 848.910 Sätze, also rund 17.000 Seiten für alles; `budget` 30 bedeutet 1.500 Sätze je Lauf. Das Fortsetzungs-Token ist nur eine kodierte Position (`c=<Nummer>`, `until=<Zeitpunkt des ersten Laufs>`), das Token aus der Fixture wurde rund 30 Minuten später erneut abgespielt und lieferte die nächsten 50 Sätze. Die Lebensdauer über Tage ist ungeprüft; ein ungültiges Token antwortet mit HTTP 200 und `<error code="badResumptionToken">`, der Adapter fängt das ab und beginnt dann den Strang von vorn (bei schnell ablaufenden Tokens käme er nie weit). Der Titel steht nur auf Niederländisch. Die XML-Auswertung nutzt reguläre Ausdrücke (keine Abhängigkeit), getestet an vier echten Sätzen; bei einer Schemaänderung (Rijksmuseum hat am 11.06.2026 die EDM-Ausgabe geändert) zuerst `parseRecord` prüfen.
- **Europeana:** Ratenlimits unbekannt, Persönliche Schlüssel nur für nicht-produktive Nutzung (Terms). `previewNoDistribute` wird verworfen. Große Datei bei vielen Datengebern, Hotlink-Verhalten ungeprüft, deshalb nur Link „Bild beim Datengeber“.
- **Khronos:** ein GitHub-API-Aufruf (Dateibaum, 60 pro Stunde ohne Token reichen) und rund 270 Anfragen an `raw.githubusercontent.com` je Lauf. 40 Modelle verlieren ihre Aufnahme wegen Lizenz (ein einziger Eintrag außerhalb von CC0, CC-BY-4.0, CC-BY-SA-4.0 verwirft das Modell, auch Marken-Einträge wie `LicenseRef-LegalMark-Khronos`; DamagedHelmet wegen CC-BY-NC für eine frühere Fassung). `src/karte.js` übergibt `p.dateien ?? {}`, ein fehlendes `dateien` ist unkritisch.

## Nicht gebaut, mit Beleg

- **Library of Congress (C7):** `www.loc.gov/...?fo=json` antwortet automatisierten Clients mit 403 und `cf-mitigated: challenge` (Cloudflare). Sperre, wird respektiert.
- **NASA Image and Video Library:** die JSON-Antworten (Suche, `metadata.json`) haben kein Lizenz- oder Gemeinfreiheitsfeld je Objekt. **NASA 3D Resources** (GitHub): Repository ohne Lizenz (`license: null`), nur der Satz „free and without copyright“, die Nutzungsrichtlinie nennt Ausnahmen. Kein maschinenlesbarer Beleg.
- **Matcaps (nidorx/matcaps):** README, Abschnitt License: Bilder stammen von verschiedenen Webseiten, die Urheber ließen sich nicht mehr zuordnen. Nicht belastbar offen.
- **ShareTextures:** Terms of Service (Stand 10.04.2025) verbieten automatisches Auslesen von Daten und Metadaten, Hotlinking, Einbetten von Downloads und API-Nutzung ohne schriftliche Vereinbarung. Ausgeschlossen.
- **cgbookcase:** geprüft habe ich fünf geratene Rechtspfade (`/terms`, `/terms-of-use`, `/license`, `/about`, `/faq`: alle 404), die robots.txt (nur Kommentarzeilen mit dem DSM-Hinweis, keine Regel) und die Texturseite (Download-Auflösungen und Patreon-Hinweis, keine Download-Adresse). Der Endpunkt `/api/textures` gehört zur eigenen Seite, ohne Dokumentation. Kein belegter Nutzungstext, keine belegten Download-Adressen: nicht gebaut. Das ist keine Sperre, nur fehlender Beleg; mit einer Anfrage an den Betreiber wäre sie möglich.
- **TextureCan:** robots.txt und Startseite angesehen; die Seite sagt CC0 (`/terms`), aber weder eine Liste noch eine API noch Download-Adressen je Material gefunden. Nicht gebaut aus demselben Grund.
- **3dtextures.me:** robots.txt knüpft das Crawlen an Bedingungen des Betreibers, die Downloads liegen in Google-Drive-Ordnern. Nicht gebaut.

## Offen und nicht geprüft

- Live-Antwort von Europeana (kein Schlüssel).
- Lebensdauer der Rijksmuseum-Token über Tage.
- Ein vollständiger Crawl-Lauf jeder neuen Quelle über `crawl.mjs`; geprüft wurden nur Probeläufe mit eigener Zustandsdatei (1 bis 3 Seiten, bei Khronos ein ganzer Lauf, bei NGA 3 Einträge).
- `thumbs.mjs` gegen die neuen Hosts (Wellcome-WAF, SMK-Wartezeiten, NGA-Abstand).
