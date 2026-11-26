# Fundus an deine KI anschließen

Fundus spricht MCP (Model Context Protocol). Damit kann deine KI im Katalog suchen, sich Vorschaubilder ansehen,
Lizenz und Namensnennung abfragen und die Dateien direkt von der Quelle holen. Fundus selbst hostet keine Dateien:
Downloads kommen immer vom Original (Poly Haven, Wikimedia Commons, ambientCG …).

Es gibt zwei Wege. Nimm den ersten, wenn du nur eine Adresse eintragen willst. Nimm den zweiten, wenn deine KI
Dateien direkt in einen Ordner auf deinem Rechner speichern soll.

| | Entfernt (Adresse eintragen) | Lokal (Programm auf deinem Rechner) |
|---|---|---|
| Einrichten | eine URL | Node.js 20 oder neuer, ein Befehl |
| Suchen, Vorschau, Details | ja | ja |
| Herunterladen | KI bekommt die direkten Links | KI speichert in einen Ordner, mit Lizenzdatei daneben |
| Vorschau als Kontaktbogen | je nach Betrieb, sonst Einzelbilder | ja |

## Entfernt: nur eine Adresse

Adresse des Servers: `https://fundus.fynn.land/mcp`

**Claude Desktop und claude.ai:** Einstellungen, Connectors, „Add custom connector“ (benutzerdefinierten Connector
hinzufügen), Name `Fundus`, URL oben eintragen.

**Claude Code:**

```
claude mcp add --transport http fundus https://fundus.fynn.land/mcp
```

**Cursor:** in `~/.cursor/mcp.json` (für alle Projekte) oder `.cursor/mcp.json` (nur dieses Projekt):

```json
{ "mcpServers": { "fundus": { "url": "https://fundus.fynn.land/mcp" } } }
```

**Codex (App, CLI, IDE-Erweiterung):** in der App oder Erweiterung unter Einstellungen, MCP servers, „Add server“,
Streamable HTTP, URL eintragen. Oder in `~/.codex/config.toml` (alle drei teilen sich die Einstellung):

```toml
[mcp_servers.fundus]
url = "https://fundus.fynn.land/mcp"
```

**VS Code (GitHub Copilot):** Befehlspalette „Chat: Open Customizations“, MCP Servers, „Add Server“, HTTP, URL
eintragen, ID `fundus`. Oder in `~/.copilot/mcp-config.json`:

```json
{ "mcpServers": { "fundus": { "type": "http", "url": "https://fundus.fynn.land/mcp", "tools": ["*"] } } }
```

**Andere MCP-Clients:** Transport „Streamable HTTP“, URL wie oben. Eine Anmeldung gibt es nicht.

## Lokal: mit Speichern in einen Ordner

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

Sobald das Paket veröffentlicht ist, reicht `npx -y fundus-mcp`. Bis dahin startest du den Server aus diesem
Projekt: einmal `npm install` im Ordner `mcp/`, dann zeigt der Befehl auf `mcp/src/stdio.mjs`.

**Claude Code:**

```
claude mcp add fundus -- npx -y fundus-mcp
```

Aus dem Projekt, mit einer lokalen Fundus-Kopie auf Port 4570 (`npm run dev`):

```
claude mcp add fundus -e FUNDUS_URL=http://localhost:4570 -- node E:/Entwicklung/07_Tools/Medien/Fundus/mcp/src/stdio.mjs
```

**Claude Desktop:** Einstellungen, Entwickler, „Konfiguration bearbeiten“ öffnet `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fundus": { "command": "npx", "args": ["-y", "fundus-mcp"] }
  }
}
```

Danach Claude Desktop neu starten. Unter Windows hilft bei Startproblemen `"command": "cmd", "args": ["/c", "npx", "-y", "fundus-mcp"]`.

**Cursor:** `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "fundus": { "command": "npx", "args": ["-y", "fundus-mcp"] } } }
```

**Einstellungen** (als Umgebungsvariablen, in den Konfigurationen oben unter `"env": { … }`):

| Variable | Bedeutung | Standard |
|---|---|---|
| `FUNDUS_ZIEL` | Ordner für Downloads | `Downloads/Fundus` in deinem Benutzerordner |
| `FUNDUS_URL` | Adresse der Fundus-Seite | `https://fundus.fynn.land` |
| `FUNDUS_VORSCHAU` | Adresse der Vorschaubilder, falls sie woanders liegen | `<FUNDUS_URL>/vorschau` |

## Was deine KI damit kann

| Werkzeug | wofür |
|---|---|
| `fundus_catalog` | Überblick: Arten, Unterordner, Lizenzgruppen, Quellen, Formate |
| `fundus_search` | suchen und filtern (Art, Unterordner, Schlagwörter, Lizenz, Lizenzgruppe, Format, Quelle, nur mit Vorschau), seitenweise |
| `fundus_preview` | Vorschaubilder ansehen, mehrere als ein nummerierter Kontaktbogen |
| `fundus_details` | Urheber, Lizenz, fertiger Text für die Namensnennung, Ursprungsseite, Downloads mit Format und Größe |
| `fundus_download` (lokal) | speichert in einen Ordner und legt die Lizenz als Textdatei daneben |
| `fundus_download_links` (entfernt) | direkte Links zur Quelle, bei Paketen jede Datei mit ihrem Pfad |

Probier zum Beispiel: „Such mir in Fundus drei CC0-Stühle als glTF, zeig sie mir als Kontaktbogen und lade den
schönsten in meinen Projektordner.“

## Kosten und Sparsamkeit

Die Antworten sind knapp gehalten: eine Suche mit zehn Treffern kostet rund 400 Tokens, die Details eines Eintrags
rund 200. Ein Vorschaubild in voller Größe (320 × 240) kostet bei Claude rund 100 Bild-Tokens, im Kontaktbogen
rund 26 pro Eintrag. Eine typische Sitzung (Suche, zwei Vorschauen, ein Download) liegt bei etwa 1.000 Tokens für
die Antworten. Dazu kommen einmal die Werkzeugbeschreibungen mit rund 1.600 Tokens, die die meisten Clients
zwischenspeichern.

## Lizenz und Namensnennung

Alles in Fundus ist frei lizenziert, aber nicht alles ohne Bedingungen. Viele Lizenzen (CC BY, CC BY-SA, MIT …)
verlangen eine Namensnennung. Der lokale Server legt dafür neben jeden Download eine Datei `*.lizenz.txt` (bei
Paketen `LIZENZ.txt`) mit Urheber, Lizenz, Quelle und fertigem Text. Der entfernte Server gibt denselben Text mit
den Links zurück. Gib ihn weiter, wenn du die Datei veröffentlichst.

## Datenschutz

Der entfernte Server speichert nicht, wer was gesucht hat, und schreibt keine Protokolle. Er liest nur die
öffentlichen Katalogdaten der Fundus-Seite. Beim lokalen Server gehen Downloads (und, nur wenn die KI darum
bittet, kleine Vorschaubilder der Quelle) direkt von deinem Rechner an die jeweilige Quelle, genau wie beim
Herunterladen im Browser.
