Gekürzte echte API-Antworten vom 23.11.2026 (nur die Felder, die die Adapter lesen).
Ausnahme: `openverse-audio.json` ist nach der Struktur einer echten Antwort nachgebaut (URL-Schema und Felder echt,
Titel und Benutzername erfunden), weil das anonyme Openverse-Limit zum Zeitpunkt der Aufnahme ausgeschöpft war.
`freesound-search.json` ist ohne Token nachgebaut, strikt nach der offiziellen APIv2-Doku (Aufbau der Trefferliste `count/next/previous/results`, Felder laut Sound-Instance-Tabelle) und dem Serializer im Quellcode (MTG/freesound, `license` = Deed-URL); IDs, Titel, Benutzer und Prüfsummen sind erfunden. `smithsonian-image.json` und `smithsonian-3d.json` sind echte, gekürzte Antworten von api.si.edu vom 23.11.2026.
