# Stand fundus-fma: Free Music Archive

Zuletzt aktualisiert: 26.11.2026. Ergebnis: **kein Adapter**, begründete Absage. Geändert: diese Datei und ein
Punkt in `docs/RECHT.md` (offene Punkte, hinter Freesound). Kein Code, keine Fixture, nichts in `data/`.
`npm test`: 253 von 253 grün (26.11.2026).

## Ergebnis in drei Sätzen

Die Nutzungsbedingungen von freemusicarchive.org verbieten automatisierte Anfragen und Data Mining. Sie verbieten
außerdem direkte Links auf einzelne MP3-Dateien, also genau das, was Fundus für Hörproben und Downloads braucht. Eine API
gibt es nicht mehr, deshalb ist kein Adapter gebaut. FMA-Titel kommen aber erlaubt über Commons und Internet Archive
in den Katalog (siehe unten).

## Geprüft (26.11.2026)

| Punkt | Befund |
|---|---|
| Nutzungsbedingungen | `https://freemusicarchive.org/Terms_of_Use`, Betreiber Tribe of Noise BV (NL), niederländisches Recht. „Restrictions on Use“ lit. d: „You will not provide direct links (deep links) on other websites to specific audio and/or video files (such as mp3 files) that are hosted on the Free Music Archive.“ Lit. e: „You will not attack the Site with automated requests or attempt to data mine the Site.“ Links auf die Seite selbst sind erlaubt („Links to the Site“), solange sie FMA nicht falsch darstellen. |
| robots.txt | Sperrt nur CCBot, ChatGPT-User, GPTBot, Google-Extended, omgili(bot) und FacebookBot. Sitemap unter `files.freemusicarchive.org/…/sitemaps/sitemap.xml`. robots.txt erlaubt also, aber die Bedingungen gehen vor (Fundus-Regel wie bei Openverse und Freesound). Die Sitemap liefert nur Adressen; die Metadaten stünden auf jeder einzelnen Titelseite, das wäre Data Mining. |
| API | Keine. `/api`, `/api/get/tracks.json`, `/api_info` antworten 404. Die frühere API (mit Schlüssel) ist abgeschaltet. |
| Bot-Sperre | Keine Cloudflare-Abfrage, Startseite, Suche und Bedingungen antworten 200 mit einem Bot-User-Agent. Daran scheitert es nicht. |
| Hotlink-Schutz | Nicht getestet. Lit. d verbietet die Direktlinks ohnehin, ein Test hätte nichts geändert. Die Suchseite nennt je Titel `playbackUrl` `…/track/<handle>/stream/` und `downloadUrl` `…/track/<handle>/download/`. |
| Datensatz (Dump) | `github.com/mdeff/fma` (EPFL, ISMIR 2017): 106.574 Titel, Metadaten CC BY 4.0, Audio unter den Lizenzen der Künstler, „meant for research purposes“. Stand 2017, erstellt über die damals noch offene API, viele Titel sind seither weg (heute 175.474 auf FMA, andere Auswahl). Nicht gebaut: Hörproben und Downloads wären wieder Direktlinks auf FMA-Dateien (lit. d), es blieben nur Links auf Titelseiten, und die Linkprüfung müsste FMA automatisiert abfragen (lit. e). |

Nach diesen Prüfungen keine weiteren automatisierten Anfragen an freemusicarchive.org. Für die Zählung unten liefen fünf
einzelne Aufrufe der Suchseite mit 4 s Abstand (Umfang wie ein Mensch, der die Lizenzfilter durchklickt).

## Wie viele Titel wären übrig (Zähler der FMA-Suche, 26.11.2026)

| Filter | Titel |
|---|---|
| alle | 175.474 |
| CC BY | 21.912 |
| CC BY-SA | 4.719 |
| Public Domain (laut Bedingungen „Public Domain (United States)“, vermutlich inkl. CC0 und PD-Mark) | 9.553 |
| zum Vergleich CC BY-NC | 22.666 |

Mit `crawler/lib/licenses.mjs` vereinbar wären rund **36.200 Titel** (BY + BY-SA + Public Domain, gut 20 % des
Bestands). `licenses.mjs` nimmt auch „public domain“ ohne CC-Adresse an (`PUBLIC_DOMAIN`). Würde man nur CC BY und
BY-SA zählen, blieben rund 26.600. Der Rest ist NC, ND oder die eigene „FMA-Limited License: Download Only“.
Der kombinierte Filter „Commercial Use + Remix“ zeigte 114.951 und ist offenbar eine Oder-Verknüpfung, deshalb nicht verwendet.

## Was schon erlaubt im Katalog landet

- **Wikimedia Commons (Audio)**: `Category:Free Music Archive` ist schon eine Standardwurzel von `commonsaudio`
  (steht in `data/crawlstand/commonsaudio.json`). Darunter `Category:Audio files from Free Music Archive` mit Unterkategorien
  „by genre“ und „by author“: 154 Kategorien, zusammen rund 13.800 Datei-Zuordnungen (Dateien stehen oft in mehreren
  Genres, eindeutig also deutlich weniger). Die Tiefe reicht (Wurzel → Audio files → by genre → Genre → Datei = 4, `tiefe` 5).
  Im Katalog sind davon bisher 8, weil der Commons-Lauf in Etappen noch am Anfang steht. Nichts zu tun, außer weiter crawlen.
- **Internet Archive**, Sammlung `freemusicarchive` (schon in `config.json`): 16.796 Einträge, 8.794 mit `licenseurl`,
  davon 1.128 ohne NC/ND. Davon sind 714 „FMA_License“ (eigene FMA-Lizenz, zu Recht draußen) und einige „Orphan work“.
  Mit CC BY, BY-SA, CC0 oder PD-Mark bleiben rund 400, darunter viele **länderspezifische Fassungen** (`by/3.0/us`,
  `by-sa/3.0/au`, `by/1.0/fi`, `by-sa/3.0/nl`, `by/2.0/fr` …). Der Stand von fundus-audio nennt 286 Treffer mit der
  Liste aus 12 Adressen (`LICENSE_PATHS` in `internetarchive.mjs`: nur CC0, PD-Mark, BY und BY-SA in 3.0/4.0 ohne
Länderfassung). Das geht genau auf: 131 + 105 + 17 + 16 + 14 + 3 = 286. Es fehlen die Länderfassungen, ältere
Versionen (1.0, 2.0, 2.5) und `licenses/publicdomain/`. **Vorschlag für fundus-audio / Orchestrator:**
  die Lizenzabfrage in `internetarchive.mjs` auf `licenseurl:*creativecommons.org/licenses/by*` bzw. die portierten
  Fassungen erweitern, dann prüfen, ob `licenses.mjs` sie richtig liest (die Regex dort erkennt `by/3.0/au` schon).
  Gewinn grob 100 Einträge. Ich habe `internetarchive.mjs` nicht angefasst (nicht meine Datei).
- **Openverse**: führt FMA nicht (`/v1/audio/stats/`: nur jamendo, wikimedia_audio, freesound). Keine Dubletten von dort.

## Dubletten

Ohne eigenen Adapter braucht es keinen neuen Rang in `QUELLRANG`. Dieselben FMA-Titel können über Commons und
Internet Archive doppelt kommen (verschiedene Dateien, keine gemeinsamen Prüfsummen). `commonsaudio` steht in
`QUELLRANG` vor `internetarchive`, das passt. Ob `dedupe.mjs` solche Paare erkennt (Titel + Urheber), habe ich nicht geprüft.

## Einbindung

Nichts einzutragen in `crawler/sources/index.mjs`, `crawler/config.json` oder `src/seiten.js`.

## Offen für Fynn

- Wer FMA trotzdem direkt will: schriftliche Erlaubnis bei Tribe of Noise anfragen (Metadaten abrufen und auf
  Titelseiten verlinken, ohne Direktlinks auf MP3s, oder mit ausdrücklicher Erlaubnis dafür). Kontakt über die Seite
  „Contact“ auf freemusicarchive.org. Ohne Erlaubnis bleibt es aus.
- Ob der Forschungsdatensatz mdeff/fma (Stand 2017) als reine Titelliste mit Links auf FMA-Seiten taugen würde, wäre
  nur mit dieser Erlaubnis sinnvoll (Linkprüfung und Aktualität).
