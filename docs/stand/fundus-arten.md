# Stand fundus-arten: Video und Shader

Zuletzt aktualisiert: 23.11.2026. Ausführlicher Bericht mit allen Belegen und den geprüften, nicht gebauten Kandidaten:
`C:\Users\fynnh\AppData\Roaming\Claude\side-session-notes\local_2a8f6cec-2925-4178-ad3d-418c3c763eaa\neue-arten-video-shader.md`.

## Gebaut

Zwei neue Arten mit je einer Quelle. `npm test`: 81 von 81 grün (davon 9 Tests in `tests/adapters-arten.test.mjs`).
Live geprüft über `crawl()` mit `cfg.stand` im Scratchpad: Commons-Video 1 Anfrage (49 Videos), Godot Shaders 4 Läufe über
alle 21 GPL-Shader (`komplett` erst nach dem letzten gelesenen Shader). Es lief kein `thumbs.mjs`, `data/` ist unberührt.

| Art | Code | Quelle | Adapter | Kürzel |
|---|---|---|---|---|
| `video` (Videos) | VID | Wikimedia Commons | `crawler/sources/wikimediavideo.mjs` | WV |
| `shader` (Shader) | SHD | Godot Shaders | `crawler/sources/godotshaders.mjs` | GS |

Geänderte Dateien: `crawler/lib/schema.mjs` (nur KINDS), `crawler/lib/taxonomy.mjs` (`UNTER.video`, `UNTER.shader`),
`src/symbole.js` (zwei Zeichen ergänzt). Neu: die zwei Adapter, `tests/adapters-arten.test.mjs`,
`tests/fixtures/wikimediavideo-search.json`, `tests/fixtures/godotshaders.json`.

## Zum Einbinden (Orchestrator)

`crawler/sources/index.mjs`:
```js
import wikimediavideo from './wikimediavideo.mjs';
import godotshaders from './godotshaders.mjs';

export const SOURCES = [wikimedia, wikimediavideo, polyhaven, ambientcg, smithsonian, github, godotshaders, fontsource, iconify, internetarchive, openverse].map(({ crawl, ...meta }) => ({ ...meta, crawl }));
```

`crawler/config.json` (neue Schlüssel auf oberster Ebene):
```json
"wikimediavideo": {
  "begriffe": ["drone footage", "aerial view", "timelapse", "slow motion", "waterfall", "ocean waves", "river", "forest", "clouds", "sunset", "snow", "thunderstorm", "volcano", "aurora", "fireworks", "fire", "city traffic", "night city", "train", "aircraft", "birds", "wildlife", "insects", "underwater", "space", "rocket launch", "microscopy", "3d animation", "newsreel"],
  "budget": 100,
  "maxDauer": 600,
  "maxMinuten": 30
},
"godotshaders": {
  "lizenzen": ["cc0", "mit", "gnu_gpl3"],
  "budget": 200,
  "maxMinuten": 30
}
```

`src/katalog.js`, `ARTEN` (Abstimmung mit fundus-index):
```js
  video: { label: 'Videos', einzahl: 'Video' },
  shader: { label: 'Shader', einzahl: 'Shader' },
```

`src/seiten.js`, `VORSCHAU_HOSTS`:
- Wikimedia Commons ergänzen um **thumb.wikimedia.org** (Videoposter und große Vorschau; auch `crawler/thumbs.mjs` muss
  diesen Host laden dürfen). Für die Videoprobe und die Downloads bleibt **upload.wikimedia.org** (steht schon drin).
- Godot Shaders: **godotshaders.com**, nur beim Klick auf einen Download. Keine Vorschau-Hosts, der Codeauszug kommt aus
  den eigenen Daten.

## Lizenzen

Keine neue Lizenz. Video: je Datei aus `extmetadata`, `normalizeLicense` filtert NC und ND. Shader: CC0-1.0, MIT und
GPL-3.0, alle schon in `crawler/lib/licenses.mjs` (GPL-3.0 mit `attribution` und `shareAlike`). „Shadertoy port“ bleibt
draußen (keine eigene Lizenz, Shadertoy-Standard ist CC BY-NC-SA). Bilder von godotshaders.com stehen ausdrücklich nicht
unter der Lizenz, deshalb speichert Fundus keines (nur Textvorschau mit den ersten 12 Zeilen Code).

## Offen für den Orchestrator

1. **Detailansicht Video:** Der Adapter setzt vorerst `preview.type: 'image'` (Poster) und legt das Video in
   `preview.video = { url, type: 'video/webm', height }`. Nötig: `PREVIEW_TYPES` in `schema.mjs` um `'video'` ergänzen
   (gehört mir nach Absprache, sonst dir), dann in `wikimediavideo.mjs` `type: 'image'` zu `'video'` ändern (eine Zeile),
   in `src/karte.js` einen Zweig mit `<video controls preload="none" playsinline poster=… referrerpolicy="no-referrer">`
   erst nach Opt-in, Beschriftung „Videoprobe“, Pausieren beim Schließen und Wechseln wie bei `audio`, und in
   `crawler/check-links.mjs` `item.preview.video?.url` mitprüfen. Safari braucht für VP9-WebM eine neuere Version; die
   MPEG-4-Datei aus `downloads` kann als zweite `<source>` dienen.
2. **robots.txt von commons.wikimedia.org:** `Disallow: /w/` für alle Crawler, also auch `/w/api.php`. Der Adapter nutzt
   wie der Bild-Adapter die Action-API mit eigenem User-Agent (Wikimedia-API-Etikette), nicht als Freibrief durch
   robots.txt. Bitte Fynn informieren; Video und Bild teilen sich den Host-Abstand.
3. **Datenbankrecht (§ 87b UrhG):** Godot Shaders wird komplett übernommen (2.260 Shader: Titel, Autor, 12 Zeilen Code,
   Links). Bilder bleiben draußen, jede Karte verlinkt zurück, trotzdem wäre eine kurze Nachricht an den Betreiber fair.
4. **Optional:** GitHub-Suche `{ "q": "topic:glsl stars:>200", "art": "shader" }` in `github.weitere`, ungeprüft.
5. **Entscheidung Fynn:** Prelinger Archives (Internet Archive) wären eine zweite saubere Videoquelle, bräuchten aber eine
   Änderung der Lizenz-Whitelist (alte CC-URL `creativecommons.org/licenses/publicdomain/`).

## Mengen und Laufzeit

Commons-Video: 208.260 Videos mit mindestens 1280 px Breite insgesamt, über die Begriffsliste erreichbar geschätzt 30.000
bis 60.000 (Schätzung). Suche liefert höchstens 10.000 Treffer je Begriff, daher Etappen in
`data/crawlstand/wikimediavideo.json`. Godot Shaders: 1.714 CC0 + 525 MIT + 21 GPL = 2.260, bei 200 Seiten je Lauf und
2 s Abstand etwa 12 Läufe bis zum vollen Bestand (`data/crawlstand/godotshaders.json`).

## Risiken

- Commons-Video: `SENSIBEL` ist eine Wortliste, kein Filter mit Garantie; Persönlichkeitsrechte prüft Commons nur auf
  Meldung. Originale können über 1 GB groß sein (Größe steht am Download), `maxDauer` 600 s hält lange Filme draußen.
- Godot Shaders: `/wp-json/gds/v1/shaders` ist ein interner Endpunkt und kann sich ändern. Einmal gelesene Shader werden
  nicht erneut gelesen (spätere Lizenzänderung bleibt unbemerkt).
- MIT und GPL verlangen beim Weitergeben den Lizenztext; falls `paket.js` später `.gdshader`-Dateien baut, muss der
  Lizenzhinweis mit hinein.

## Nicht gemacht

Die beiden neuen Zeichen (`video`, `shader`) wurden nicht gerendert angesehen. Pinsel, LUTs und Farbpaletten: keine
saubere Quelle gefunden (Lospec sperrt Exportdateien per robots.txt, Matcaps ohne Lizenz, BlenderKit sperrt `/api/`).
