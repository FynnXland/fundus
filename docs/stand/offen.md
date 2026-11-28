# Offene Aufgaben (Stand 27.11.2026 mittags)

Jede Aufgabe ist so beschrieben, dass ein neuer Chat sie ohne den alten Verlauf übernehmen kann. Vorher lesen:
`CLAUDE.md`, `docs/stand/orchestrator.md` (Abschnitte vom 27.11.2026). Für alle gilt: Commits auf `main` sind erlaubt,
Push und Deploy nur nach Fynns Ja. Der nächtliche Lauf (`.github/workflows/katalog.yml`, 03:17 UTC) crawlt, baut und
veröffentlicht vom gepushten Stand. `crawler/thumbs.mjs` nie starten, während ein anderer thumbs-Lauf läuft.

## 1. Mehr 3D-Modelle, Materialien und HDRIs

Bestand: 7.839 3D-Modelle, 3.490 Materialien, 1.443 HDRIs gegen 112.665 Bilder und 52.394 Musikstücke. GitHub ist
keine 3D-Quelle (23 Repositories mit 3D-Themen und CC-Lizenz).

- Erst prüfen, mit Belegen aus den Bedingungen der Quelle selbst: Lizenz je Datei (nur offen, kein NC/ND, kein bloßes
  „royalty free“), erlaubter Abrufweg (API, robots.txt), Vorschaubilder, erwartbare Menge. Kandidaten: Smithsonian 3D
  (Adapter vorhanden, braucht `SMITHSONIAN_API_KEY`), NIH 3D, Poly Pizza, Kenney, Quaternius, ShareTextures,
  cgbookcase, 3dtextures.me, TextureCan, NASA 3D Resources, SMK (Adapter zurückgehalten), Europeana 3D, MorphoSource,
  Thingiverse, Printables, BlenderKit (nur CC0), OpenGameArt-Listenseiten (Crawl-delay 10 s). Sketchfab ist abgelehnt,
  Objaverse und Noto 3D sind offene Entscheidungen.
- Ergebnis als Tabelle in `docs/stand/fundus-3d.md`, dann Fynn vorlegen (API-Schlüssel, Rechtsfragen). Erst danach bauen.
- Je Quelle: Adapter, Eintrag in `sources/index.mjs` und `config.json`, Fixture, Test in `tests/adapters-3d.test.mjs`,
  Hosts in `VORSCHAU_HOSTS` (`src/seiten.js`), Regeln in `taxonomy.mjs`.

## 2. Skills aus allen GitHub-Skill-Sammlungen

`crawler/sources/github.mjs` liest 59 Sammlungen (44 benannte, bis zu 15 gefundene), Ergebnis 2.167 Skills. Im Bestand
stehen 2.255 Repositories mit Skill-Themen (`claude-skills`, `agent-skills`, `skills`, `claude-code-skills`,
`claude-skill`, `agent-skill`, `codex-skill`, `skill`).

- Kandidaten aus dem Bestand nehmen (`ladeQuelle('github')`), nicht aus neuen Suchanfragen. Kosten vorher messen:
  ein Baum-Aufruf je Repository, ein Rohabruf je `SKILL.md` und je Lizenzdatei.
- Etappen wie beim Sternen-Ring (`sterneRing`, Fortschritt in `data/crawlstand/`): ein Aufhol-Lauf von Hand, nachts nur
  ein kleines Kontingent. Der nächtliche Lauf hat 90 Minuten.
- Dubletten über `skillHash` prüfen (welche Sammlung gewinnt), `UNTER.skill` nach Stichproben erweitern.

## 3. Schriftmuster der GitHub-Schriften

`crawler/thumbs.mjs` (`schriftmuster`) rendert „Aa“ mit Pango über Familienname und Datei. Für `githubschriften`
ist der Familienname der Repository-Name. 267 von 377 sind im Register als endgültig gescheitert markiert, einzelne
gelungene zeigen eine Ersatzschrift (`Accent-Mono` erschien proportional). Fontsource: 293 von 2.074 gescheitert.

- Familiennamen aus der Schriftdatei lesen (Tabelle `name`, IDs 1, 16, 25).
- Den Nachweis schärfen, dass wirklich die Schrift gerendert wurde; mindestens 20 Bilder ansehen.
- Prüfen, ob ein Kindprozess je Schrift Pangos prozessweite Registrierung umgeht.
- Danach die „Schrift …“-Fehler im Register zurücksetzen (bei `githubschriften` auch die gelungenen) und neu erzeugen.

## 4. MCP: Ordner, Verlauf und Konto (Wunsch von Fynn, noch nicht entschieden)

Idee: Eine KI legt über den MCP-Zugang Ordner (Sammlungen) an, die im fynn.land-Konto gespeichert werden; dazu eine
Übersicht für den Menschen, was seine KI wann abgefragt hat.

- Heute gibt es keinen Ordner im MCP-Server und kein Konto: fünf lesende Werkzeuge, ohne Anmeldung, ohne Protokoll.
  Die Datenschutzseite sagt, dass nichts protokolliert wird.
- Vor dem Bauen zu entscheiden: Anmeldung des MCP-Clients am Konto (OAuth über `fynn.land/konto`), Speicherort
  (Kontoserver oder eigener Speicher bei Fundus), was der Verlauf enthält und wie lange, Löschen und Auskunft,
  Texte für Datenschutz und Impressum, Kosten des Speichers. Ohne Anmeldung bleibt der Zugang wie heute.
- Kontosystem: `E:\Entwicklung\08_Auftritt\fynnland\docs\KONTO-STATUS.md` und die `KONTO-*`-Dateien dort.

## 5. Kleinere Punkte

- Tagesdeckel für `/mcp`: Heute gelten 60 Aufrufe je Minute und Besucher (Anthropics Adressen 1.200). Ein einzelner
  Besucher kann damit rechnerisch 86.400 Aufrufe am Tag auslösen.
- `fundus_search` ohne Suchwort liefert die Indexreihenfolge, nicht die beliebtesten Einträge.
- Suche auf der Seite nutzt die Beliebtheit noch nicht (nur der MCP-Server).
- Medizin & Anatomie bei Bildern: `hospital` zieht Gebäudeansichten hinein (5 von 50 Proben falsch).
- 41.990 Projekte und 9.452 Bilder bleiben in „Sonstiges“; mehr ginge nur mit README-Texten bzw. Schlagworten der Quelle.
- fynn.land: Der Fundus-Eintrag nennt seit `f5a5241` „über 560.000 Einträge“; live erst nach einem Deploy der Hauptseite.

## 6. Rückmeldung einer KI zum MCP-Zugang (28.11.2026)

Eine KI hat mit Fundus einen Raum eingerichtet (3D-Möbel, Gemälde) und aufgeschrieben, was fehlte. Erledigt am 28.11.:

- Poly Haven liefert für alle 522 Modelle Maße (mm, z oben), Material und Zustand; Fundus speichert sie jetzt
  (`meta.abmessung` „0,85 × 0,77 × 1,07 m (B × T × H)“, `meta.material`, `meta.zustand`, Material und Zustand auch als
  Tags) und `fundus_details` zeigt sie mit Polygonen und Texturauflösung. Dazu ein glTF-Paket mit 1K-Texturen (letzte
  Option, die Nummern der alten bleiben).
- `fundus_download_links` nimmt `ids` (bis 10) wie `fundus_details`; ein fehlender Eintrag bricht den Rest nicht ab.
- Suchmeldungen: Eine abgebrochene Suche sagt, dass „kein Treffer bisher“ nichts beweist; eine vollständige sagt, dass
  der ganze Index durchsucht wurde, und nennt die wörtliche Suche und deutsche Komposita.

Offen, nach Nutzen geordnet:

- **Maße aus den Modelldateien** (28.11., `crawler/masse.mjs`, Register `data/masse.json`): Khronos (113, aus dem
  JSON-Teil der glTF-Datei, 93 plausibel; über 10 m sind Testszenen) und Fuel (2.642, aus `model.sdf` und nur den
  Mesh-Dateien, Meter, Z oben). Auf der Karte „… m (B × T × H, aus der Datei gemessen)“, im MCP als grob gekennzeichnet.
  Nachts misst der Lauf neue Modelle nach (8 Minuten). Commons-STL bewusst nicht: keine Einheit, 15 GB.
- **Maßbereich als Filter** („Höhe 0,7 bis 0,8 m“): braucht die Maße als Zahlen in den Suchzeilen (`FELDER` in
  `publish.mjs`, eine Spalte), dann ein Parameter in `fundus_search`. Nur Poly Haven hat Maße; Fuel, Commons und
  Khronos nicht.
- **Kleinere Fassungen von Bildern**: Commons liefert jede Breite über die Thumb-Adresse
  (`upload.wikimedia.org/…/thumb/…/<breite>px-…`), Museen oft über IIIF. Eine Option „verkleinert, 2.000 px“ je Bild
  wäre billig; Gemälde kamen mit 7 bis 27 MB.
- **Stil und Epoche**: Kein Quellfeld. Poly Havens Tags enthalten Stilwörter (vintage, victorian, 80's, modern,
  industrial); ein abgeleitetes `meta.stil` aus einer festen Liste ginge, sonst nichts Verlässliches.
- **„Passt zusammen“**: Gruppen gibt es nur nach Serie und Urheber. Poly Haven ordnet Modelle in Kategorien
  (`category`, z. B. „Furniture/Seating/Chairs“), nicht in Raumsets. Ohne Quelle eine Bewertung von Fundus, also nicht.
- **Vorderseite, Stellflächen, benannte Teile**: nur durch Auswerten der Modelldateien. Teuer und außerhalb dessen,
  was Fundus von den Quellen übernimmt; nicht geplant.
- Erledigt: Die KI hat three.js in `skript` gesucht, es liegt unter `projekt`; die Beschreibung von `kind` in
  `fundus_search` sagt das jetzt.
