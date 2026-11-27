# Was eine KI über den Fundus-MCP tun kann

Stand 27.11.2026 nachmittags, gelesen aus `mcp/src/werkzeuge.mjs` und gegen den Live-Server geprüft.

Ein MCP-Server bietet einer KI eine feste Liste von **Werkzeugen** an (englisch „tools“). Jedes Werkzeug hat einen
Namen, eine Beschreibung und benannte Angaben, die die KI mitschicken darf. Die KI kann nichts anderes tun als diese
Werkzeuge aufrufen. Was nicht in der Liste steht, gibt es für sie nicht.

Fundus hat zwei Server mit fast derselben Liste:

| | Online-Server | Lokaler Server |
|---|---|---|
| Adresse | `https://fundus.fynn.land/mcp` | `npx -y fundus-mcp` auf dem eigenen Rechner (noch nicht auf npm veröffentlicht) |
| Anmeldung | keine | keine |
| Werkzeuge | 7 | 7, statt der Download-Links das Herunterladen in einen Ordner |
| Schreibt etwas | nein, nur lesen | ja, Dateien in einen Ordner auf dem Rechner |

## Die Werkzeuge

### 1. `fundus_catalog`: Überblick über den Katalog

Sagt der KI, was es gibt, damit sie gültige Filter kennt.

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `kind` | nein | eine Art, etwa `3d`, `musik`, `projekt` |

- **Ohne Angabe:** alle Arten mit Anzahl, die drei Lizenzgruppen, die Quellen, die häufigsten Dateiformate.
- **Mit `kind`:** die Unterordner dieser Art mit Anzahl (bei Projekten 26, bei Bildern 23) und die Quellen dazu.

### 2. `fundus_search`: suchen und auflisten

Das Hauptwerkzeug. Liefert eine kompakte Tabelle, eine Zeile je Eintrag: Kennung, Titel, Art und Unterordner, Lizenz,
Formate, Quelle, Urheber, ob es ein Vorschaubild gibt, und seit heute Sterne, Downloads oder Bewertung, wenn vorhanden.

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `query` | nein | Suchwörter, etwa „wooden chair“. Ohne Suchwort wird eine Art oder ein Unterordner aufgelistet. |
| `kind` | nein | Art: bild, grafik, 3d, textur, hdri, icon, musik, sound, schrift, skript, projekt, skill, video |
| `subfolder` | nein | Unterordner der Art, genau wie in `fundus_catalog` |
| `tags` | nein | Schlagworte, die alle passen müssen |
| `license` | nein | genauer Lizenzname, etwa „CC0 1.0“ |
| `license_group` | nein | `frei` (ohne Namensnennung), `nennung`, `gleich` (Weitergabe unter gleichen Bedingungen) |
| `format` | nein | Dateiformat, etwa glb, png, mp3 |
| `source` | nein | Quelle, etwa polyhaven |
| `has_preview` | nein | nur Einträge mit eigenem Vorschaubild |
| `language` | nein | Programmiersprache eines Repositorys, etwa Rust, Python, C++ |
| `min_popularity` | nein | nur Einträge mit mindestens so vielen Sternen oder Downloads |
| `since` | nein | nur Einträge, die seit diesem Tag im Katalog sind (JJJJ-MM-TT) |
| `sort` | nein | `relevance` (sonst) oder `popular`: die beliebtesten zuerst; ohne Suchwort braucht das eine Art |
| `group` | nein | Kennung einer Gruppe: listet deren Mitglieder (Serien, Icon-Sets) |
| `limit` | nein | Zeilen je Seite, 1 bis 50, sonst 10 |
| `cursor` | nein | Marke für die nächste Seite, kommt aus der vorigen Antwort |

- **Wo gesucht wird:** Titel, Schlagworte, Unterordner, Name der Art, Urheber, Formate, Beschreibung. Wortanfänge,
  Mehrzahl und kleine Tippfehler werden gefunden.
- **Reihenfolge:** Treffer im Titel zählen am meisten. Beliebte Einträge (Sterne, Downloads, Bewertungen) steigen.
- **Wenige Treffer:** Passen weniger als 3 Einträge auf alle Wörter, folgen Einträge, die die meisten Wörter haben;
  eine Spalte nennt die fehlenden Wörter.
- **Gruppen:** Zusammengehörige Einträge erscheinen als eine Beispielzeile mit Hinweis auf die Gruppe.

### 3. `fundus_preview`: Vorschaubilder ansehen

Die KI bekommt die Bilder selbst zu sehen und kann beurteilen, ob etwas passt. 3D-Modelle erscheinen als Standbild.

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `ids` | ja | 1 bis 16 Kennungen aus der Suche |
| `layout` | nein | `sheet` (alle Bilder nummeriert auf einem Bogen) oder `single` (je ein Bild, höchstens 6) |
| `cell_width` | nein | Breite einer Zelle auf dem Bogen, 64 bis 320 Pixel, sonst 160 |
| `from_source` | nein | nur lokal: holt für Einträge ohne eigenes Bild das Bild der Quelle |

- **Online:** nur einzelne Bilder, höchstens 6 je Aufruf. Der Bogen ist dort abgeschaltet (`KONTAKTBOGEN` steht auf 0,
  weil das Zusammensetzen Rechenzeit kostet).
- **Ohne eigenes Bild:** Die Antwort nennt die Adresse des Bildes bei der Quelle.

### 4. `fundus_details`: alles zu einem Eintrag

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `ids` | ja | 1 bis 5 Kennungen |

Liefert je Eintrag: Urheber, Lizenz mit Link, fertigen Text für die Namensnennung, Seite bei der Quelle, Beschreibung
und die Download-Möglichkeiten mit Format, Größe und Link. Dazu:

- **Nutzung in einem Satz:** ob Namensnennung nötig ist und ob Bearbeitungen unter derselben Lizenz bleiben müssen.
- **Fakten:** Sterne oder Downloads, Programmiersprache, letzte Änderung bei der Quelle.
- **Quelltext selbst lesen (GitHub-Einträge):** die Adressen von README, Dateiliste und einzelnen Dateien. Fundus
  reicht keine Dateien durch; die KI ruft sie mit ihrem eigenen Web-Zugriff ab.

### 5. `fundus_similar`: ähnliche Einträge

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | eine Kennung |
| `limit` | nein | Zeilen, 1 bis 20, sonst 8 |

Alternativen zu einem Treffer: gleiche Art und gleicher Unterordner, die meisten gemeinsamen Schlagworte zuerst,
dann die bekannteren. Dieselbe Tabelle wie bei der Suche.

### 6. `fundus_attribution`: Quellenblock für eine Liste

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `ids` | ja | 1 bis 10 Kennungen der verwendeten Einträge |

Die fertige Namensnennung je Eintrag als ein Block, getrennt nach „Lizenz verlangt es“ und „nicht nötig, aber guter Stil“.

### 7a. `fundus_download_links`: Links zu den Dateien (nur online)

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | eine Kennung |
| `download` | nein | Nummer der Download-Möglichkeit aus den Details, sonst 1 |

Liefert die direkten Adressen der Dateien bei der Quelle samt Namensnennung. Pakete (etwa ein Modell mit Texturen)
kommen als Liste aller Dateien mit ihrem Platz im Ordner. Fundus selbst liefert keine Datei aus.

### 7b. `fundus_download`: in einen Ordner laden (nur lokal)

| Angabe | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | eine Kennung |
| `download` | nein | Nummer der Download-Möglichkeit, sonst 1 |
| `target_dir` | nein | Zielordner; sonst `FUNDUS_ZIEL` oder `Downloads/Fundus` im Benutzerordner |
| `max_mb` | nein | Größengrenze in MB, sonst 500 |
| `overwrite` | nein | vorhandene Dateien überschreiben |

Lädt die Dateien vom Rechner der Person direkt bei der Quelle und legt daneben eine `.lizenz.txt` mit Lizenz und
Namensnennung. Das ist das einzige Werkzeug, das etwas schreibt, und der einzige Ort, an dem heute „Ordner“ entstehen.

## Was die KI nicht kann

- Nichts im Katalog ändern, ergänzen oder melden.
- Nichts speichern: keine Merkliste, keine Sammlungen, kein Verlauf. Der Online-Server kennt keine Person.
- Dateien über Fundus beziehen. Sie kommen immer von der Quelle.
- Den Inhalt eines Skills oder eines Repositorys über Fundus lesen. Sie bekommt die Adressen und liest dort selbst.
- Nach dem Datum der letzten Änderung sortieren („neueste zuerst“).

## Schutz und Grenzen

- 60 Aufrufe je Minute und Besucher, für die Adressen von Anthropic (claude.ai, Claude Desktop) 1.200.
- Ein Not-Aus schaltet `/mcp` ab, wenn die Verwaltung von fynn.land Alarm meldet.
- Kein Protokoll: Der Server hält nicht fest, wer was gefragt hat. So steht es auch auf der Datenschutzseite.
- Ein Tagesdeckel fehlt.

## Was fehlen könnte

Ideen, nichts davon ist gebaut. Sortiert nach meinem Eindruck vom Nutzen.

| Idee | Was die KI damit könnte | Aufwand |
|---|---|---|
| Neueste zuerst | nach der letzten Änderung bei der Quelle sortieren; das Datum steht noch nicht in der Suchzeile | mittel |
| Zufällige Auswahl | Anregungen holen, ohne Suchwort | klein |
| Vorschau für Code im lokalen Server | README direkt vom eigenen Rechner holen und als Text zurückgeben | mittel |
| Eintrag melden | einen toten Link oder ein Rechteproblem melden; schreibt und braucht Schutz vor Missbrauch | mittel |
| Skill-Text lesen | den Inhalt einer `SKILL.md` ansehen, bevor sie empfohlen wird; der Text liegt bei GitHub | mittel |
| Sammlungen im Konto | Ordner anlegen und füllen, die im fynn.land-Konto liegen | groß, braucht Anmeldung und neue Datenschutztexte |
| Verlauf für den Menschen | Übersicht, was die eigene KI wann abgefragt hat | groß, widerspricht dem heutigen „kein Protokoll“ und braucht deine Entscheidung |
