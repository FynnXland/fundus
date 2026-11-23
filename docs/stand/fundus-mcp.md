# fundus-mcp: KI-Anbindung (MCP-Server)

Stand 23.11.2026. Lokal fertig und gegen den laufenden Vite-Server geprüft, Tests grün. Der entfernte Zugang lief
als Worker lokal unter workerd (`wrangler dev`, ohne Konto) gegen dieselben Daten, mit Kontaktbogen. Gehostet ist
noch nichts (Cloudflare-Konto fehlt). Nichts committet.

## Ergebnis in drei Sätzen

Ein gemeinsamer Kern liest die öffentlichen statischen Dateien der Website per HTTP (`stand.json`, Indexteile,
Suchkacheln, Kartenteile, Vorschaubilder) und nutzt dieselbe Suche wie die Seite. Darauf sitzen fünf MCP-Werkzeuge,
die es in zwei Zugängen gibt: entfernt über Streamable HTTP unter `https://<seite>/mcp` (nur eine URL eintragen,
gibt direkte Links zurück) und lokal über stdio (`npx -y fundus-mcp`, speichert Downloads samt Lizenzdatei in einen
Ordner). Einen Datenbankserver braucht es nicht, und Dateien der Quellen laufen nie über Fundus.

## Entscheidungen

1. **Kern über die statischen Dateien statt eigener Datenbank.** Die Seite erzeugt schon alles, was die KI braucht,
   in kleinen Stücken (Teile zu 500 Zeilen, Suchkacheln ≤ 64 KB). Der Server bleibt damit zustandslos, kostet im
   Betrieb nichts extra und ist nach jedem `npm run daten` automatisch aktuell (Cache 10 min, wird bei neuem
   `crawledAt` geleert). Die Suche ist eine Kopie von `crawler/lib/suchindex.mjs` (`mcp/src/suchindex.mjs`, weil ein
   npm-Paket keine Dateien außerhalb seines Ordners mitnehmen kann; `npm run sync` kopiert neu, der Test schlägt
   fehl, sobald die Kopie abweicht). `src/katalog.js` ließ sich nicht direkt nutzen (absolute Pfade, Browserzustand).
2. **SDK: `@modelcontextprotocol/server` 2.4.0 (v2), nicht `@modelcontextprotocol/sdk` 1.32.2.** v2 ist laut
   README die stabile Linie und setzt die Spezifikation 2026-07-28 um. Eine einzige Fabrik bedient `serveStdio` und
   `createMcpHandler().fetch` (passt direkt in Workers und Pages Functions). Clients der Protokolle 2025-xx
   bekommen automatisch den zustandslosen Rückfall, geprüft mit einem handgeschriebenen `initialize` für 2025-06-18
   über echte stdio-Pipes und über HTTP. Unter der Bedingung `workerd` wählt das SDK selbst den
   Cloudflare-Validator statt ajv. Versionen exakt in `mcp/package.json`: server 2.4.0, zod 4.6.7,
   @jsquash/webp 1.5.0; nur für Tests: @modelcontextprotocol/client 2.4.0.
3. **Entfernt: als Pages Function neben der Seite (empfohlen).** Eine Datei `functions/mcp.js` im Seitenprojekt
   reicht (siehe unten). Vorteile: gleiche Adresse, gleiches Deployment, die Daten kommen über `env.ASSETS` ohne
   Umweg übers Internet, kein zweites Projekt. Alternativ als eigener Worker (`mcp/wrangler.toml`).
4. **Lokal: npm-Paket `fundus-mcp` (Name ist frei) über `npx`.** Bis zur Veröffentlichung startet man
   `node mcp/src/stdio.mjs`. Nur lokal gibt es `fundus_download`, das wirklich speichert.
5. **Fünf Werkzeuge, englische Namen, Antworten als knapper Text.** `fundus_catalog`, `fundus_search`,
   `fundus_preview`, `fundus_details` und je nach Zugang `fundus_download` (lokal) oder `fundus_download_links`
   (entfernt). Kein `outputSchema` und kein `structuredContent`: viele Clients geben beides ans Modell, das
   verdoppelt die Tokens. Suchtreffer als Tabelle mit Tabulatoren. Die Server-Anweisung (`instructions`) beschreibt
   den sparsamen Ablauf Suche, Kontaktbogen, Details, Download.
6. **Suche lädt nie eine ganze Art.** Eine Wortsuche lädt die Kacheln ihrer Wörter, dann nur die Teile, in denen die
   Treffer der aktuellen Seite liegen. Ohne Wort läuft sie die Teile der Art (oder des Unterordners) der Reihe nach
   ab. Höchstens 12 Indexdateien je Aufruf (`maxAbrufe`), danach Antwort mit Hinweis und Cursor. Der Cursor ist die
   Position (Basis 36). Eine Gesamtzahl steht nur da, wo sie exakt ist (Wortsuche ohne Zeilenfilter,
   `stand.perKind`, `stand.perUnter`); mit Lizenz-, Format-, Quellen- oder Schlagwortfilter gibt es „mehr: Cursor“.
7. **Vorschaupfad aus der ID.** `sha1(id)` → `xx/<14 hex>.webp`, dieselbe Regel wie `vorschauPfad()` in
   `crawler/thumbs.mjs` (Test prüft sie). Eine Vorschau braucht dadurch keinen Kartenteil. Wichtig: Vite und
   vermutlich Cloudflare Pages beantworten fehlende Dateien mit `index.html` und Status 200. Der Kern zählt deshalb
   nur echte WebP-Dateien (Signatur `RIFF…WEBP`) und nur echtes JSON.
8. **Kontaktbogen.** Bild-Tokens wachsen mit der Pixelzahl (Claude: etwa Breite × Höhe / 750). Ein Vorschaubild
   320 × 240 kostet etwa 100 Tokens; dieselben Bilder auf einem Bogen in voller Größe sparen nichts. Gespart wird
   über kleinere Zellen: 160 × 120 sind etwa 26 Tokens pro Eintrag, mit Nummer in der Ecke und Zuordnung
   Nummer → ID im Text. Dekodieren und Kodieren mit @jsquash/webp (WASM), das in Node und in Workers läuft.
   Gemessen: 4 Stühle = 660 × 128 px (etwa 113 Tokens statt 400), 6 = 496 × 252 (etwa 167 statt 600).
   Im Worker nur mit `KONTAKTBOGEN=1`, weil das Dekodieren CPU-Zeit kostet (Gratis-Tarif: 10 ms pro Anfrage);
   sonst Einzelbilder.
9. **Einträge ohne eigene Vorschau** (z. B. 138 von 1.919 3D-Modellen): Der entfernte Server nennt nur die URL des
   Quellbilds, er holt es nie (das wäre der verbotene Proxy). Der lokale Server holt es auf Wunsch
   (`from_source: true`) direkt vom Rechner der Person.
10. **Download (nur lokal).** Nur `id` + Nummer der Download-Option, nie eine freie URL. Pakete (glTF mit Texturen,
    Skill-Ordner) landen in einem eigenen Ordner mit ihrer Struktur. Pfade aus den Daten werden geprüft (kein `..`,
    kein absoluter Pfad, keine reservierten Windows-Namen). Grenze `max_mb` (Standard 500) vor dem Laden und
    während des Streamens. Je Host höchstens 2 Anfragen gleichzeitig, 150 ms Abstand (opengameart.org 1 s),
    ehrlicher User-Agent, kein Referer. 403 und 429 werden respektiert: Abbruch, kein zweiter Versuch. Immer eine
    Lizenzdatei daneben (`<datei>.lizenz.txt`, bei Paketen `LIZENZ.txt`), auch bei CC0 als Herkunftsnachweis. Die
    Lizenzdatei trägt `Fundus-ID: <id>`. Gehört ein vorhandener Datei- oder Paketname einem anderen Eintrag (oder
    einer fremden Datei ohne Lizenzdatei), bekommt der neue Download einen kurzen Hash der ID an den Namen; nichts
    Fremdes wird überschrieben, und Datei und Lizenz passen immer zusammen. `target_dir` muss absolut sein, weil das
    Arbeitsverzeichnis eines MCP-Servers je nach Client zufällig ist.

## Tokens einer typischen Sitzung (gemessen auf den echten Daten, Text ≈ Zeichen / 3,5)

| Schritt | Text | Bild |
|---|---|---|
| Werkzeugliste (einmal, meist zwischengespeichert) | ≈ 1.600 | |
| `fundus_search` „chair“ in 3d, 10 Treffer | ≈ 380 | |
| `fundus_preview` 6 Treffer als Kontaktbogen | ≈ 110 | ≈ 170 |
| `fundus_preview` 1 Treffer einzeln (320 px) | ≈ 20 | ≈ 100 |
| `fundus_details` 1 Eintrag | ≈ 200 | |
| `fundus_download` | ≈ 160 | |
| **Summe Antworten** | **≈ 870** | **≈ 270** |

Rund 1.150 Tokens für die Antworten plus einmal die Werkzeugliste. `fundus_catalog` (Überblick) kostet etwa 350,
mit Art etwa 190. Datenmenge je Sitzung für den Server: `stand.json` 4 KB gzip, 1 bis 2 Suchkacheln (bis 28 KB
gzip), 1 bis 3 Indexteile (je etwa 30 KB gzip), 1 Kartenteil für Details (43 bis 61 KB gzip), Vorschaubilder je 1 bis 5 KB.

## Dateien

| Datei | Inhalt |
|---|---|
| `mcp/package.json`, `mcp/package-lock.json` | eigenes Paket `fundus-mcp` (noch `"private": true`), bin `fundus-mcp` |
| `mcp/src/kern.mjs` | Datenzugriff über HTTP, Suche, Filter, Cursor, Einträge, Vorschau, Namensnennung |
| `mcp/src/suchindex.mjs` | Kopie von `crawler/lib/suchindex.mjs` |
| `mcp/src/werkzeuge.mjs` | die MCP-Werkzeuge und Antworttexte |
| `mcp/src/kontaktbogen.mjs` | Kontaktbogen (Box-Filter, Ziffern 3 × 5, WebP) |
| `mcp/src/codec-node.mjs` | WebP-Codec für Node |
| `mcp/src/laden.mjs` | Download in einen Ordner, Lizenzdatei, Quellbild |
| `mcp/src/stdio.mjs` | lokaler Einstieg (`FUNDUS_URL`, `FUNDUS_DATEN`, `FUNDUS_VORSCHAU`, `FUNDUS_ZIEL`) |
| `mcp/src/http.mjs` | entfernter Einstieg, laufzeitneutral, mit CORS |
| `mcp/src/worker.mjs` | Cloudflare: `onRequest` (Pages Function) und `export default` (eigener Worker) |
| `mcp/wrangler.toml` | nur für den eigenen Worker; Protokolle aus (`observability.enabled = false`) |
| `mcp/scripts/sync.mjs` | kopiert die Suche (auch `prepack`) |
| `mcp/scripts/probelauf.mjs` | echter Lauf gegen eine laufende Seite (stdio und HTTP) |
| `mcp/test/hilfe.mjs` | SDK-Teile für den Test (aufgelöst aus `mcp/node_modules`) |
| `mcp/testdaten/` | 13 echte Einträge (gekürzt) und 3 Vorschaubilder |
| `mcp/README.md` | kurze Paketbeschreibung |
| `tests/mcp.test.mjs` | 23 Tests ohne Netz |
| `docs/KI-ANBINDUNG.md` | Anleitung für Nutzer |

## Prüfung

- `node --test tests/mcp.test.mjs`: 23 von 23 grün. Ohne `mcp/node_modules`: 10 Kerntests grün, 13 übersprungen
  mit Hinweis (geprüft). Die Testdaten baut der Test mit `baueAusgabe`, `zeile` und
  `suchfelder` aus `publish.mjs`, eine Formatänderung im Publish fällt also auf. Der fetch-Stub antwortet bei
  fehlenden Dateien wie ein Single-Page-Host. Abgedeckt: Suche, Paging ohne Doppel, alle Filter, Abrufgrenze,
  Fehlertexte, Vorschau und Kontaktbogen (zurückdekodiert), Details, Links, HTTP mit altem (2025-06-18) und
  aktuellem Client, stdio mit altem Handshake über echte Pipes (stdout nur Protokoll), Download (Paket, Einzeldatei,
  Größengrenze, 403 ohne Wiederholung, Pfade aus den Daten, gleicher Dateiname bei zwei Einträgen, relativer
  Zielordner).
- `npm test` (alle 223 Tests, mit denen der anderen Unterchats): grün.
- Probelauf `node mcp/scripts/probelauf.mjs` gegen `http://localhost:4570`: alle Werkzeuge über stdio, Download der
  STL (4 KB, Wikimedia) samt `.lizenz.txt` in einen Temp-Ordner, Größengrenze, dann HTTP-Zugang (Suche, Vorschau
  ohne Codec, Links). Dazu ein echter Paket-Download Poly Haven „Gallinera Chair“ glTF 2K (5 Dateien, 7,4 MB,
  0,9 s, Ordnerstruktur stimmt). Kontaktbogen angesehen: Nummern lesbar, Stühle erkennbar.
- Worker-Bündel mit esbuild (Bedingungen `workerd`, `worker`): 760 KB, 173 KB gzip, dazu 163 KB gzip WASM, keine
  `node:`-Importe; weit unter der Grenze von 3 MB im Gratis-Tarif.
- Worker unter workerd: `npx wrangler@4.166.0 dev` mit einer Konfiguration im Scratchpad (`main` = `mcp/src/worker.mjs`,
  `FUNDUS_URL=http://localhost:4570`, `KONTAKTBOGEN=1`). Mit dem SDK-Client: alle fünf Werkzeuge, Kontaktbogen aus
  WASM (6 IDs, 248 ms), Details, Links; dazu ein roher `initialize` für 2025-06-18 (Antwort als SSE, 200). Nicht
  geprüft: die Pages-Function-Variante `onRequest` mit `env.ASSETS` (braucht `wrangler pages dev` mit gebauter
  Seite) und die CPU-Zeit im echten Gratis-Tarif.
- `npm pack --dry-run` in `mcp/`: 11 Dateien, 22 KB, `src/suchindex.mjs` dabei.
- Nicht in Claude Desktop oder Cursor selbst ausprobiert; die Clients wurden mit dem offiziellen SDK-Client 2.4.0 und
  handgeschriebenen 2025-Nachrichten nachgestellt. Die Syntax von `claude mcp add` ist gegen `claude mcp add --help`
  der installierten CLI geprüft. Die Menüwege in Claude Desktop („Connectors“, „Add custom connector“,
  Entwickler-Einstellungen) und das Format von `~/.cursor/mcp.json` stehen so in der Anleitung aus dem Wissen über
  die Programme, nicht nachgesehen.

## Einbinden (Orchestrator)

1. `cd mcp && npm install` (einmal; `node_modules/` ist schon in `.gitignore`). Ohne das überspringt `npm test`
   die SDK-Tests mit Hinweis. In `.github/workflows/katalog.yml` vor `npm test` ergänzen:
   `- run: npm --prefix mcp ci`.
2. Dateien committen: `mcp/` (ohne `node_modules`), `tests/mcp.test.mjs`, `docs/KI-ANBINDUNG.md`, diese Datei.
3. Wenn sich `crawler/lib/suchindex.mjs` ändert: `npm --prefix mcp run sync` (der Test erinnert daran).
4. Wenn sich die Benennung der Vorschaubilder in `crawler/thumbs.mjs` ändert: `vorschauPfad` in
   `mcp/src/kern.mjs` mitziehen (der Test prüft beide gegen die Daten).
5. Website-Seite zur KI-Anbindung: Textvorschlag unten, `src/` gehört dir.

## Was für das Hosten fehlt

Für Fynn (selbst anlegen):
- **Cloudflare-Konto** und ein Pages-Projekt für die Seite (braucht es für die Seite ohnehin). Workers Paid
  (5 $ im Monat) nur, wenn der entfernte Server Kontaktbögen zeichnen soll; sonst liefert er Einzelbilder (etwa
  100 statt 26 Bild-Tokens pro Vorschau).
- **Domain** oder die `*.pages.dev`-Adresse festlegen.
- **npm-Konto** für `npx -y fundus-mcp`. Vor dem Veröffentlichen: Lizenz für den Code wählen (Feld `license` fehlt
  bewusst), `"private": true` entfernen, `STANDARD_URL` in `mcp/src/stdio.mjs` auf die öffentliche Adresse setzen,
  dann `npm publish` im Ordner `mcp/` (`prepack` kopiert die Suche).

Für den Orchestrator, sobald das Pages-Projekt steht:
- `functions/mcp.js` im Seitenprojekt:
  ```js
  export { onRequest } from '../mcp/src/worker.mjs';
  ```
  Build-Befehl in Pages: `npm ci && npm --prefix mcp ci && npm run build`. Pages bündelt die Function samt WASM
  selbst. Sicherheitshalber `public/_routes.json` mit `{ "version": 1, "include": ["/mcp"], "exclude": [] }`,
  damit nur `/mcp` als Function zählt.
- Vorschaubilder überschreiten bald 20.000 Dateien (Grenze von Pages, siehe orchestrator.md). Ziehen sie nach R2
  um, im Pages-Projekt `FUNDUS_VORSCHAU=https://<r2-adresse>` setzen (lokal dieselbe Variable).
- Vorab lokal ohne Konto möglich: `npm run build`, dann `npx wrangler pages dev dist` (mit `functions/mcp.js`) prüft
  die Pages-Function-Variante.
- Danach einmal prüfen: `npx @modelcontextprotocol/inspector` gegen `https://<seite>/mcp`, oder
  `node mcp/scripts/probelauf.mjs https://<seite>` für den lokalen Zugang gegen die echte Seite.
- Datenschutzerklärung um einen Absatz ergänzen (Vorschlag unten).

## Vorschläge an `crawler/publish.mjs` (nicht nötig, aber nützlich)

- **Kleinere Kartenteile:** `shardVon` mit 3 statt 2 Hex-Zeichen (4.096 Dateien zu etwa 18 KB statt 256 zu etwa
  290 KB). `fundus_details` lädt dann rund 3 KB statt 50 KB gzip, die Detailansicht der Seite ebenso. Der Kern
  liest `karten/<xx>.json` mit `sha1(id).slice(0, 2)`; bei einer Änderung bitte `stand.index` um die Länge
  ergänzen (z. B. `kartenStellen: 3`), dann stelle ich den Kern darauf um. Dateizahl beachten (Pages-Grenze).
- **Formate je Art** in `stand.json` (`perFormatArt`), damit `fundus_catalog` mit Art die passenden Formate nennt.
- Beobachtet: Bei Khronos lagen Vorschaubilder schon in `public/vorschau/`, die Indexzeilen sagten aber „keine
  Vorschau“ (Publish lief vor dem thumbs-Lauf). Der Server findet die Bilder trotzdem über den Pfad aus der ID; die
  Spalte `preview` in der Suche ist bis zum nächsten `npm run daten` zu vorsichtig.

## Rechtliches

- **Kein Proxy:** Der entfernte Server liefert nur Katalogdaten und die eigenen 320-px-Vorschaubilder, also das,
  was die Seite ohnehin öffentlich ausliefert. Für Dateien und Quellvorschauen gibt er nur Links zurück (Verlinken,
  grün nach `docs/RECHT.md`). Er ruft nie einen Server einer Quelle auf.
- **Lokale Downloads** gehen vom Rechner der Person direkt an die Quelle, auf deren Wunsch, wie ein Download im
  Browser. Grenzen gegenüber den Quellen siehe Entscheidung 10. Sperren (403, 429) werden nicht umgangen.
- **Namensnennung und Lizenz** stehen in jeder Detail-, Link- und Download-Antwort; lokal zusätzlich als Datei.
- **Datenbankrecht:** Der Server öffnet keinen neuen Zugang, er liest dieselben öffentlichen Dateien wie die Seite.
  Die Einschätzung in `docs/RECHT.md` (gelb wegen vollständiger Übernahme einzelner Quellen) gilt unverändert.
- **Datenschutz:** Der Server protokolliert nichts, `observability` ist aus. Cloudflare verarbeitet als Hoster die
  IP-Adresse des MCP-Clients. Das ist je nach Client der Rechner der Person (Claude Code, Cursor) oder ein Server
  des KI-Anbieters (Connectoren in Claude Desktop und claude.ai). Vorschlag für die Datenschutzseite:
  > **KI-Anbindung (MCP).** Unter /mcp kannst du Fundus an KI-Assistenten anschließen. Dabei werden nur die
  > Suchanfragen und abgerufenen Katalogdaten übertragen, die dein Assistent stellt. Wir speichern dazu keine
  > Protokolle. Unser Hoster Cloudflare verarbeitet die IP-Adresse der anfragenden Stelle, um die Anfrage
  > auszuliefern. Je nach Assistent ist das dein Gerät oder ein Server des KI-Anbieters. Dateien lädt dein
  > Assistent direkt bei der jeweiligen Quelle, nicht über Fundus.

  Die Skills `urheberrecht-de-eu:linking-embedding-framing` und `ecommerce-recht:datenschutzerklaerung-tracking-digitale`
  wurden nicht gebraucht: Linkrückgabe und Download vom eigenen Rechner sind durch `docs/RECHT.md` schon abgedeckt,
  und ohne Protokolle gibt es keine zusätzliche Verarbeitung. Vor dem Start mit eigener Domain gehört der Absatz
  in die rechtliche Gesamtprüfung.

## Textvorschlag für eine Seite „KI anschließen“ (für `src/`, Orchestrator)

> **Fundus in deiner KI**
>
> Lass deinen KI-Assistenten für dich suchen. Er findet passende Assets, sieht sich die Vorschau an, bevor er
> etwas lädt, und gibt dir Lizenz und Namensnennung gleich mit. Die Dateien kommen direkt von der Quelle.
>
> **Am schnellsten:** Trag diese Adresse als MCP-Server ein: `https://<seite>/mcp`
> In Claude unter Einstellungen, Connectors, „Add custom connector“. In Claude Code:
> `claude mcp add --transport http fundus https://<seite>/mcp`. In Cursor in `mcp.json` unter `"url"`.
>
> **Mit Speichern in einen Ordner:** `npx -y fundus-mcp` als lokalen MCP-Server eintragen (Node.js ab 20).
> Dann legt dein Assistent die Dateien in einen Ordner und die Lizenz als Textdatei daneben.
>
> Fundus speichert dabei nicht, wer was sucht. Ausführliche Anleitung: KI-ANBINDUNG.

Zahlen auf der Seite (Tokens, Anzahl Einträge) nur aus den Daten, deshalb stehen hier keine.

## Bekannte Grenzen

- Ohne Suchwort kommen Einträge in Index-Reihenfolge (nach Unterordner und Schlagwörtern), nicht gemischt und nicht
  nach Datum; eine andere Sortierung bräuchte alle Teile einer Art.
- Schlagwortfilter vergleicht Wortanfänge in den ersten acht Schlagwörtern und dem Unterordner, wie die Indexzeile
  sie enthält.
- Quellvorschauen (lokal, `from_source`) kommen als einzelne Bilder in ihrer Originalgröße (bis 1,5 MB), nicht im
  Kontaktbogen, weil dafür PNG- und JPEG-Decoder nötig wären.
- Die Antworten nennen Kategorien und Unterordner wie in den Daten, also deutsch.
