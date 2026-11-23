# Fundus: Gestaltung

## Vorgaben des Besitzers (Fynn)

- 23.11.2026: Farben Orange und Grau, „ein bisschen Claude-Style“. Man sieht ein Asset, bleibt auf der Seite und lädt
  es dort herunter; die Dateien bleiben bei der Quelle.
- Runde 2: Die Farben gefallen. Asset Galaxy (assetgalaxy.org) wirkt nach KI-Vorlage, die **Logik** dort ist aber gut
  (Themenbaum, Filter, Datenblatt). Karten sollen auch ohne eingeschaltete Vorschau ein Bild zeigen.
- Runde 3 (verworfen: Karteikarten, Retro-Rechner): **modern, schlank, mehr Rundungen**, orientiert an Emil Kowalskis
  Design-Engineering und an Apples Gestaltung.

Das Design-System dazu liegt in Claude Design: https://claude.ai/artifact/PbB1SVi6UF7Svba5Hn8fc9 (Tokens, Bausteine,
Regelwerk; abgeleitet aus `src/styles.css`, bei Änderungen dort nachziehen).

## Design Read

Asset-Bibliothek für Leute, die Material für Projekte suchen, als ruhige, moderne Mediathek in Claudes warmen Farben.
Dial: ENERGY 2 / RHYTHM 2 / MOTION 2.

R-30: Die Orientierung an Apple und Emil Kowalski ist ausdrücklich gewünscht. Übernommen werden Grundsätze (Klarheit,
Inhalt vor Bedienelementen, konzentrische Radien, kurze sinnvolle Bewegung), keine Markenzeichen, keine Systemschrift
von Apple, kein Nachbau einer bestimmten App.

## Aufbau (Logik wie besprochen)

- **Kopfleiste**, bleibt oben: Wortmarke, Suchfeld, Schalter „Vorschauen von Quellen“, Farbschema.
- **Seitenleiste** links: Ordner nach Art mit Zählern, Unterordner unter dem gewählten Ordner. Auf schmalen
  Bildschirmen wird sie zu einer waagerecht scrollbaren Reihe.
- **Inhalt**: Überschrift mit Ordnername und Anzahl, Filterzeile (Lizenz als Segmente, Format, Quelle, Ordnen,
  Raster/Liste, Zufall), darunter die Objekte.
- **Detail**: Dialog über der Seite (auf dem Handy als Blatt von unten) mit Vorschau, Downloads, Reitern
  Übersicht/Dateien/Herkunft, Namensnennung, ähnlichen Objekten.

## Farben

| Rolle | Hell | Dunkel | Grund |
|---|---|---|---|
| Seite | `#faf9f5` | `#1f1e1d` | Claudes Creme bzw. warmes Schwarzgrau |
| Fläche (Seitenleiste, Felder, Platzhalter) | `#f0eee6` | `#262624` | eine Stufe dunkler, trennt ohne Linien |
| Karte, Dialog | `#ffffff` | `#2b2a28` | hebt Inhalt von der Seite ab |
| Tinte | `#1f1e1d` | `#edebe4` | Text |
| Bleistift | `#5c5a55` | `#a8a69e` | Nebentext, AA geprüft |
| Akzent Ton-Orange | `#a6482a` | `#e08a68` | genau ein Akzent: gewählter Ordner, Hauptknopf, Schalter an, Fokus |
| Akzent-Tönung | `#f3e3da` | `#3d2c25` | Hintergrund des gewählten Ordners |
| Linie für Bedienelemente | `#8a877f` | `#8a877f` | 3:1 gegen die Seite (Eingabefelder, Schalter) |
| Haarlinie | Tinte mit 10 % | Tinte mit 12 % | Trennlinien ohne Funktion |

## Schrift

- **Fraunces** (OFL, lokal): Wortmarke und Überschriften. Die weiche Serif gibt der Seite ihre Stimme und knüpft an
  Claudes Serif-Überschriften an.
- **Systemschrift** (`system-ui`): Bedienung und Fließtext. Grundsatz aus Apples Richtlinien: die Schrift der Plattform
  ist die am besten lesbare und lädt ohne Wartezeit. Auf Windows ist das Segoe UI, auf Apple-Geräten San Francisco.
- **IBM Plex Mono** (OFL, lokal): nur Lizenzkürzel, Formate, Signaturen, Dateilisten.
- Zahlen in Zählern mit `tabular-nums`, Überschriften mit `text-wrap: balance`.

## Form

- Radien, konzentrisch (außen = innen + Abstand): 8 px Bild in der Karte, 14 px Karte (6 px Abstand), 12 px Knöpfe und
  Felder, 24 px Dialog. Rund sind nur Suchfeld, Schalter und Zähler. Grund: Rundung zeigt die Ebene an, nicht alles
  ist eine Pille.
- Schatten nur für Erhöhung: Karte unter dem Mauszeiger, Dialog. Sonst trennen Flächen und Haarlinien.
- Ein Glas-Element: die Kopfleiste (Unschärfe), damit der Inhalt beim Scrollen darunter sichtbar bleibt.

## Bewegung (MOTION 2, jede mit Zweck)

| Wo | Was | Zweck |
|---|---|---|
| Knöpfe, Karten | beim Drücken `scale(0.97)`, 120 ms | bestätigt die Berührung |
| Karte | unter der Maus 2 px anheben, Schatten, 160 ms ease-out, nur bei `hover: hover` | zeigt, was angeklickt wird |
| Vorschaubilder | blenden in 200 ms ein, wenn sie geladen sind | kein hartes Aufploppen im Raster |
| Dialog | öffnet aus 97 % Größe mit 220 ms ease-out, schließt in 160 ms; Handy: Blatt fährt von unten ein | zeigt, woher die Ebene kommt |
| Schalter | Knopf gleitet 180 ms | Zustand wechselt sichtbar |

Kein Einblenden beim Filtern oder Tippen (häufige Aktionen bleiben sofort), keine Endlosschleifen außer der
Ladeanzeige. `prefers-reduced-motion`: nur noch Überblenden.

## Platzhalter ohne Bild

Objekte ohne Vorschaubild (Code, Skills, manche Sounds) zeigen in der Bildfläche ihre Beschreibung als Text oder ein
schlichtes Zeichen für die Art. Schriften bekommen ein erzeugtes Musterbild in der echten Schrift.
