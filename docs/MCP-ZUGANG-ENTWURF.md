# Entwurf: Limits, persönlicher Zugang und Freigabe für den Fundus-MCP

Stand 27.11.2026, nach der Abstimmung mit dem fynn.land-Hauptchat (dessen Antwort mit Textentwürfen für die
Datenschutzerklärung: `fynnland/docs/entwuerfe/fundus-mcp-zugang-datenschutz.md`). Noch nichts davon ist gebaut.
Zahlen mit „Vorschlag“ sind Fynns Entscheidung.

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
| alle ohne Schlüssel zusammen | | 10.000 |

Der Gesamtdeckel gilt nur für Aufrufe ohne Schlüssel (Vorschlag des Hauptchats): Sonst könnte jemand, der Adressen
wechselt, ihn für alle mit Schlüssel verbrauchen. Ob er auch Schlüssel und Freigaben treffen soll, entscheidet Fynn.

Eine übliche KI-Sitzung braucht 5 bis 30 Aufrufe. Neue Schlüssel aus dem Browser: höchstens 3 je IP-Adresse und Tag,
sonst wäre die Grenze mit einem Klick umgangen.

Vorschaubilder (`/vorschau/*`) bekommen eine eigene Grenze je Minute und Adresse (Vorschlag 600), weil auch sie durch
das Worker-Skript laufen und ein Abgreifen aller 180.000 Bilder sonst ungebremst wäre.

### 3. Wenn die Grenze erreicht ist

Die Domain der Kontaktadresse (fynnland.xyz) läuft am 02.03.2027 aus. Vorschlag des Hauptchats: Die Antwort nennt
Discord und `https://fynn.land/impressum.html` statt einer E-Mail-Adresse.

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

- **Speicher:** eine eigene D1 für Fundus, angelegt mit `npx wrangler d1 create fundus --jurisdiction eu` (sonst
  stimmt „Speicherort in der EU“ nicht). Nicht die Datenbank des Admin-Workers: Der ist der empfindlichste Worker und
  speichert nach seiner eigenen Regel keine IP-Daten; außerdem zählt Fundus so unabhängig von ihm.
  Je Aufruf ein `INSERT … ON CONFLICT DO UPDATE … RETURNING` auf eine Zeile (Tag, Kennung). Im Tarif sind 50 Millionen
  geschriebene Zeilen im Monat enthalten, danach 1 US-Dollar je Million (Preisseite von D1, gelesen 27.11.2026);
  jeder Index auf der Tabelle zählt als weitere geschriebene Zeile, also ohne Zusatzindex bauen.
- **Dashboard:** Der Admin-Worker bindet `{ binding: "FUNDUS", service: "fundus", entrypoint: "Admin" }` nach dem
  Vertrag aus `fynnland-admin/docs/PROGRAMM-ANBINDEN.md`: Fundus hält die Daten, das Dashboard ruft Methoden auf, die
  reines JSON liefern und nie werfen, ohne IP-Daten und ohne Konto-Kennungen. Methoden: `counts()`, `list()`,
  `grant(kennung, grenze, notiz)`, `reset`, `block`, `unblock`. Aufrufe über eine Service-Bindung kosten keine
  zusätzliche Anfrage, nur die Rechenzeit beider Worker (Preisseite von Workers, gelesen 27.11.2026).
- **Kennung eines Schlüssels:** die ersten 8 Hex-Zeichen von SHA-256(Schlüssel), nicht der Anfang des Schlüssels.
  Der Schlüssel kommt als `?key=` oder als `Authorization: Bearer`; die Adresse wird nie protokolliert und nie in
  einer Fehlermeldung zurückgegeben.
- **IP-Kennung:** HMAC-SHA-256 mit einem Worker-Secret und dem Datum (ein einfacher SHA-256 ließe sich über alle
  IPv4-Adressen zurückrechnen). Bei IPv6 nur das /64-Netz, sonst holt sich ein Anschluss mit wechselnden Adressen
  beliebig viele Tageskontingente.
- **Ist die D1 nicht erreichbar:** Der Zugang bleibt offen (die Minutengrenze greift weiter). Die einzige harte
  Kostenbremse ist dann der Not-Aus des Admin-Workers; `Guard.state()` bleibt, wie er ist.
- **Zuständigkeit:** Fundus-Worker, D1, Entrypoint `Admin` und die Seite `#/zugang` in diesem Projekt. Dashboard-
  Abschnitt in `fynnland-admin`, Konto-Anbindung in `fynnland-konto`, Rechtstexte in `fynnland`: Hauptchat fynn.land.

## Datenschutz: was sich ändert

Für die Datenschutzerklärung (Abschnitt Fundus) und die Seite `#/zugang`. Formulierung durch den Hauptchat mit dem
Rechts-Skill; hier nur die Tatsachen.

| Was | Inhalt | Zweck | Dauer |
|---|---|---|---|
| Tageszähler ohne Schlüssel | Hash aus IP-Adresse und Datum, Anzahl der Aufrufe | Missbrauch und Kosten begrenzen | bis zum Ende des Folgetags |
| Tageszähler mit Schlüssel | Hash des Schlüssels, Anzahl je Tag | wie oben, dazu Anzeige des Verbrauchs | 7 Tage (für die Übersicht) |
| Schlüssel aus dem Browser | Hash des Schlüssels, Erzeugungstag; keine IP-Kennung beim Schlüssel (die Grenze „3 neue je Tag“ läuft über den Tageszähler) | Zuordnung des Kontingents | bis zur Sperrung, sonst 90 Tage nach dem letzten Aufruf |
| Schlüssel am Konto | Der Schlüssel liegt als Datenstand von `fundus` im Konto; Fundus merkt sich nur die Stufe „Konto“ mit Ablauf nach 90 Tagen, keine Kontokennung | Verwaltung im Konto | bis zur Löschung des Schlüssels oder Kontos |
| Freigabe von Hand | Tageslimit, Notiz von Fynn ohne Namen | Zuteilung | bis zur Rücknahme |
| Verlauf (nur mit Konto und Einwilligung) | Zeit, Werkzeug, Suchwörter und Filter, keine Antworten | Kontrolle durch die Person selbst | Vorschlag 30 Tage, jederzeit löschbar |
| `localStorage` im Browser | der eigene Schlüssel | Anzeige auf `#/zugang` | bis die Person ihn löscht |

Einschätzung des Hauptchats (KI-Selbstprüfung mit dem Rechts-Skill, keine Rechtsberatung):

- Tageszähler ohne Schlüssel: tragfähig mit HMAC, Art. 6 Abs. 1 Buchst. f DSGVO. Die Daten sind pseudonym, also
  weiter personenbezogen; der Text darf nicht mehr „speichert nichts“ sagen.
- Persönlicher Schlüssel: tragfähig, Art. 6 Abs. 1 Buchst. b, weil die Person das Kontingent selbst wählt.
- `localStorage` (`fundus.zugang`): zulässig nach § 25 Abs. 2 Nr. 2 TDDDG, aber nur, wenn der Schlüssel erst beim
  Klick auf „Zugang erzeugen“ entsteht, nie beim Laden der Seite.
- Verlauf: später, aus beim Start, löschbar, mit eigenem Text.
- Außer `datenschutz.html` auf fynn.land brauchen auch die Datenschutzseite von Fundus (`src/seiten.js`) und
  `#/zugang` eine Kurzfassung.

Ursprüngliche Fragen an den Hauptchat:

- Rechtsgrundlage für Zähler und Schlüssel ohne Konto (berechtigtes Interesse an Schutz vor Missbrauch und Kosten?).
- `localStorage` für den eigenen Schlüssel: Speichern auf dem Gerät nach § 25 TDDDG, vermutlich „unbedingt erforderlich“
  für den ausdrücklich gewünschten Dienst, bitte prüfen.
- Verlauf: Einwilligung, Widerruf, Auskunft und Löschung über das Konto.
- Die Sätze „speichert nichts“, „kein Konto und keine Sitzung“ und „Zähler gilt nur für diese Minute“ stimmen dann
  nicht mehr und müssen vor dem Einschalten geändert sein.
- Auftragsverarbeitung bleibt Cloudflare (D1 statt nur Worker); Speicherort der Datenbank prüfen.

## Was Fynn entscheiden muss

1. die Zahlen der Tabelle „Grenzen“
2. Schlüssel ohne Konto: ja oder nein
3. eigene D1 für Fundus (Empfehlung) oder die Datenbank des Admin-Workers
4. ob der Gesamtdeckel auch für Schlüssel und Freigaben gilt
5. Notiz bei Freigaben als Freitext oder feste Liste
6. die Kontaktadresse ab März 2027
7. Verlauf: ja oder nein
8. das „Ja, live stellen“ für die neuen Datenschutztexte

## Reihenfolge

1. Fynn entscheidet die Zahlen und ob Schlüssel ohne Konto gewollt sind.
2. Hauptchat fynn.land: Methode im Admin-Worker, Tabelle, Dashboard-Abschnitt, neue Datenschutztexte.
3. Fundus: Prüfung im Worker, Antworttext, Seite `#/zugang`, Grenze für Vorschaubilder.
4. Erst wenn die neuen Rechtstexte live sind: einschalten.
5. Danach: Schlüssel am Konto, dann der Verlauf.

## Stand des Baus (27.11.2026 nachmittags)

Fynn hat die Empfehlungen bestätigt. Stufe 1 ist auf der Fundus-Seite gebaut und veröffentlicht, aber **ausgeschaltet**
(`ZUGANG: "0"` in `wrangler.jsonc`). Solange zählt und speichert der Worker nichts, `/api/zugang/*` antwortet außer
`info` mit 404, und die Seite `#/zugang` sagt, dass eigene Zugänge noch nicht eingeschaltet sind.

| Teil | Wo |
|---|---|
| Zähler, Schlüssel, Limit-Antwort, API der Seite, Aufräumen | `worker/zugang.mjs`, eingebunden in `worker/index.mjs` |
| Zugang fürs Dashboard (`counts`, `list`, `grant`, `reset`, `block`, `unblock`) | `worker/admin.mjs`, Entrypoint `Admin`; `wrangler.jsonc` startet jetzt `worker/eingang.mjs` |
| Datenbank | D1 `fundus`, Jurisdiction `eu`, Tabellen aus `worker/zugang.sql` |
| Geheimnis für die IP-Kennung | Secret `ZAEHLER_GEHEIM` am Worker; lokal `.dev.vars` (nicht im Repository) |
| Seite und Kurzfassung Datenschutz | `src/zugang.js`, `#/zugang`, Absatz auf `#/datenschutz` nur bei eingeschaltetem Schalter |
| Grenze für Vorschaubilder | `RL_VORSCHAU`, 900 je Minute und Adresse (der Entwurf des Hauptchats nennt 600: Zahl im Text anpassen) |
| Aufräumen | Cron `23 2 * * *` |
| Tests | `tests/zugang.test.mjs`, mit echtem SQLite hinter den D1-Aufrufen |

Lokal mit eingeschaltetem Schalter geprüft: Zugang erzeugen, Aufruf mit und ohne Schlüssel wird gezählt, unbekannter
Schlüssel und fremde Herkunft werden abgewiesen, die Seite zeigt Adresse und Verbrauch.

Einschalten, in dieser Reihenfolge:

1. Die neuen Datenschutztexte sind auf fynn.land live (Hauptchat, nach Fynns Ja).
2. Im Admin-Dashboard gibt es den Abschnitt „Fundus-Zugänge“ (Bindung `{ binding: "FUNDUS", service: "fundus",
   entrypoint: "Admin" }`); bis dahin geht die Freigabe von Hand nur über `wrangler d1 execute`.
3. `ZUGANG` auf `"1"`, einen Link zu `#/zugang` in den KI-Bereich der Startseite, veröffentlichen, pushen.
4. Am ersten Tag `counts()` und die Rechenzeit im Cloudflare-Dashboard ansehen und die Zahlen in `GRENZEN` nachziehen.

Nicht gebaut: Schlüssel am Konto (Stufe 2, braucht den Eintrag `fundus` in `ACCOUNT_GAMES` des Kontoservers) und der
Verlauf. Zu prüfen: ob der API-Token des nächtlichen GitHub-Laufs einen Worker mit D1-Bindung veröffentlichen darf.

Nachtrag am selben Tag, nach einer Gegenprüfung:

- Wer ohne Schlüssel sein Tageskontingent überzogen hat, zählt nicht mehr in den Deckel für alle ohne Schlüssel und
  kostet nach der ersten Absage keine Schreibvorgänge mehr (Merkliste je Isolate). Vorher hätte eine einzelne Adresse
  mit 60 Aufrufen je Minute den Deckel in unter drei Stunden für alle aufgebraucht.
- Zugänge ohne Freigabe von Hand teilen eine eigene Obergrenze (`gesamtSchluessel`, 10.000 am Tag), und je Tag
  entstehen insgesamt höchstens 200 neue Zugänge (`neueSchluesselGesamt`). Ohne das hätte jemand mit wechselnden
  Adressen beliebig viele Zugänge erzeugen können. Rechnerisch sind damit höchstens 20.000 Aufrufe am Tag möglich,
  die nicht von Fynn freigegeben sind. Beide Zahlen sind Vorschläge.
- Diese Schicht ersetzt nicht den Not-Aus: Der greift weiter erst ab 3 US-Dollar Mehrkosten des ganzen Kontos.
- Beim Einschalten nachziehen: Die Datenschutzseite von Fundus nennt drei gespeicherte Einstellungen; `fundus.zugang`
  kommt dazu, und es ist zu entscheiden, ob der Knopf „Einstellungen löschen“ auch den Zugang entfernt.

## Eingeschaltet am 27.11.2026

- Der neue Datenschutztext ist auf fynn.land live (geprüft: alle Grenzen genannt, „kein Konto und keine Sitzung“ ist
  weg), das Admin-Dashboard hat den Reiter „Fundus“. `ZUGANG` steht auf `"1"` (Commit `c7c6d62`).
- Live geprüft: Aufruf ohne Schlüssel wird gezählt, Zugang erzeugen, Aufruf mit Schlüssel, Verbrauch abfragen,
  unbekannter Schlüssel wird mit Text abgewiesen, Zugang löschen. Der Testzugang ist wieder gelöscht.
- Der Knopf oben rechts und ein Satz im KI-Bereich der Startseite führen zu `#/zugang`.
- Rechenzeit laut Cloudflare-Dashboard (Worker `fundus`, letzte 24 Stunden, alle Aufrufe gemischt): P50 24 ms,
  P90 43 ms, P99 64 ms, einzelne Spitzen bis 300 ms, keine Überschreitung der CPU-Grenze. Der Median über alle
  Anfragen samt Vorschaubildern liegt bei 0,9 ms. Mit 45 ms je MCP-Aufruf gerechnet: 10.000 Aufrufe am Tag sind
  13,5 Millionen ms im Monat (45 % des Enthaltenen), die rechnerisch möglichen 20.000 ohne Freigabe 27 Millionen (90 %).
- Der Token „fundus-deploy (GitHub Actions)“ hat seit 27.11.2026, 13:09 UTC, zusätzlich das Recht Account, D1, Edit
  (von Fynn im Dashboard gespeichert). Ob der nächtliche Lauf damit durchläuft, zeigt erst die Nacht auf den 28.11.
