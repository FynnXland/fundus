# Fundus

Katalog freier Assets, Details in README.md. Gestaltung in DESIGN.md, Rechtslage in docs/RECHT.md.

Arbeitsstand: `docs/stand/orchestrator.md` (Gesamtübersicht, Unterchats, Dateizuständigkeiten) und je Unterchat
`docs/stand/<name>.md`. Wer weiterarbeitet, liest zuerst diese Dateien und hält die eigene nach jedem Schritt aktuell.

## Regeln für dieses Projekt

- Keine Dateien der Quellen selbst hosten oder durch einen eigenen Server leiten (kein Proxy). Einzige Ausnahme, vom
  Besitzer so entschieden: die Mini-Vorschaubilder (320 px) aus `crawler/thumbs.mjs`. Begründung: docs/RECHT.md.
- Kein Request an fremde Server, bevor der Besucher „Vorschauen von Quellen“ eingeschaltet oder eine Vorschau angefordert hat.
  Schriften, Skripte, Mini-Vorschaubilder und der 3D-Viewer kommen vom eigenen Server.
- Gestaltung: modern, schlank, rund, in Claudes warmen Farben (DESIGN.md, dritte Runde). Verworfen wurden Karteikarten
  und Retro-Rechner; nicht wieder vorschlagen. Bewegung nur mit Zweck, Hover nur bei `hover: hover`, Drück-Feedback,
  `prefers-reduced-motion` beachten.
- Sperren einer Quelle (403, Cloudflare-Abfrage, Hotlink-Schutz) werden respektiert: Quelle abschalten, nicht umgehen.
- Neue Quelle = neuer Adapter in `crawler/sources/`, Eintrag in `sources/index.mjs`, Fixture mit echter, gekürzter
  API-Antwort in `tests/fixtures/` und ein Test in `tests/adapters.test.mjs`. Hosts der Vorschauen in `src/seiten.js`
  (Datenschutz) nachtragen.
- Nur Lizenzen ohne NC/ND (`crawler/lib/licenses.mjs`).
- Port 4570 (Dev) und 4571 (Preview), aus dem freien Block in `_Verwaltung/PORTS.md`.
- Texte auf der Seite: Deutsch, du-Anrede, keine Gedankenstriche, keine erfundenen Zahlen. Zahlen auf der Seite
  kommen nur aus den Daten.
