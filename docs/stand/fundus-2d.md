# Stand fundus-2d (2D-Grafik, Spiele-Assets, Code)

Zuletzt aktualisiert: 23.11.2026, nachmittags. Fünf Quellen geprüft, vier Adapter gebaut. `npm test`: 150/150 grün,
`tests/adapters-2d.test.mjs` 11/11. Die Adapter sind inzwischen vom Orchestrator in `index.mjs`, `config.json` und
`VORSCHAU_HOSTS` eingetragen und committet; OGA-BY steht in `licenses.mjs`. Der Abschnitt „Einbinden“ unten ist damit erledigt.
(Beim Schreiben dieser Datei lief kein Crawl gegen `data/katalog`; nur Stichproben gegen die echten Quellen.)

## Adapter

| Kürzel | Datei | Quelle | Menge | Art | Lauf |
|---|---|---|---|---|---|
| B1 | `crawler/sources/blender.mjs` | Blender Extensions | ca. 1530 | skript | eine API-Anfrage (schon im ersten Commit) |
| B2 | `crawler/sources/godot.mjs` | Godot Asset Library | 5432 von 5464 | skript (Add-ons) / projekt (Vorlagen, Demos) | 11 Listenseiten + 1 Detail je Asset, 1 s Abstand, 400 Details je Lauf, Stand `data/crawlstand/godot.json`; rund 14 Läufe bis alles drin ist, danach nur Neues und Geändertes |
| B3 | `crawler/sources/openclipart.mjs` | Openclipart | 32 je Lauf | grafik | Atom-Feed `/feed`, eine Anfrage |
| B4 | `crawler/sources/opengameart.mjs` | OpenGameArt | 10 je Lauf | grafik, 3d, textur, musik, sound | `latest/rss.xml`, eine Anfrage, 10 s Abstand (Crawl-delay), kein HTML |

B3 und B4 wachsen nur um das, was der Feed bei einem Lauf zeigt; ohne tägliche Läufe gehen Einträge verloren.
Tests mit Fixtures: `tests/fixtures/godot-assets.json`, `opengameart-feed.xml`, `openclipart-feed.xml`
(echte, gekürzte Antworten vom 23.11.2026). Die Tests schreiben nichts nach `data/`.

## Einbinden

`crawler/sources/index.mjs`, vor `openverse`:
```js
import blender from './blender.mjs';
import godot from './godot.mjs';
import opengameart from './opengameart.mjs';
import openclipart from './openclipart.mjs';
// SOURCES = [..., internetarchive, blender, godot, opengameart, openclipart, openverse]
```

`crawler/config.json`:
```json
"blender": {},
"godot": { "budget": 400, "maxMinuten": 30 },
"opengameart": {},
"openclipart": {}
```
Godot-Optionen: `budget` (Details je Lauf), `maxMinuten`, `abstandMs` (Standard 1000), `stand` (Pfad der Stand-Datei).

`src/seiten.js`, `VORSCHAU_HOSTS` (nur Hosts, von denen Vorschau oder Download wirklich kommt):
- Blender Extensions: **extensions.blender.org** (nur Download, leitet auf `/media/files/…` weiter; keine Vorschaubilder)
- Godot Asset Library: **godotengine.org** (nur Landeseite), Downloads bei **github.com**, **codeberg.org**, **gitlab.com**
  (37 von 40 Stichproben github.com). Vorschaubilder nur von **raw.githubusercontent.com**,
  **user-images.githubusercontent.com**, **media.githubusercontent.com**, **github.com** (`/raw/…` und `…/blob/…?raw=true`,
  leitet auf raw.githubusercontent.com), **gitlab.com** (`…/raw/…`), **codeberg.org** (`…/raw|media/…`).
  Alles andere (Imgur, ibb.co, postimg u. a.) bekommt eine Textvorschau. 4723 von 5464 Icon-Links der Liste bestehen die Prüfung.
- OpenGameArt: **opengameart.org** (Vorschau und Download, `/sites/default/files`, 200 ohne Referer)
- Openclipart: **openclipart.org** (SVG unter `/download/…`, PNG-Vorschau unter `/image/800px/…`, beide 200 mit Bot-UA)

`crawler/thumbs.mjs` muss dieselben Hosts laden dürfen. GitHub-`blob`-Links ohne `raw=true` und GitLab-`blob` liefern HTML
und sind im Adapter schon ausgeschlossen; `github.com/user-attachments/…` läuft nach 5 Minuten ab (S3-Link) und ebenfalls.

## Lizenzen

Neu zu entscheiden (`crawler/lib/licenses.mjs`, `docs/RECHT.md`; ich habe nichts davon angefasst):

1. **OGA-BY 3.0 und 4.0** (opengameart.org/content/oga-by-30-faq, `…/oga-by-40-faq`). Einschätzung: aufnehmbar. Es ist
   CC BY mit einer Zusatzklausel gegen technische Schutzmaßnahmen (DRM), kommerzielle Nutzung ist erlaubt, kein NC/ND.
   Ich habe den Lizenztext in dieser Sitzung nicht neu gelesen; die Einschätzung stammt aus der Prüfung der Vorsitzung, also
   vor dem Eintragen den Text lesen. Heute betrifft es nur OpenGameArt-Einträge, die **ausschließlich** OGA-BY anbieten
   (bietet ein Eintrag zusätzlich CC BY an, nimmt der Adapter CC BY). Im Feed vom 23.11. war keiner dabei. Der Adapter zählt
   solche Einträge im Log („OGA-BY n“). Nach dem Eintragen nimmt `normalizeLicense('OGA-BY 4.0')` sie ohne Adapteränderung auf.
2. **LGPL-2.0**: ein Godot-Asset (Rest der Whitelist ist LGPL-2.1 und 3.0). Unwichtig, Wunsch nur der Vollständigkeit halber.

Schon abgedeckt: Godot nutzt CC0, MIT, Apache-2.0, ISC, Unlicense, CC-BY-4.0, CC-BY-SA-4.0, MPL-2.0, BSD, BSL-1.0, EUPL-1.2,
GPL, LGPL und AGPL (die GPL-Schreibweisen `GPLv3` usw. schreibt der Adapter auf SPDX um). Ausgelassen: Proprietary (31)
und LGPLv2 (1), im Log gezählt. Openclipart ist CC0 laut FAQ; Einträge mit Tag `pd_issue` oder `nsfw` fallen weg.

## Nicht gebaut

- **Kenney**: robots.txt sperrt `/assets/`, `/downloads/` und `/files/` für alle, dazu TDM-Vorbehalt, keine Sitemap.
- **Quaternius**: Downloads nur als Google-Drive-Ordner, manche Pakete unter QAL (kein Weiterverkauf, also nicht offen).
- **Poly Pizza**: API nur mit Schlüssel (401), Doku liefert einen Serverfehler, robots sperrt `/api/` und `/v1/`.
- **game-icons.net**: schon als `iconify:game-icons` im Katalog.
- **Glitch**: Domain leitet auf slack.com weiter.
- **Pixel-Art-Sammlungen auf GitHub**: Sache von `github.mjs` und der Konfiguration `weitere`.

## Offen für den Orchestrator

1. **Openclipart, Sitemaps: entschieden (23.11.2026, Fynn: „Nein, nur Feed“).** Die 38 Sitemaps (rund 186.000 Grafiken ohne
   Urheber und Tags) werden nicht gelesen. Openclipart bleibt beim Atom-Feed (32 neueste je Lauf). Erledigt, nicht wieder aufmachen.
2. **`merge` entfernt nie Einträge**: wird ein Godot-Asset später Proprietary oder gelöscht, bleibt der alte Eintrag, bis die
   Linkprüfung ihn wegnimmt.
3. **Godot-Prüfsummen**: `download_hash` war in allen 44 gelesenen Detailantworten leer; der Adapter übernimmt ihn nur, wenn
   er wie ein sha256 aussieht (Algorithmus ungeprüft).
4. **OpenGameArt-Arten**: gesehen im Feed wurden 3D Art, 2D Art, Music und Texture; „Sound Effect“ und „Concept Art“ sind
   aus Kenntnis der Seite ergänzt. Alles andere (z. B. Document) fällt mit Zählung im Log weg.
5. **Godot-Typen**: „Materials“ (32) und „Shaders“ (168) der Bibliothek laufen als `skript` bzw. `projekt`, wie die
   Bibliothek sie typisiert; nicht als `textur` oder `shader`. Die Art `shader` ist im Katalog für Godot Shaders (godotshaders.com) reserviert.
6. **Arten in `ARTEN`** (`src/katalog.js`): `skript`, `projekt`, `grafik`, `3d`, `textur`, `musik`, `sound` gibt es schon.
   Es kommt keine neue Art dazu.
