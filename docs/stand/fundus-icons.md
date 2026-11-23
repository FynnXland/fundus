# Stand fundus-icons (mehr und vielfältigere Icons)

Zuletzt aktualisiert: 23.11.2026, nachmittags. Sechs Adapter gebaut, `npm test`: 222/222 grün, `tests/adapters-icons.test.mjs`
13/13. Nichts committet, nichts in `index.mjs`, `config.json`, `lib/*`, `publish.mjs`, `thumbs.mjs`, `src/*` angefasst, kein Crawl
gegen `data/katalog`, kein thumbs-Lauf. `iconify.mjs` blieb unverändert (Weg a braucht es nicht, Begründung unten).

## Ergebnis in Kürze

- Neu im Katalog: **14.643 einzelne Icon-Einträge** (plus 1.927 Noto-3D-Einträge, die bis zu deiner Entscheidung aus sind).
  Heute: 263 Sets aus Iconify.
- Gewählt wurde Weg b) über die Upstream-Repositories der Icon-Familien (je eine Datei pro Icon bei `raw.githubusercontent.com`),
  nicht die Iconify-JSON-Dateien. Grund: Für ein einzelnes Icon aus `iconify/icon-sets` gibt es keine eigene Datei, nur die
  Iconify-API (`api.iconify.design/<set>/<icon>.svg`), und die bittet ausdrücklich, nicht für Massenabrufe benutzt zu werden.
- Es kommt **kein neuer Host** dazu: Vorschau und Download liegen alle bei `raw.githubusercontent.com` (steht in
  `VORSCHAU_HOSTS` schon bei Khronos und Godot).
- Für die 556.000 Icons der Liniensets (Lucide, Material, Tabler …) empfehle ich keine Einzeleinträge, sondern eine
  Set-Ansicht im Browser (Vorschlag a2 unten).

## Adapter

| Kürzel | Datei | Quelle | Menge | Lizenz | Anmerkung |
|---|---|---|---|---|---|
| OM | `crawler/sources/openmoji.mjs` | OpenMoji | 2.466 | CC BY-SA 4.0 | ohne Hauttöne (2.040), Bausteine und die 53 Markenzeichen (Subgruppe `brand`: Twitter, Firefox, Github …); die Gruppen extras-openmoji und extras-unicode (OpenMoji-eigene Icons) sind drin |
| TW | `crawler/sources/twemoji.mjs` | Twemoji (jdecked/twemoji) | 1.918 | CC BY 4.0 | 31 Dateien ohne Unicode-Namen übersprungen (Regionalbuchstaben, Tag-Zeichen) |
| NE | `crawler/sources/notoemoji.mjs` | Noto Emoji | 1.665 (2D) | Apache 2.0 | 2D/svg hat keine Flaggen (nur PNG im Font); 3D mit `dreiD: true`, +1.927, **aus** |
| FE | `crawler/sources/fluentemoji.mjs` | Microsoft Fluent Emoji | 1.595 | MIT | Vorschau ist das 3D-PNG, Downloads 3D-PNG, Color, Flat, High Contrast |
| GI | `crawler/sources/gameicons.mjs` | game-icons.net (Repo game-icons/icons) | 4.239 | CC BY 3.0 (123 davon CC0) | Gestalter je Datei, 35 Gestalter |
| SL | `crawler/sources/streamline.mjs` | Streamline Free (webalys-hq/streamline-vectors) | 2.760 | CC BY 4.0 | 21 farbige Stile à 120, Pixel und Freemojis à 250, ohne Markenlogos; Auswahl je Stil per Hash des Pfads (stabil) |
| | `crawler/sources/icons-helfer.mjs` | gemeinsame Helfer | | | Dateiliste von GitHub, Emoji-Namen, Auswahl |

Tests: `tests/adapters-icons.test.mjs` mit Fixtures `tests/fixtures/icons-*` (echte, gekürzte Daten vom 23.11.2026: openmoji.json,
Dateibäume von GitHub, emoji-test.txt, license.txt von game-icons). Geprüft: gültig nach `validateItem`, Kennung, Landeseite,
erster Download, Vorschau-URL und Signatur sind über alle Adapter eindeutig, `dedupe()` verschluckt keinen Eintrag, nur
Whitelist-Lizenzen, alle Bilder bei `raw.githubusercontent.com`, abgeschnittene Dateiliste und fehlende Namensliste führen zu
„nichts liefern“ statt zu halben Listen. Die Fixtures sind in `tests/fixtures/README.md` nicht aufgeführt (Datei gehört dir).

Probelauf (23.11.2026, echtes Netz, Mini-Budget `limit: 400`, nichts geschrieben): alle sechs Adapter liefern gültige Einträge.
Je Adapter drei Vorschaubilder geholt und mit sharp (wie `thumbs.mjs`) auf 160 px gerendert: alle 18 gehen, SVG und PNG,
alle mit `200` und richtigem MIME-Typ. Dazu 72 zufällige Einträge der vollen Listen mit HEAD geprüft (Vorschau, Downloads,
Landeseite): 0 Fehler. Eine Zustandsdatei braucht kein Adapter: Jeder holt seine Liste mit **einer** Anfrage an GitHub
(OpenMoji gar keine, es liest `data/openmoji.json`), das ist kein Etappenlauf.

Laufzeit der Listen: 0,2 bis 1,5 s je Adapter. GitHub-API ohne Token erlaubt 60 Anfragen pro Stunde; ein voller Lauf aller
sechs braucht 5 (Twemoji, Noto, Fluent, game-icons, Streamline) plus 3 bei raw und eine bei unicode.org. Fluent und Streamline
holen den Dateibaum des ganzen Repos (6,8 und 8,4 MB, nicht abgeschnitten; ein abgeschnittener Baum bricht den Adapter ab).
`GITHUB_TOKEN` wird genutzt, wenn gesetzt. Ohne Token teilt sich das Limit von 60 pro Stunde mit `github.mjs` im selben `crawl.mjs`-Lauf
(alle Quellen laufen parallel); die Adapter hier setzen keine eigenen Abstände (`setHostGap`), um die von `github.mjs`, Khronos und Fontsource nicht zu überschreiben.

## Entscheidung Weg a): Einzelicons aus `iconify/icon-sets`

Beleg Iconify (https://iconify.design/docs/api/, Abschnitt Limits): „Public API has limits to prevent abuse and ensure fair usage.
Its main use case is for Iconify icon components to load icons on demand. Any other use is a bonus that should not be abused.“

Zahlen (api.iconify.design/collections, 23.11.2026): 280 Sets, 556.207 Icons. Nach Lizenz: MIT 348.774, Apache-2.0 85.616,
CC BY 4.0 66.135, CC BY-SA 4.0 22.797, CC0 11.321, ISC 6.360, OFL 6.240, CC BY 3.0 4.133, GPL zusammen rund 1.500, übrige klein;
nicht zugelassen (NC): 2 Sets mit 2.295 Icons. 70 Sets mit zusammen 92.155 Icons sind mehrfarbig (`palette: true`).
Die JSON-Dateien im Repo sind groß (`openmoji.json` 9,4 MB, `mdi.json` 815 KB gzip, `lucide.json` 106 KB gzip).

Warum keine Einzeleinträge aus der Iconify-JSON:
1. Jeder Eintrag braucht `preview.thumb` und `downloads[0].url` als echte Adresse, und `thumbs.mjs` holt die Vorschau einmal je
   Eintrag. Für ein Icon aus der JSON gibt es nur die Iconify-API. 3.000 Einträge hießen 3.000 Abrufe dort, 92.000 farbige
   noch mehr: genau der Missbrauch, den die Bedingungen ausschließen.
2. 556.000 Einträge sprengen Index (`karten/` je Eintrag rund 1,3 KB, gemessen: 16.570 Einträge ergeben 21 MB) und den
   Vorschau-Speicher (heute schon 22.069 Dateien in `public/vorschau`, über der Pages-Grenze von 20.000).
3. Die großen farbigen Familien haben eigene Repos mit je einer Datei pro Icon. Dort ist der Eintrag besser (echter Urheber,
   echte Datei, echte Landeseite) und die Last liegt bei GitHub statt bei Iconify.

Was ich stattdessen vorschlage (Entscheidung beim Orchestrator, `publish.mjs` und `src/*` sind nicht meine Dateien):

- **a1, sofort:** die sechs Adapter hier. Sie tragen `collection.id` gleich dem Iconify-Prefix (`openmoji`, `twemoji`, `noto`,
  `game-icons`), „Mehr aus dieser Sammlung“ verbindet sie mit dem vorhandenen Set-Eintrag.
- **a2, Unterindex für die Liniensets (empfohlen, ohne neue Quelle):** Die Set-Detailansicht lädt nach dem Opt-in „Vorschauen von
  Quellen“ die IconifyJSON des Sets (`cdn.jsdelivr.net/npm/@iconify-json/<prefix>/icons.json`, 200, gzip, CORS; oder
  `raw.githubusercontent.com/iconify/icon-sets/master/json/<prefix>.json`) und zeichnet **alle** Icons des Sets selbst als
  Inline-SVG (Rumpf `body` plus `viewBox` aus `width`/`height`). Kostet: keine neue Indexzeile, keine Vorschaudatei, kein Abruf
  der Iconify-API, alle 556.000 Icons sind erreichbar. Für eine Suche nach Icon-Namen quer durch alle Sets zusätzlich ein
  Namensindex beim Veröffentlichen: `public/data/icons/<prefix>.json` mit den Namen des Sets (Schätzung, nicht gemessen:
  556.000 Namen, roh rund 8 MB, gzip 2 bis 3 MB insgesamt, je Set 5 bis 80 KB) und die Suchkacheln wie in `suchindex.mjs`;
  ein Treffer ist (Set, Name) und wird aus der JSON gezeichnet. Das wäre ein eigener Auftrag für fundus-index.
- Wer trotzdem einzelne Iconify-Icons als Einträge will: höchstens wenige Hundert je farbigem Set, Vorschau aus der JSON
  lokal gerendert und als Datei abgelegt, nicht über die API geholt. Dafür müsste `thumbs.mjs` ein `data:`-Rumpf-Format kennen,
  `validateItem` verlangt heute eine http-Adresse. Nicht gebaut.

## Entscheidung Weg b): Quellen

Jede Quelle: Lizenz je Datei maschinenlesbar? Nutzungsbedingungen, robots.txt, Hotlinking der Vorschau.

### Gebaut

**OpenMoji** (`openmoji.mjs`)
- Lizenz: https://github.com/hfg-gmuend/openmoji#license: „OpenMoji graphics are licensed under the Creative Commons Share Alike
  License 4.0 (CC BY-SA 4.0)“. Namensnennung laut README: „All emojis designed by OpenMoji, the open-source emoji and icon project.
  License: CC BY-SA 4.0“. ShareAlike greift erst bei Bearbeitung (docs/RECHT.md). Gesetzt im Adapter, nicht von GitHub gelesen.
- Maschinenlesbar: `data/openmoji.json` (Hexcode, Gruppe, Namen, Schlagworte, Gestalter). Die Lizenz gilt für das ganze Repo einheitlich.
- robots.txt (openmoji.org): `Allow: /`, dazu die Bitte an KI-Crawler „please use our GitHub repo instead“. Der Adapter liest nur das Repo.
- Hotlinking: `raw.githubusercontent.com/hfg-gmuend/openmoji/master/color/svg/<HEX>.svg`, 200, `image/svg+xml`, CORS offen.
- Landeseite ist die Datei auf GitHub (`…/blob/master/color/svg/<HEX>.svg`), nicht `openmoji.org/library/emoji-<HEX>/`: diese Seiten gibt es nicht für jedes Emoji (404 bei 1FA8D und 1F6C7).

**Twemoji** (`twemoji.mjs`, Repo jdecked/twemoji, die Fortführung von Twitters Repo)
- Lizenz: https://github.com/jdecked/twemoji#license: „Graphics licensed under CC-BY 4.0“ (Code MIT, `LICENSE-GRAPHICS` ist der
  CC-BY-Text). GitHubs Lizenzfeld zeigt MIT (den Code), darum setzt der Adapter die Grafiklizenz selbst. Nennung: „Twemoji by
  Twitter, Inc and other contributors“.
- Dateinamen sind nur Hexcodes; Titel und Gruppe aus der Unicode-Datei `emoji-test.txt` (https://unicode.org/Public/emoji/latest/emoji-test.txt,
  robots.txt von unicode.org sperrt nur `/draft/`).

**Noto Emoji** (`notoemoji.mjs`)
- Lizenz 2D: `2D/svg/LICENSE` „Licensed under the Apache License, Version 2.0“; README: „Tools and most image resources are under
  the Apache license, version 2.0“; Flaggen (third_party/region-flags) seien gemeinfrei. GitHubs Lizenzfeld zeigt OFL (die
  Schriften), darum wird die Lizenz im Adapter gesetzt.
- **3D (`dreiD: true`, standardmäßig aus):** `3D/png/512/` hat keine eigene Lizenzdatei, nur die Sammelaussage „most image
  resources“. Das ist für diese Dateien kein klares Recht, deshalb Entscheidung bei dir (Vorschlag: aus lassen, bis Google es im
  Repo klarstellt). Dazu 150 bis 250 KB je Bild, rund 400 MB für den Vorschaulauf.

**Fluent Emoji** (`fluentemoji.mjs`)
- Lizenz: `LICENSE` im Repo, „MIT License, Copyright (c) Microsoft Corporation“, kein abweichender Ordner. MIT verlangt, dass
  der Lizenztext bei Kopien mitgeht: das liegt bei dem, der die Datei weitergibt (wie bei allen MIT-Einträgen im Katalog).
- Struktur `assets/<Name>/{3D,Color,Flat,High Contrast}/…`; Emoji mit Hautton haben eine Ebene mehr, genommen wird `Default`.
  Die 3D-PNGs sind echte Dateien (38 KB), keine Git-LFS-Zeiger.
- Der Katalog hat `iconify:fluent-emoji` (das Set) nicht; diese Einträge sind also neu.

**game-icons.net** (`gameicons.mjs`)
- Lizenz: `license.txt` im Repo: „Icons provided under the Creative Commons 3.0 BY or CC0 if mentioned below“; CC0 ist für Viscious
  Speed und Zeromancer vermerkt, der Adapter liest das aus der Datei. Nennung laut https://game-icons.net/about.html: „Icons made by
  {author}. Available on https://game-icons.net“. GitHub zeigt NOASSERTION, darum gesetzt.
- robots.txt (game-icons.net): `Allow: /`. Die Seite selbst wird nicht gelesen, nur verlinkt (`/1x1/<gestalter>/<icon>.html`, 200).
- Der Katalog hat die Icons schon als Set `iconify:game-icons`; diese Einträge sind die einzelnen, mit richtigem Gestalter.

**Streamline Free** (`streamline.mjs`)
- Lizenz: README von Repo und Familienordnern: „Creative commons license: Attribution 4.0 International (CC BY 4.0)“, dazu
  „provide a link to the Streamline website (http://streamlinehq.com)“ und „Redistribution is encouraged as long as you follow
  the license terms“. Der Link steht als `creator.url`; die Karte sollte den Urheber verlinken. Die Lizenzseite
  streamlinehq.com/free/license antwortete dem Bot mit 429, die READMEs tragen den Text.
- Auswahl: nur farbige Stile (Allowlist `STILE` im Adapter). **Draußen:** `logos` (Markenlogos unter einem Pauschal-CC-BY, die
  Rechte der Marken bleiben bei den Marken), `memes`, `nasty-icons`, `covid` und alle einfarbigen Stile (line, solid, remix; die
  hat Iconify als Sets).
- Auswahl: `jeStil` (120) Dateien je Stil, gewählt über einen Hash des Pfads (die kleinsten Hashes). Das ist stabil: kommt oben eine Datei
  dazu, ändert sich höchstens eine Wahl (Test). Eine Auswahl nach Position würde sich bei jedem Lauf verschieben, und weil `crawl.mjs` nie Einträge
  entfernt, wüchse der Bestand samt Vorschaubildern gegen die 30.000.
- Markenzeichen: Pfade mit „logo“/„logos“ (nicht „logout“), eine Liste bekannter Markennamen (Facebook, Spotify, Slack, Netflix …) und `computer-devices/apple`
  sind ausgenommen, weil die Familien einzelne Markenicons enthalten (z. B. `figma-logo`, `pixel/logo/*`, `computer-devices/facebook-1`). Eine Wortliste ist nicht
  vollständig: Was durchrutscht, kommt über `data/gesperrt.json` raus.

### Nicht gebaut, mit Beleg

| Quelle | Entscheidung | Beleg |
|---|---|---|
| unDraw | draußen | https://undraw.co/license: „This license does not include the right to compile assets, vectors or images from unDraw to replicate a similar or competing service“, auch „automated … ways to link, embed, scrape, search or download“ ohne Zustimmung, und Verbot, sie „in packs“ weiterzugeben |
| Icons8 | draußen | `icons8.com/license` und `/terms` antworten dem Bot mit 403 (Sperre, wird respektiert). Laut Hilfecenter (über Websuche gefunden, nicht direkt gelesen): kostenlos nur mit Link zurück, Weitergabe „strictly prohibited“ (https://intercom.help/icons8-7fb7577e8170/en/articles/4732904-how-can-i-use-icons). Ausnahme: das MIT-Repo `icons8/flat-color-icons` ist über `iconify:flat-color-icons` schon im Katalog |
| Flaticon | draußen | `flaticon.com/legal` 403 für den Bot. Freepik-Bedingungen (https://www.freepikcompany.com/legal): „The use of robots, spiders or any other mechanism … to access, copy or control any part of the Website“ ist untersagt; Gratisnutzung nur mit Link und Namensnennung (Flaticon-FAQ, Websuche), je Datei eigene Lizenz |
| Noun Project | draußen | https://thenounproject.com/legal/terms-of-use/: „crawl“, „scrape“ oder „spider“ von Icons ist „strictly prohibited“, auch bei gemeinfreien Inhalten (Massenkopie) |
| SVG Repo | draußen | https://www.svgrepo.com/page/licensing/: Lizenz je Icon verschieden, „You can't redistribute the material as is in a way similar to the SVG Repo website“ |
| Open Peeps, Humaaans, Open Doodles (Pablo Stanley) | nicht baubar | https://openpeeps.com („Free for commercial and personal use under CC0 License“) und https://www.humaaans.com (CC0). Das sind Baukästen aus Einzelteilen; der Download läuft über `blush.design`, es gibt keine Datei- oder Listen-Adresse je Motiv und kein offizielles Repo (die gefundenen Repos auf GitHub sind Fremdkopien). Ein Eintrag je Bibliothek wäre möglich (CC0 ist belegt), aber ohne stabile Vorschau- und Download-Adresse; bei Bedarf von Hand kuratieren |
| Kenney | draußen (schon durch fundus-2d) | `robots.txt` sperrt `/assets/` und `/downloads/` |
| withicons (34 Stile) | nicht pro Icon | MIT (https://github.com/withevergrow/withicons/blob/main/LICENSE), aber das Repo enthält keine Einzeldateien (Stile werden beim Bauen erzeugt), 10 Sterne, Stand 2026. **Hinweis an den Orchestrator:** `iconify:withicons-*` sind 27 Set-Einträge im Katalog; die Herkunft der 1.000 Motive in 34 „deterministisch erzeugten“ Stilen ist nicht geprüft |
| Commons-SVG-Icons | nicht gebaut | `wikimedia.mjs` kennt die Arten bild, grafik, textur, 3d; `NOT_CLIPART` schließt Icons und Logos mit Absicht aus, die Lizenzen sind je Datei verschieden, viele sind Markenzeichen. Eine Gruppe mit `art: 'icon'` ginge nur mit einer Änderung an `wikimedia.mjs` (fundus-bilder). Mein Rat: nicht lohnend |
| Microsoft Fluent UI System Icons (farbig) | schon als Set | `iconify:fluent-color`, MIT; kein eigener Adapter, weil 890 Icons |
| Lizenz unklar: Noto 3D | aus (siehe oben) | |

## Einbinden (für den Orchestrator)

`crawler/sources/index.mjs`:
```js
import openmoji from './openmoji.mjs';
import twemoji from './twemoji.mjs';
import notoemoji from './notoemoji.mjs';
import fluentemoji from './fluentemoji.mjs';
import gameicons from './gameicons.mjs';
import streamline from './streamline.mjs';
// SOURCES = [..., fontsource, iconify, openmoji, twemoji, notoemoji, fluentemoji, gameicons, streamline, internetarchive, openverse]
```

`crawler/config.json` (alle Optionen sind Vorgaben, `{}` genügt):
```json
"openmoji": {},
"twemoji": {},
"notoemoji": {},
"fluentemoji": {},
"gameicons": {},
"streamline": { "jeStil": 120 }
```
Optionen: `limit` (Obergrenze der Einträge), `hauttoene: true` (OpenMoji, Twemoji, Noto: Hautton-Varianten mit, grob +2.000 bis +4.000 Einträge,
nicht empfohlen), `dreiD: true` (Noto, siehe Lizenz), `jeStil` und `stile` (Streamline).

`crawler/lib/dedupe.mjs`, `QUELLRANG`: nach `'iconify'` einfügen `'openmoji', 'twemoji', 'notoemoji', 'fluentemoji', 'gameicons', 'streamline'`
(sonst Rang 50, hinter Openverse; Überschneidungen gibt es nicht, aber die Regel aus dem Kopf der Datei bleibt dann eingehalten).
Die Bild-Dubletten über dHash gelten nur für `bild`, Icons sind nicht betroffen.

`src/seiten.js`, `VORSCHAU_HOSTS`: kein neuer Host. Nur Namen bei der bestehenden Zeile ergänzen:
`['Khronos glTF Sample Assets, OpenMoji, Twemoji, Noto Emoji, Fluent Emoji, game-icons.net, Streamline', 'raw.githubusercontent.com']`.
Links („Ursprungsseite“) führen auf `github.com`, `openmoji.org`, `game-icons.net` und erst beim Klick; `unicode.org` ruft nur der Crawler.

`crawler/thumbs.mjs`: `raw.githubusercontent.com` hat 1 s Abstand (Standard in `http.mjs`), 14.700 Vorschaubilder wären über 4 Stunden.
Ein Limit nennt GitHub für raw nicht; `politeFetch` weicht bei 429 aus. Vorschlag: `setHostGap('raw.githubusercontent.com', 400)` und in
Etappen mit `--quelle <id>`: erst `fluentemoji` (1.595, PNG), `openmoji`, `gameicons`, `streamline`, dann `twemoji`, `notoemoji`.
Alle SVG laufen durch sharp (`density: 144`), geprüft, siehe Probelauf. game-icons sind weiß auf schwarz (die Quelle hat ein
schwarzes Rechteck im Bild): das werden schwarze Kacheln.

Vorschau-Speicher: +14.700 WebP. Heute 22.069 Dateien in `public/vorschau`, die 20.000-Dateien-Grenze von Cloudflare Pages ist schon
gerissen, der Speicher-Umzug (R2) ist ohnehin fällig.

Erwartete Menge nach dem ersten Lauf (Stand 23.11.2026, Läufe wiederholt nach den letzten Änderungen): 14.643 Icons (plus 263 Sets). `meta.stil` verteilt sich: Emoji 6.299, Spiele 4.239,
Farbig 1.920, 3D 1.595, Illustrationen 340, Pixel 250 (mit Noto 3D: 3D 3.522, gesamt 16.570). Lizenzen: CC BY 4.0 4.678 (Streamline, Twemoji), CC BY 3.0 4.116,
Apache 2.0 1.665, CC BY-SA 4.0 2.466, MIT 1.595, CC0 123 (zusammen 14.643). Gewicht: gemessen im Mittel 1,3 KB je Eintrag in `karten/`; Indexzeilen geschätzt je rund 0,25 KB.
Der Index ist für 100.000+ gebaut (`docs/stand/fundus-index.md`), die Icons liegen als Art `icon` in dessen Teilen zu 500.

## Vorschlag Unterordner (`crawler/lib/taxonomy.mjs`, nur Vorschlag)

Heute: Allgemein, Marken & Logos, Emoji, Flaggen & Karten. Die Adapter setzen `meta.stil`, aber `unterkategorie()` schaut zuerst
auf den Titel (Wortanfänge) und nie auf `meta.stil`. Gemessen mit der heutigen Regel an den 16.570 Probeeinträgen:
- game-icons: 4.214 von 4.239 in „Sonstiges“, Streamline 2.331 von 2.760 in „Sonstiges“;
- „Flaggen & Karten“ fängt Titel wie „Flag: …“ (richtig) und Wörter mit `map` am Anfang (falsch, z. B. „maple leaf“), die Emoji-Flaggen
  und der Rest: OpenMoji 334, Twemoji 278, Noto 294 (2D und 3D zusammen gezählt), Fluent 16, Streamline 173 Einträge dort.
- Emoji landet über das Schlagwort `emoji` im richtigen Ordner (OpenMoji 2.088, Twemoji 1.626, Noto 3.298, Fluent 1.579).

Vorschlag: Icon-Ordner `Emoji`, `3D`, `Farbig`, `Illustrationen`, `Pixel`, `Spiele`, `Marken & Logos`, `Flaggen & Karten`, `Allgemein`
(Allgemein = einfarbige Linien und Glyphen, wie bisher), und vor den Regeln:
```js
const ICON_STILE = new Set(['Emoji', '3D', 'Farbig', 'Illustrationen', 'Pixel', 'Spiele']);
export function unterkategorie(item) {
  if (item.kind === 'icon' && ICON_STILE.has(item.meta?.stil)) return item.meta.stil;   // Stil vor Titel
  // … wie bisher
}
```
Für die vorhandenen Iconify-Set-Einträge (`meta.kategorie` aus Iconify: „UI Multicolor“, „High Detail Multicolor“, „Emoji“, „Logos“, „Flags“,
„Thematic“) ergänzen: `R('Farbig', 'multicolor')` vor `Allgemein`, und `meta.kategorie` in `rest` vor den Titel ziehen, sonst
sortiert ein Set wie „Flat Color Icons“ nach seinem Namen. Das ändert die Ordner der 263 Sets, bitte mit `tests/taxonomy.test.mjs` prüfen.
Stiltags stehen in den Adaptern vorn (`emoji`, `farbig`, `spiele`), weil `publish.mjs` je Zeile nur die ersten acht Schlagworte behält.

## Vorschlag `publish.mjs`

Nichts Zwingendes. Zwei Anregungen: (1) für Icons `formate` nur `svg` und `png` zählen lassen (die Adapter liefern `format` sauber);
(2) falls Fynn die Set-Ansicht aus a2 will, braucht `karten/` für Sets die Liste der Icon-Namen nicht, die holt der Browser aus der IconifyJSON.

## Offene Punkte

0. `check-links.mjs` würde bei 14.600 neuen Einträgen die Landeseiten bei `github.com` (blob und tree) tausendfach abrufen und 429 bekommen; die zählen dort als „unklar“. Besser für diese Quellen nur die Vorschau-Adresse prüfen (`raw.githubusercontent.com`).
1. Noto 3D (1.927 Einträge) ja oder nein: Lizenz der 3D-Dateien ungeklärt (oben).
2. Nennungspflicht: die Karte sollte den Urheber verlinken (Streamline verlangt einen Link auf streamlinehq.com), TASL-Zeile steht bereits in `attribution`.
3. Twemoji: Es gibt zwei Fassungen (Twitters archiviertes Repo und `jdecked/twemoji`). Genommen ist `jdecked`, weil es gepflegt wird; die
   Urheberangabe lautet „Twitter, Inc. und andere Mitwirkende“ laut README.
4. Vier Iconify-Set-Einträge (`iconify:openmoji`, `iconify:twemoji`, `iconify:noto`, `iconify:game-icons`) und die Einzeleinträge zeigen dieselben
   Bilder in verschiedenen Fassungen; gewollt (Set zum Stöbern, Einzelicon zum Finden).
5. Open-Peeps-Bibliotheken von Hand kuratieren, falls Illustrationen gewünscht sind (CC0 belegt, siehe Tabelle).
