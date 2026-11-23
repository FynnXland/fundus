# Stand fundus-audio: Musik und Sounds

Zuletzt aktualisiert: 23.11.2026. `npm test`: 150 von 150 grün (davon 24 in `tests/adapters-audio.test.mjs`, alle ohne Netz).
Live geprüft mit `crawl()` und `cfg.stand` im Scratchpad: Commons 5 Anfragen (237 Dateien), Internet Archive 2 Läufe mit
8 und 5 Anfragen (Fortsetzen mitten auf der Seite). `data/` ist unberührt, es lief kein `thumbs.mjs`.

## Gebaut

| Quelle | Kürzel | Datei | Arten |
|---|---|---|---|
| Wikimedia Commons (Audio) | A1 | `crawler/sources/commonsaudio.mjs` (neu) | musik, sound |
| Internet Archive | IA | `crawler/sources/internetarchive.mjs` (überarbeitet, Etappen) | musik, sound |

Neu: `tests/adapters-audio.test.mjs`, `tests/fixtures/commonsaudio.json`, `tests/fixtures/internetarchive-audio.json`
(echte, gekürzte Antworten vom 23.11.2026; Beschreibungstexte und Ortsangaben sind nicht enthalten).

## Zum Einbinden (Orchestrator)

`crawler/sources/index.mjs`:
```js
import commonsaudio from './commonsaudio.mjs';

export const SOURCES = [wikimedia, commonsaudio, polyhaven, ambientcg, smithsonian, github, fontsource, iconify, internetarchive, openverse].map(...);
```
`crawler/lib/dedupe.mjs`: `commonsaudio` in `QUELLRANG` direkt hinter `wikimedia` eintragen (vor `openverse`; Openverse führt
dieselben Commons-Dateien über `wikimedia_audio`, die Download-Adresse ohne `utm_…` ist der Abgleichschlüssel).

`crawler/config.json`:
```json
"commonsaudio": { "budget": 300, "tiefe": 5, "maxMinuten": 40, "wiederholenNachTagen": 30 },
"internetarchive": {
  "sammlungen": [
    { "id": "netlabels", "art": "musik" },
    { "id": "freemusicarchive", "art": "musik" },
    { "id": "radio-aporee-maps", "art": "sound" }
  ],
  "budget": 600, "maxMinuten": 40, "wiederholenNachTagen": 30
}
```
Ohne `musik`/`sounds` nimmt `commonsaudio` die Standardwurzeln (19 Kategorien, alle am 23.11.2026 auf Commons vorhanden).
Eigene Listen: `"musik": ["…"], "sounds": ["…"]`. Weitere Schalter: `"ausschluss": ["Category:…"]`, `"abstand": ms`.
Die alte Form von `internetarchive` (`"sammlungen": ["netlabels"], "limit", "maxSeiten"`) läuft weiter (Budget = 2 × limit).

Hosts für die Datenschutzseite: bereits eingetragen (`upload.wikimedia.org`, `archive.org` samt `*.archive.org`).
`commons.wikimedia.org` wird nur vom Crawler abgefragt, nie vom Besucher.
Der Quellenname ist bei beiden Commons-Adaptern „Wikimedia Commons“; die Quellenseite listet ihn dann zweimal.
Wer das nicht will, ändert `name` in `commonsaudio.mjs` (z. B. „Wikimedia Commons (Audio)“).

## Wie die Etappen laufen

**Commons** (`data/crawlstand/commonsaudio.json`): Die Suche taugt nicht (`filetype:audio` 4,46 Mio. Treffer, fast nur
Aussprachen; `deepcat:` bricht ab und wird gedrosselt). Stattdessen läuft eine Warteschlange von Kategorien
(`generator=categorymembers`, `gcmtype=subcat|file`, 50 je Anfrage). Je Lauf höchstens `budget` Anfragen, die Wurzel mit den
wenigsten bisherigen Anfragen kommt zuerst (die 50.000 Dateien unter „Audio files of music“ verdrängen die Sound-Wurzeln nicht).
Das ganze `continue`-Objekt wird gespeichert. Drosselung („too many requests“ als Klartext), `maxlag` und Netzfehler beenden den
Lauf, die Warteschlange bleibt. Ist sie leer, beginnt nach `wiederholenNachTagen` ein neuer Durchlauf (nie am selben Tag).
Neue Wurzeln in der Konfiguration werden nachgetragen.
Filter: Aussprachen, Lingua Libre, Hörbücher, Interviews, Vorträge und ähnliche Sprachkategorien (Wortgrenzen, damit
„Reading, Pennsylvania“ nicht trifft), Dateien `LL-Q…`, Sprachpräfix bei Dauer unter 10 s, Bilder und Videos in den
Kategorien, MIDI ohne MP3-Umwandlung, „no restrictions“, NC/ND. Die Art entscheidet die Kategorie der Datei
(Soundeffekt vor Musik), erst danach die Wurzel, damit sie in jedem Lauf gleich bleibt.
Vorschau: die von Commons umgewandelte MP3 (`…ogg.mp3`, ohne Referer geladen, CORS `*`), sonst ein abspielbares Original.
Download: Original ohne `utm_…`, dazu die MP3 als zweiter Download.

**Internet Archive** (`data/crawlstand/internetarchive.json`): Die Scrape-API ignoriert die Abfrage (23.11.2026), `advancedsearch`
liefert nur 10.000 Treffer je Abfrage. Sortierung `addeddate asc`, Zustand ist der Eintrags-Offset je Sammlung; ein Lauf endet,
wenn nötig, mitten auf einer Seite. Ein Fehler bei `/metadata/` (403, 429, 5xx, Zeitüberschreitung) beendet den Lauf, ohne den
Offset zu bewegen; nur 404 und nicht übernehmbare Einträge werden übersprungen. Sammlungen über 10.000 Treffer werden von
beiden Enden gelesen (älteste 10.000 aufsteigend, dann neueste 10.000 absteigend), nicht durch Zerschneiden der Abfrage.
E-Mail-Adressen werden aus Urheber, Titel und Schlagwörtern entfernt; Beschreibung, Uploader-Konto und Aufnahmeort werden nicht übernommen.

Echte Treffer mit der vollen Lizenzliste (12 Adressen, 23.11.2026): `radio-aporee-maps` 58.714 (erreichbar: 20.000),
`netlabels` 5.887, `computoser` 4.484, `freemusicarchive` 286.

## Entscheidungen und Risiken

- `radio-aporee-maps`: Feldaufnahmen eines kuratierenden Kontos (radio aporee). Der Urheber im Feld `creator` ist die Person, die
  aufgenommen hat; Uploader-Mail und Ortsangaben (teils Straße und Hausnummer) werden nicht übernommen. Lizenz wird je Eintrag geprüft.
- `computoser` (4.484, CC BY-SA 4.0, computererzeugte Musik) ist **nicht** in der Konfiguration; zum Aufnehmen
  `{ "id": "computoser", "art": "musik" }` ergänzen. Ob an computererzeugter Musik ein Urheberrecht besteht, ist offen
  und hier nicht geprüft; die Aufnahme ist eine Entscheidung für den Betreiber.
- Ausgeschlossen bleiben `audio_music`, `hifidelity` (Spiel- und Fernsehmusik als CC0), `folksoundomy_music`, `78rpm`,
  `jamendo-albums`, `opensource_audio`, `librivoxaudio`, Podcasts und Radio.
- Commons erreicht über „Sounds by source“ und „Audio files of sound effects“ auch „Files from Freesound.org“ (Dateien, die
  Nutzer unter CC auf Commons hochgeladen haben). Die API-Bedingungen von Freesound betreffen deren API, nicht Commons;
  Openverse liefert dieselben Dateien bereits. Wer sie draußen haben will: `"ausschluss": ["Category:Files from Freesound.org"]`.
- Neuer Durchlauf Internet Archive: kleine Sammlungen setzen hinter dem bisherigen Ende fort (nur neue Einträge), große lesen das
  Fenster der neuesten 10.000 neu.
- Nicht über einen eigenen Adapter gebaut, weil bereits über Commons erreichbar: Incompetech, Filmmusic.io, FreePD, Musopen,
  PDsounds, Xeno-canto, Work With Sounds. Die Hilfsagenten-Prüfung weiterer Quellen ist am Limit abgebrochen und nicht
  wiederholt worden; offen sind also Audionautix und freie Sound-Pakete wie Sonniss. Kenney und OpenGameArt gehören zu fundus-2d,
  Freesound und Jamendo sind ausgeschlossen. `incompetech.com` antwortet auf `curl -I` mit 200, `freepd.com/music/Ambiment.mp3` mit 404 (Dateiname geraten, nicht gewertet).
- Offen: Der echte Crawl steht aus, bis `commonsaudio` in `index.mjs` und die Konfiguration eingetragen sind.
  Danach `node crawler/crawl.mjs --quelle commonsaudio,internetarchive`, dann `thumbs`, `publish`. Commons-Audio hat kein Vorschaubild
  (`preview.thumb` fehlt), die Internet-Archive-Einträge verweisen auf `archive.org/services/img/<id>`.
