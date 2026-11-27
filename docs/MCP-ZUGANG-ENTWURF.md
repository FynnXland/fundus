# Entwurf: Limits, persönlicher Zugang und Freigabe für den Fundus-MCP

Stand 27.11.2026. Noch nichts davon ist gebaut. Zahlen mit „Vorschlag“ sind Fynns Entscheidung.

## Ziel

- Die MCP-Zugriffe dürfen das Cloudflare-Budget nicht sprengen (Workers Paid, 5 US-Dollar im Monat, keine Mehrkosten).
- Kein Spam: ein einzelner Besucher oder Bot darf nicht das Kontingent aller verbrauchen.
- Wer an die Grenze kommt, erfährt das verständlich und findet einen Weg, mehr zu bekommen.
- Fynn kann einzelnen Leuten von Hand mehr freischalten oder ihren Zähler zurücksetzen.
- Ohne Konto bleibt der Zugang nutzbar. Mit Konto gibt es mehr Übersicht.

## Was heute gilt (gelesen im Code)

- `/mcp` ist offen, ohne Anmeldung. Grenze: 60 Aufrufe je Minute und IP-Adresse, 1.200 für die Adressen von Anthropic
  (`worker/schutz.mjs`, Bindings `RL_MCP` und `RL_MCP_KI`). Der Zähler lebt 60 Sekunden, gespeichert wird nichts.
- Not-Aus: Der Admin-Worker `fynnland-admin` prüft stündlich die Kosten des ganzen Cloudflare-Kontos über die
  GraphQL-API. Ab 3 US-Dollar Mehrkosten (`PANIC_OVERAGE_USD`) schaltet er für 90 Minuten ab; dann antwortet `/mcp`
  mit 503. Er zählt nicht je Worker und nicht je Besucher.
- Fundus hat keinen eigenen Speicher außer dem R2-Bucket der Vorschaubilder. Tageszähler je Besucher gibt es nirgends.
- Die Datenschutzerklärung (fynn.land, Abschnitt Fundus) sagt: kein Konto, keine Sitzung, nichts gespeichert, Zähler
  nur für die Minute.

## Was die Zugriffe kosten

Im Tarif enthalten sind im Monat 10 Millionen Worker-Anfragen und 30 Millionen Millisekunden Rechenzeit, für alle
Worker des Kontos zusammen (fynn.land, Spiele, Fundus).

- Jeder MCP-Aufruf und jedes Vorschaubild ist eine Worker-Anfrage. Die Seite und die Katalogdaten zählen nicht.
- Knapp ist die Rechenzeit, nicht die Zahl der Anfragen: Eine Suche parst mehrere Indexteile. Gemessen ist das nur
  auf dem Entwicklungsrechner (15 bis 105 ms samt Dateilesen); die echte Zahl je Aufruf steht im Cloudflare-Dashboard
  beim Worker `fundus` unter Metrics, CPU Time. Sie sollte vor der Festlegung der Deckel abgelesen werden.
- Rechenbeispiel mit 30 ms je Aufruf: 10.000 Aufrufe am Tag sind 9 Millionen ms im Monat, knapp ein Drittel des
  Enthaltenen.

## Vorschlag

### 1. Wer ist der Besucher?

| Fall | Erkennung | Bemerkung |
|---|---|---|
| ohne Schlüssel, eigene Adresse (Claude Code, Cursor, lokale Clients) | gekürzter Hash der IP-Adresse und des Tages | wie heute, nur mit Tageszähler |
| ohne Schlüssel, über Anthropic (claude.ai, Claude Desktop) | nicht unterscheidbar, viele Menschen teilen wenige Adressen | gemeinsamer Topf mit eigenem Deckel |
| mit persönlichem Schlüssel | Schlüssel in der Adresse, `https://fundus.fynn.land/mcp?key=…` | funktioniert mit jedem MCP-Client |

Der Schlüssel ist eine zufällige Zeichenkette. Gespeichert wird nur sein Hash.

- **Ohne Konto:** Die Seite erzeugt ihn im Browser und merkt ihn sich dort (`localStorage`). Die Seite zeigt die
  persönliche Adresse zum Kopieren und den Verbrauch von heute.
- **Mit Konto:** Derselbe Schlüssel hängt am fynn.land-Konto, ist auf jedem Gerät sichtbar und lässt sich dort
  sperren und neu erzeugen. Das ist die „Anmeldung der KI am Konto“ ohne eigenen Anmeldedialog im MCP-Client.
- Später möglich: echte Anmeldung nach OAuth 2.1, wie sie der MCP-Standard vorsieht. Das Konto kann PKCE schon
  (so meldet sich das Admin-Dashboard an), bräuchte aber die Registrierung fremder Clients. Deutlich mehr Aufwand.

### 2. Grenzen (Vorschlag)

| Wer | je Minute | je Tag |
|---|---|---|
| ohne Schlüssel, eigene Adresse | 60 | 150 |
| ohne Schlüssel, über Anthropic (alle zusammen) | 1.200 | 4.000 |
| mit Schlüssel aus dem Browser | 60 | 300 |
| mit Schlüssel am Konto | 60 | 500 |
| von Fynn freigeschaltet | 120 | frei wählbar, etwa 5.000 |
| alle zusammen | | 10.000 |

Eine übliche KI-Sitzung braucht 5 bis 30 Aufrufe. Neue Schlüssel aus dem Browser: höchstens 3 je IP-Adresse und Tag,
sonst wäre die Grenze mit einem Klick umgangen.

Vorschaubilder (`/vorschau/*`) bekommen eine eigene Grenze je Minute und Adresse (Vorschlag 600), weil auch sie durch
das Worker-Skript laufen und ein Abgreifen aller 180.000 Bilder sonst ungebremst wäre.

### 3. Wenn die Grenze erreicht ist

Die Antwort kommt als normales Werkzeug-Ergebnis mit Fehlerkennzeichen, nicht als HTTP 429, damit die KI sie dem
Menschen weitergibt:

> Tageslimit für Fundus erreicht (300 von 300 Aufrufen, neu ab 01:00 Uhr). Mit einem eigenen kostenlosen Zugang
> bekommst du ein eigenes Kontingent: https://fundus.fynn.land/#/zugang. Mehr für ein Projekt? Schreib kurz, was du
> baust: Discord https://discord.gg/JTHPxAxFpE oder kontakt@fynnland.xyz.

Die beiden Kontaktwege stehen schon öffentlich im Impressum von fynn.land. Die Domain der E-Mail-Adresse läuft laut
`fynnland/docs/SICHERHEITSPAKET.md` aus; vor dem Bau klären, welche Adresse gilt.

### 4. Übersicht für den Menschen

Neue Seite `#/zugang` auf fundus.fynn.land:

- persönliche MCP-Adresse erzeugen, anzeigen, kopieren, sperren
- Verbrauch heute und Grenze, dazu die letzten sieben Tage als Zahlen
- Hinweis, was gespeichert wird (siehe unten), und der Weg zu mehr Kontingent
- mit Konto zusätzlich: Verlauf der Aufrufe (Zeit, Werkzeug, Suchwort), abschaltbar und löschbar

Der Verlauf ist ein eigener Schritt und nur mit Konto und ausdrücklicher Einwilligung sinnvoll. Ohne Konto gibt es
nur Zähler.

### 5. Freigabe von Hand

Im Admin-Dashboard (`admin.fynn.land`) ein Abschnitt „Fundus-Zugänge“: Liste der Schlüssel mit Verbrauch, dazu
Tageslimit setzen, Zähler zurücksetzen, sperren, Notiz („Projekt X“). Wer mehr will, schickt den Anfang seines
Schlüssels (die Seite zeigt die ersten acht Zeichen als Kennung).

### 6. Technik

- **Speicher:** D1, die Datenbank des Admin-Workers. Je Aufruf ein `INSERT … ON CONFLICT DO UPDATE … RETURNING`
  auf eine Zeile (Tag, Schlüssel-Hash). Im Tarif sind 50 Millionen geschriebene Zeilen im Monat enthalten.
  KV wäre mit einem Schreibvorgang je Aufruf teurer (1 Million enthalten), Durable Objects brauchen eigene Abrechnung.
- **Weg:** Der Fundus-Worker hat schon die Service-Bindung `GUARD` zum Admin-Worker. Dort eine neue Methode, etwa
  `Guard.fundusZugriff({ schluessel, ipHash, kiNetz })`, die zählt und `{ erlaubt, verbraucht, grenze, bis }` liefert.
  Kein Weg über das öffentliche Internet, keine zusätzliche berechnete Anfrage.
- **Fällt der Admin-Worker aus:** offen bleiben wie heute (die Minutengrenze greift weiter), nicht den Katalog sperren.
- **Zuständigkeit:** Fundus-Worker und die Seite `#/zugang` in diesem Projekt. Zähler, Freigaben und Dashboard in
  `fynnland-admin`, Schlüssel am Konto in `fynnland-konto`, Rechtstexte in `fynnland`: Hauptchat von fynn.land.

## Datenschutz: was sich ändert

Für die Datenschutzerklärung (Abschnitt Fundus) und die Seite `#/zugang`. Formulierung durch den Hauptchat mit dem
Rechts-Skill; hier nur die Tatsachen.

| Was | Inhalt | Zweck | Dauer |
|---|---|---|---|
| Tageszähler ohne Schlüssel | Hash aus IP-Adresse und Datum, Anzahl der Aufrufe | Missbrauch und Kosten begrenzen | bis zum Ende des Folgetags |
| Tageszähler mit Schlüssel | Hash des Schlüssels, Anzahl je Tag | wie oben, dazu Anzeige des Verbrauchs | 7 Tage (für die Übersicht) |
| Schlüssel aus dem Browser | Hash des Schlüssels, Erzeugungstag, Hash der IP-Adresse beim Erzeugen | Zuordnung des Kontingents, Schutz vor Massen-Erzeugung | bis zur Sperrung, sonst 90 Tage nach dem letzten Aufruf |
| Schlüssel am Konto | wie oben, dazu die Kontokennung | Verwaltung im Konto | bis zur Löschung des Schlüssels oder Kontos |
| Freigabe von Hand | Tageslimit, Notiz von Fynn | Zuteilung | bis zur Rücknahme |
| Verlauf (nur mit Konto und Einwilligung) | Zeit, Werkzeug, Suchwörter und Filter, keine Antworten | Kontrolle durch die Person selbst | Vorschlag 30 Tage, jederzeit löschbar |
| `localStorage` im Browser | der eigene Schlüssel | Anzeige auf `#/zugang` | bis die Person ihn löscht |

Offene Rechtsfragen für den Hauptchat:

- Rechtsgrundlage für Zähler und Schlüssel ohne Konto (berechtigtes Interesse an Schutz vor Missbrauch und Kosten?).
- `localStorage` für den eigenen Schlüssel: Speichern auf dem Gerät nach § 25 TDDDG, vermutlich „unbedingt erforderlich“
  für den ausdrücklich gewünschten Dienst, bitte prüfen.
- Verlauf: Einwilligung, Widerruf, Auskunft und Löschung über das Konto.
- Die Sätze „speichert nichts“, „kein Konto und keine Sitzung“ und „Zähler gilt nur für diese Minute“ stimmen dann
  nicht mehr und müssen vor dem Einschalten geändert sein.
- Auftragsverarbeitung bleibt Cloudflare (D1 statt nur Worker); Speicherort der Datenbank prüfen.

## Reihenfolge

1. Fynn entscheidet die Zahlen und ob Schlüssel ohne Konto gewollt sind.
2. Hauptchat fynn.land: Methode im Admin-Worker, Tabelle, Dashboard-Abschnitt, neue Datenschutztexte.
3. Fundus: Prüfung im Worker, Antworttext, Seite `#/zugang`, Grenze für Vorschaubilder.
4. Erst wenn die neuen Rechtstexte live sind: einschalten.
5. Danach: Schlüssel am Konto, dann der Verlauf.
