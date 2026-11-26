# Stand fundus-fma: Free Music Archive

Zuletzt aktualisiert: 26.11.2026 abends. `npm test`: 259 von 259 grün.

Ergebnis: **Kein eigener FMA-Adapter**, die Bedingungen verbieten es (Teil 1). Auf Fynns Wunsch kommen die FMA-Titel
jetzt über die erlaubten Wege (Teil 2):
- **Commons:** 6.326 FMA-Dateien, alle schema-gültig (Probelauf über den ganzen Baum). Sie kommen schon über
  `commonsaudio`, nur langsam; Vorschlag: einmal ein höheres Budget.
- **Internet Archive:** Der Adapter nimmt mehr Lizenzfassungen an (rund 1.470 Treffer mehr, davon rund 90 aus der
  FMA-Sammlung, der Rest Netlabels).

Achtung: Damit kippt die bisherige Regel in `internetarchive.mjs` („ported variants are out“). Die Begründung steht
in `docs/RECHT.md`.

Geändert (nichts committet):
- `crawler/sources/internetarchive.mjs` (gehört eigentlich fundus-audio; auf Fynns Auftrag hier geändert): `licenseFromUrl()`,
  Suche mit Platzhaltern, `LIZENZSTAND` im Crawlstand.
- `tests/adapters-fma.test.mjs` (neu, 6 Tests), `tests/fixtures/internetarchive-portiert.json` (neu, zwei echte,
  gekürzte `/metadata/`-Antworten vom 26.11.2026), ein Absatz in `tests/fixtures/README.md`.
- Je eine Erwartung angepasst: `tests/adapters-neu-1.test.mjs` (`by/3.0/us/` ist jetzt erlaubt) und
  `tests/adapters-audio.test.mjs` (4 statt 12 `licenseurl:`-Klauseln).
- `docs/RECHT.md`: zwei Punkte unter „Offene Punkte“ (FMA-Absage, Länderfassungen).

## Teil 1: Warum kein FMA-Adapter (geprüft 26.11.2026)

| Punkt | Befund |
|---|---|
| Nutzungsbedingungen | `https://freemusicarchive.org/Terms_of_Use`, Betreiber Tribe of Noise BV (NL), niederländisches Recht. „Restrictions on Use“ lit. d: „You will not provide direct links (deep links) on other websites to specific audio and/or video files (such as mp3 files) that are hosted on the Free Music Archive.“ Lit. e: „You will not attack the Site with automated requests or attempt to data mine the Site.“ Links auf die Seite selbst sind erlaubt („Links to the Site“). |
| robots.txt | Sperrt nur KI-Crawler (CCBot, GPTBot, ChatGPT-User, Google-Extended, omgili, FacebookBot), nennt eine Sitemap. Die Bedingungen gehen vor; die Sitemap liefert nur Adressen, die Metadaten stünden auf jeder Titelseite (Data Mining). |
| API | Keine. `/api`, `/api/get/tracks.json`, `/api_info` antworten 404. |
| Bot-Sperre | Keine Cloudflare-Abfrage, alles 200. Daran scheitert es nicht. |
| Hotlink-Schutz | Nicht getestet, lit. d verbietet die Direktlinks ohnehin (`…/track/<handle>/stream/` und `/download/`). |
| Datensatz | `github.com/mdeff/fma` (EPFL, ISMIR 2017): 106.574 Titel, Metadaten CC BY 4.0, „meant for research purposes“, Stand 2017 aus der abgeschalteten API. Hörproben wären wieder Direktlinks auf FMA (lit. d), die Linkprüfung müsste FMA automatisch abfragen (lit. e). |

Zähler der FMA-Suche (26.11.2026, fünf einzelne Aufrufe mit 4 s Abstand): 175.474 Titel, davon CC BY 21.912,
CC BY-SA 4.719, Public Domain 9.553, also rund **36.200** mit `licenses.mjs` vereinbar (nur BY und BY-SA: rund 26.600).
Zum Vergleich CC BY-NC 22.666. Danach keine weiteren Anfragen an freemusicarchive.org.

## Teil 2: Die erlaubten Wege

### Internet Archive: mehr Lizenzfassungen (gebaut)

Bisher nahm `internetarchive.mjs` nur zwölf exakte Adressen an (CC0, PDM, BY und BY-SA in 3.0/4.0). Das erklärt die
286 FMA-Treffer genau (131 + 105 + 17 + 16 + 14 + 3). Jetzt:
- `licenseFromUrl()`: CC BY und BY-SA in 1.0, 2.0, 2.1, 2.5, 3.0, 4.0, mit oder ohne Länderfassung (`/us/`, `/jp/`,
  `/scotland/` …), dazu CC0 und PDM. 4.0 mit Land und 2.1 ohne Land gibt es nicht, also abgelehnt. Eine Länderfassung
  behält ihre Lizenzseite: `CC-BY-SA-3.0-AU`, „CC BY-SA 3.0 AU“, `…/by-sa/3.0/au/deed.de`. Draußen bleiben NC, ND,
  Sampling+, `licenses/publicdomain/`, `choose/publicdomain-2`, „FMA_License“, Deed- und Legalcode-Seiten.
- Suche: vier Platzhalter-Klauseln (`licenseurl:*creativecommons.org\/licenses\/by\/*` usw.). Die Schrägstriche müssen
  maskiert sein, sonst antwortet archive.org mit `BACKEND_ERROR` (live geprüft).
- `LIZENZSTAND = 2` je Sammlung im Crawlstand. Ein Stand ohne diese Marke (also der heutige
  `data/crawlstand/internetarchive.json`) beginnt die Sammlung beim nächsten Lauf bei Offset 0 in derselben Runde.
  Grund: Die neuen Treffer verteilen sich über die ganze Sortierung, mit dem alten Offset würden einige übersprungen.
  Kosten: die bisher gelesenen 198 Einträge je Sammlung werden einmal neu gelesen (rund 600 Anfragen, ein bis zwei Läufe).

Live geprüft (26.11.2026): Die Abfrage funktioniert auch tief im Fenster (`radio-aporee-maps` Seite 100 und
`netlabels` Seite 73, je rund 2 s). Alle 5.787 BY/BY-SA-Adressen in `netlabels` und `freemusicarchive` werden von
`licenseFromUrl()` angenommen, keine fällt durch. Die Lizenzseiten der Länderfassungen gibt es (`by/1.0/fi`,
`by-sa/2.5/scotland`, `by/2.1/jp`, `by-sa/3.0/au`, je `deed.de`, alle 200). `src/karte.js` (`lizenzSatz`) und die
MCP-Lizenzgruppen gehen nach `attribution`, `shareAlike` und `family`, nicht nach festen Lizenz-IDs.

Treffer live mit der neuen Abfrage (26.11.2026): `netlabels` 7.270 (vorher 5.887), `freemusicarchive` 377 (vorher 286),
`radio-aporee-maps` 58.752 (vorher 58.714). Nicht jeder Treffer wird ein Eintrag: Viele alte Einträge der
FMA-Sammlung haben keine erkannte MP3 (Dateien ohne Endung, Format „Motion JPEG“, nur Ogg), die fallen wie bisher heraus.

Probelauf (Scratchpad-Stand, `data/` unberührt): 60 Anfragen, `freemusicarchive` + `netlabels` ab Offset 0, **42
Einträge, alle schema-gültig**. Lizenzen: CC BY 3.0 (15), CC BY 1.0 (13), CC BY-SA 3.0 (7), CC BY 3.0 US (2),
PDM (2), CC BY 1.0 FI, CC BY-SA 3.0 AU, CC BY-SA 2.0 FR.

### Commons: FMA-Kategorie (schon da)

`Category:Free Music Archive` ist schon eine Standardwurzel von `commonsaudio`. Darunter liegt
`Category:Audio files from Free Music Archive` („by genre“, „by author“, 222 Kategorien). Der Code bleibt unverändert.

Probelauf mit dem unveränderten Adapter, nur diese Wurzel, eigener Stand im Scratchpad (`data/` unberührt): **der ganze
Baum in 461 Anfragen, 6.326 Dateien, alle schema-gültig**, 6.031 davon mit Künstlerlink auf freemusicarchive.org.
Art: 6.277 Musik, 49 Sound (Feldaufnahmen). Lizenzen: CC BY 4.0 2.711, CC0 2.159, CC BY 3.0 1.303, CC BY 1.0 91,
gemeinfrei 34, BY-SA zusammen 24, CC BY 2.0 4. Im Katalog sind davon bisher 8.

Warum so wenige: `commonsaudio` hat 300 Anfragen je Lauf und verteilt sie gerecht auf 19 Wurzeln. Die FMA-Wurzel bekommt
also rund 16 Anfragen je Lauf und bräuchte etwa 30 Läufe. **Vorschlag:** einmalig
`"commonsaudio": { "budget": 3000, "maxMinuten": 60, … }` (bei 1 s Abstand rund 50 Minuten), danach zurück auf 300. Am
Ende in `data/crawlstand/commonsaudio.json` nachsehen, dass `seiten["Category:Free Music Archive"]` bei rund 460 steht
und in der Warteschlange kein FMA-Eintrag mehr wartet. Ein Teil des Baums kann auch unter der Wurzel „Audio files of
music by source“ gezählt werden (beide führen hinein, jede Kategorie wird nur einmal eingereiht), dann ist die Zahl dort
kleiner.

### Openverse

Führt FMA nicht (`/v1/audio/stats/`: jamendo, wikimedia_audio, freesound). Keine Dubletten von dort.

## Einbindung (Orchestrator)

- `crawler/sources/index.mjs`, `src/seiten.js`: nichts (keine neue Quelle, keine neuen Hosts).
- `crawler/config.json`: nichts nötig. Wer die FMA-Musik schneller haben will, setzt `internetarchive.budget` für ein
  paar Läufe hoch (etwa 1.500); die Sammlungen teilen sich das Budget gleichmäßig.
- `crawler/lib/dedupe.mjs`: kein neuer Rang. Dieselben FMA-Titel können über Commons und Internet Archive doppelt
  kommen (verschiedene Dateien, keine gemeinsamen Prüfsummen); `commonsaudio` steht vor `internetarchive`, das passt.
  Ob `dedupe.mjs` solche Paare erkennt, ist nicht geprüft.
- Danach wie üblich `node crawler/crawl.mjs --quelle internetarchive,commonsaudio`, `thumbs` (nur wenn kein anderer
  Lauf und kein `r2 bulk put` läuft), `publish`. Die neuen Lizenznamen („CC BY 3.0 US“) erscheinen im Datenblatt.
- fundus-audio sollte wissen, dass `internetarchive.mjs` geändert ist (Kopfkommentar aktualisiert).

## Offen für Fynn

- FMA direkt nur mit schriftlicher Erlaubnis von Tribe of Noise (hat Fynn nicht, 26.11.2026: bleibt aus).
