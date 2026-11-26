# Stand: fundus-startseite (Logo und Startseite KI-first)

Zuletzt aktualisiert: 26.11.2026 abends. Unterchat, committet und deployt nicht; Einbindung durch den Orchestrator.

## Ergebnis

1. **Eigenes Logo, Variante C „Lupe“** (Fynn hat aus drei Entwürfen gewählt: A Fundstück, B Kiste, C Lupe).
   Runde Lupe, in der Linse ein 2×2-Kachelraster, eine Kachel in Ton-Orange (das gefundene Objekt). Formensprache vom
   fynn.land-Logo (`fynnland/site/assets/logo.svg`): 24er-Raster, abgerundete Kacheln, Deckkraft für Nebenkacheln.
2. **Startseite KI-first:** Oben auf `#/` (ohne Suche und Filter) steht der MCP-Zugang, darunter wie bisher der Katalog.

## Geänderte und neue Dateien

| Datei | Was |
|---|---|
| `public/logo.svg` | Logo, feste Farben hell (Tinte `#1f1e1d`, Akzent `#a6482a`), nur Attribute, kein `<style>` (CSP) |
| `public/favicon.svg` | dunkle runde Fläche `#1f1e1d`, Logo in Creme, Kachel `#e08a68` (ersetzt das „F“) |
| `public/favicon-32.png`, `apple-touch-icon.png` (180, ohne Rundung), `icon-192.png`, `icon-512.png` | aus `favicon.svg` mit sharp gerendert (Skript lag im Scratchpad, nicht im Repo) |
| `index.html` | Favicon-Links (SVG, PNG 32, Apple), Logo als Inline-SVG in `.wortmarke` (`currentColor`, Kachel `.logo__fund` = `var(--akzent)`) |
| `docs/fynnland-eintrag/tile.svg` | Lupe weiß auf transparent; gefundene Kachel voll, die anderen drei mit 40 % wie die Nebenkacheln bei fynn.land |
| `src/main.js` | `kiBlock()`, `kiVerbinden()`, `kopieren()`, `kiTab()`, `startZeigen()`; Einleitung unter „Alle Objekte“ gekürzt |
| `src/styles.css` | Logo (`.logo`, `.logo__fund`), Block `.ki*`, Umbrüche bei 920 und 760 px |

## Startseite im Einzelnen

- Überschrift „Freie Assets für deine KI“, ein Satz mit der Gesamtzahl aus `stand.total` (vor dem Laden ohne Zahl).
- Adresse `https://fundus.fynn.land/mcp` groß in Mono mit Kopierknopf (einziger Akzent-Knopf). Ohne Zwischenablage
  (unsicherer Kontext, verweigert) wird der Text markiert und „Markiert“ angezeigt; Meldung per `aria-live`.
- Satz zum Prinzip: Dateien bleiben bei der Quelle, jede Karte nennt Lizenz und Namensnennung.
- Reiter (ARIA-Tabs, Pfeiltasten) Claude-App / Claude Code / Cursor mit je einer Zeile und kopierbarem Befehl,
  darunter „Andere MCP-Clients: Streamable HTTP, ohne Anmeldung“. Inhalt aus `docs/KI-ANBINDUNG.md`.
- Zwei Beispiel-Prompts zum Kopieren, passend zum entfernten Server (Suche, Vorschauen, Lizenz, Download-Links; kein
  „lade in meinen Ordner“, das kann nur der lokale Server).
- Knopf „Lieber selbst stöbern? Zum Katalog ↓“ scrollt zum Katalog (kein Hash-Link, der Router würde ihn als Seite
  lesen). Die Suche oben in der Kopfleiste bleibt immer nutzbar.
- Sobald gesucht oder gefiltert wird, verschwindet der Block. Auf der Startseite bekommt „Alle Objekte“ `aria-level="2"`,
  damit es nur eine Hauptüberschrift gibt.

## Geprüft

- `npm test`: 259 von 259 grün (vorher ebenso).
- Browser auf 4570 (Dev-Server eines anderen Chats, gleicher Ordner): hell, dunkel, mobil 375 px, Reiter per Klick
  und Pfeiltaste, Kopieren (im Browserfenster der App ohne Zwischenablage, also Rückfall „Markiert“), Suche blendet
  den Block aus und wieder ein.
- Wie in Produktion: `node scripts/web-bauen.mjs` direkt (nicht `npm run build:web`, das ruft `publish.mjs` und
  schreibt `public/data/`), dann der laufende `wrangler dev` auf 4572. CSP-Header kommt an, keine CSP-Fehler in der
  Konsole. Einzige Fehler: 404 für `/vorschau/*`, weil im lokalen R2 nur wenige Testbilder liegen (bekannt).
  `public/data` unverändert.
- Screenshots: `C:\Users\fynnh\AppData\Roaming\Claude\side-session-notes\local_2a8f6cec-2925-4178-ad3d-418c3c763eaa\startseite-screens\`
  (`hell.jpg`, `dunkel-4572.jpg`, `mobil-oben.jpg`, `mobil-unten.jpg`).

## Für den Orchestrator

- **fynn.land-Repo:** `fynnland/site/content/apps/fundus/tile.svg` ist noch das alte Korb-Zeichen. Die neue Kachel aus
  `docs/fynnland-eintrag/tile.svg` dorthin übernehmen (fynn.land-Chat).
- **Hinweis zum Auftrag:** Im Fundus-Repo stand kein fynn.land-Logo; Kopfzeile war nur die Wortmarke, Favicon ein
  „F“. Falls das fynn.land-Logo anderswo erscheint (z. B. im Eintrag auf fynn.land), ist das obige Kachel-Update der Weg.
- **DESIGN.md und Design-System in Claude Design** (nicht meine Dateien) nachziehen: Logo Lupe mit Kachelraster neben
  der Wortmarke; Startblock `.ki` (Adressfeld 18 px = Knopf 12 + 6 Abstand, Befehls- und Beispielzeilen 16 px =
  kleiner Knopf 10 + 6); Beispiel-Prompts in Fraunces als „Stimme“, Befehle in IBM Plex Mono.
- **Favicon 16 px:** Das Raster verschwimmt bei 16 px etwas, Lupe und oranger Punkt bleiben lesbar. Wenn Fynn es
  schärfer will: eigene Kleinvariante ohne Raster (nur Lupe plus Punkt).
- **Folgepunkt, nicht von mir geändert:** `src/main.js` hat im Fehlerzustand `onclick="location.reload()"` (Knopf
  „Seite neu laden“). Unter `script-src 'self'` blockiert die CSP Inline-Handler, der Knopf tut in Produktion nichts.
  Lösung: Klasse oder id plus `addEventListener` wie bei `#nochmal`.
- `.claude/launch.json` ist in `git status` geändert, aber nicht von mir.
- **`dist/` enthält meinen unkommittierten Stand** (für die 4572-Prüfung neu gebaut). Vor `wrangler deploy` bewusst neu
  bauen, nicht ungesehen ausliefern.
- **Kleine Abweichungen von der gezeigten Vorschau:** In der Vorschau waren alle vier Kacheln der weißen fynn.land-Kachel
  voll weiß; eingebaut sind drei mit 40 % und die gefundene voll (auf `#3d2c25` geprüft, gut sichtbar). Im Favicon sind
  Ring und Griff etwas kräftiger (2,4 / 3,2 statt 2,2 / 3), damit es klein trägt.
- Kopieren: Erfolgsweg mit nachgebildeter Zwischenablage geprüft („Kopiert“, Meldung, Rückstellung nach 1,8 s, Cursor-JSON
  korrekt). Ein echter Schreibvorgang in die Zwischenablage war im App-Browser nicht zu beobachten.
