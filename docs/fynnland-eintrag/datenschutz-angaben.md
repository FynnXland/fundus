# Fundus: Angaben für den Datenschutz-Abschnitt auf fynn.land

Grundlage ist der Stand im Code am 23.11.2026 (Commit nach `8b30e9d`). Das ist eine Sammlung von Fakten, kein fertiger
Text. Den Text schreibt der fynn.land-Chat nach `docs/RECHT-TEXTE.md`, und Fynn gibt ihn frei.

## Was der Worker pro Anfrage sieht

- Cloudflare verarbeitet jede Anfrage an fundus.fynn.land wie bei fynn.land: IP-Adresse, User-Agent, angefragter Pfad,
  übliche HTTP-Header.
- Workers Logs und Traces sind aus (`wrangler.jsonc`: `observability.enabled`, `logs.enabled` und `traces.enabled`
  sind alle `false`). Fundus selbst schreibt kein Protokoll.
- Das Skript läuft nur für `/vorschau/*` und `/mcp`. Alle anderen Pfade liefert Cloudflare direkt als statische Dateien
  aus (`run_worker_first`).

## Was gespeichert wird

- **Ratenlimit, nur `/mcp`:** Workers-Rate-Limiting-Binding `RL_MCP`, 60 Anfragen pro Minute. Der Schlüssel ist ein auf
  8 Byte gekürzter SHA-256-Hash aus `fundus-limit|<IP>` (`worker/schutz.mjs`). Der Zähler lebt 60 Sekunden. Die IP selbst
  wird nicht gespeichert. Seite und Vorschaubilder haben kein Limit.
- **GUARD:** Der Worker fragt höchstens einmal pro Minute den Zustand des Not-Aus bei `fynnland-admin` ab
  (`env.GUARD.state()`). Dabei gehen keine Daten über Besucher mit.
- **Edge-Cache:** Vorschaubilder aus R2 legt der Worker im Cloudflare-Cache ab (`caches.default`, ein Tag). Das sind
  Bilddateien, keine Daten über Besucher.
- **R2-Bucket `fundus-vorschau`:** nur die Vorschaubilder (WebP, 320 px). Keine Daten über Besucher.
- **Browser (localStorage):** drei Einstellungen, nur wenn der Besucher sie ändert:
  `fundus.vorschau` (Vorschauen von den Quellen laden: ja/nein), `fundus.thema` (hell/dunkel), `fundus.ansicht`
  (Raster/Liste). Keine Cookies, kein sessionStorage, kein IndexedDB. Ein Knopf auf der Datenschutzseite von Fundus
  löscht alle drei.

## Dritte im Browser

- **Ohne Zustimmung keine.** Schriften (Fraunces, IBM Plex Mono) sind mitgebündelt (`@fontsource` im Build), es gibt
  keine CDNs, keine Analyse und keine Einbettungen. Katalogdaten und kleine Vorschaubilder kommen von
  fundus.fynn.land selbst.
- **Erst nach Zustimmung** („laden“ einmal oder „Immer laden“) holt der Browser große Vorschauen, Hörproben,
  Schriftproben und 3D-Modelle direkt bei der Quelle. Vorher nennt die Seite den Server, der die IP erfährt. Die
  vollständige Liste der Hosts steht in `src/seiten.js` (`VORSCHAU_HOSTS`): Openverse und die dort verzeichneten
  Anbieter, upload.wikimedia.org, cdn.polyhaven.org, dl.polyhaven.org, acg-media.struffelproductions.com,
  cdn.jsdelivr.net (Schriftproben), api.iconify.design, archive.org samt Download-Servern,
  openaccess-cdn.clevelandart.org, iiif.wellcomecollection.org, raw.githubusercontent.com, fuel.gazebosim.org,
  Godot-Hosts (GitHub, GitLab, Codeberg), opengameart.org, openclipart.org.
- **Downloads und Links zur Ursprungsseite** gehen direkt zur Quelle. ZIP-Pakete baut der Browser selbst aus Einzeldateien
  der Quelle (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`). Nichts davon läuft über einen Fundus-Server.
- Die Seite setzt `Referrer-Policy: no-referrer`.

## Was `/mcp` entgegennimmt

- JSON-RPC-Nachrichten eines MCP-Clients (Streamable HTTP): Suchbegriffe, Filter, Eintrags-IDs. Antworten sind Text
  aus dem Katalog und einzelne Vorschaubilder.
- Der Endpunkt liest nur den Katalog (statische Dateien) und die Vorschaubilder aus R2. Er ruft keine fremden Server
  auf. Remote gibt es nur `fundus_download_links`, das Links liefert und nichts herunterlädt.
- Gespeichert wird nichts außer dem Ratenlimit-Zähler oben. Es gibt keine Sitzungen über Anfragen hinweg und kein Konto.

## Offen, Entscheidung Fynn

- Rechtspunkt: Fundus liefert rund 50.000 eigene Vorschaubilder fremder Werke selbst aus, alle unter Lizenzen, die
  Kopie und Weitergabe erlauben, mit Urheber und Lizenz an der Karte. Das ist mehr als ein reiner Link und muss vor dem
  Start entschieden sein.
- Impressum: Zeile für fundus.fynn.land ergänzen. Fundus hat bisher eigene Seiten „Impressum“ und „Datenschutz“ mit
  Lücken (`src/seiten.js`, `src/betreiber.js`). Wenn die fynn.land-Seiten gelten, verlinken sie stattdessen dorthin.
