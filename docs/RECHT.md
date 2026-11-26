# Rechtliche Einordnung (Stand 23.11.2026)

Recherche mit live geprüften Normen und Entscheidungen (gesetze-im-internet.de, dejure.org, gesetze-bayern.de).
EuGH-Urteile nur über Kopfdaten und Randnummern auf dejure.org geprüft, nicht im Volltext. **Keine Rechtsberatung**;
vor dem Start mit Werbung oder Einnahmen sollte eine Anwältin oder ein Anwalt draufschauen.

## Ergebnis in einem Absatz

Verlinken und Einbetten frei zugänglicher, offen lizenzierter Werke ist unkritisch (grün), solange keine Sperre der Quelle
umgangen wird. Ein Proxy oder „Tunnel“, der Dateien über unseren Server durchreicht, wäre dagegen eine eigene Wiedergabe
und deutlich riskanter (rot bis gelb), deshalb gibt es ihn nicht. Die größte praktische Pflicht ist der Datenschutz:
Fremdserver erfahren die IP-Adresse der Besucher, also laden Vorschauen erst nach Opt-in.

## Prüfmatrix

| Punkt | Grundlage | Bewertung | Ampel | Umsetzung in Fundus |
|---|---|---|---|---|
| Link und Einbettung | §§ 15, 19a UrhG; EuGH Svensson C-466/12, BestWater C-348/13, VG Bild-Kunst C-392/19; BGH Die Realität I/II, Deutsche Digitale Bibliothek II | Frei zugängliches Werk, kein neues Publikum, keine öffentliche Wiedergabe. Grenze: Umgehung technischer Schutzmaßnahmen. Die offene Lizenz sichert zusätzlich ab. | grün | Hotlink-Sperren werden respektiert: ccMixter ausgeschlossen (403), Art Institute of Chicago abgeschaltet (Cloudflare-Abfrage seit 23.11.2026). Referer wird nicht gefälscht, nur weggelassen (`no-referrer`). |
| Falsch angegebene Lizenz | EuGH GS Media C-160/15; BGH Vorschaubilder III; § 97 UrhG | Haftung nur bei Kenntnis oder Kennenmüssen; bei Gewinnerzielungsabsicht wird Kenntnis vermutet. Nach einem Hinweis besteht Kenntnis. | gelb (mit Werbung höher) | Nur kuratierte Quellen, Lizenz und Abrufdatum je Eintrag, „Eintrag melden“ auf jeder Karte, Sperrliste `data/gesperrt.json`, Linkprüfung blendet Gelöschtes aus. |
| Lizenzbedingungen | CC BY-SA 4.0 Ziff. 3(a), 3(b); GPL-3.0 Ziff. 0, 4 | Namensnennung „in any reasonable manner“ reicht, ShareAlike greift erst bei Bearbeitung, GPL-„convey“ liegt bei der Quelle. | grün | TASL-Text auf jeder Karte, Vorschauen unverändert, Beschreibungstexte von Commons (CC BY-SA) werden nicht übernommen. |
| Proxy („Tunnel“) | §§ 16, 19a, 44a UrhG; EuGH Renckhoff C-161/17, ITV C-607/11; DSA Art. 4, 5 | Eigene Übertragung = eigene Wiedergabe, kein Kenntnisfilter, kein DSA-Privileg (Inhalte sind ausgewählt, nicht vom Nutzer). | rot bis gelb | Kein Proxy. Pakete (Modell + Texturen, Skill-Ordner) baut der Browser des Besuchers aus Einzeldateien der Quelle. |
| Eigene Mini-Vorschaubilder (seit 23.11.2026, Wunsch des Betreibers) | §§ 16, 19a UrhG; CC BY/BY-SA 4.0 Ziff. 2(a), 3(a); Memo-Punkt 3 | Kleine Vorschaubilder (320 px, WebP) liegen auf unserem Server. Das ist eine eigene Vervielfältigung und Zugänglichmachung, die offene Lizenzen erlauben (Formatwechsel und Verkleinerung sind keine Bearbeitung im Sinne von CC 4.0). Risiko nur bei falsch angegebener Lizenz der Quelle: dann gibt es keinen Kenntnisfilter wie bei Links. | gelb | Urheber und Lizenz an jedem Objekt, Meldeweg, Sperrliste entfernt auch das Vorschaubild beim nächsten Lauf, nur Quellen mit gepflegten Lizenzangaben. Die eigentlichen Dateien bleiben bei der Quelle. |
| API-Bedingungen | EuGH Ryanair C-30/14; § 87e UrhG | Nutzungsbedingungen binden vertraglich, sicher bei registriertem Schlüssel. | gelb | Ratenlimits eingehalten (pro Host eigener Abstand), eindeutiger User-Agent, Pflichtangaben übernommen („Powered by Poly Haven“). |
| Datenbankrecht | §§ 87a, 87b UrhG; EuGH CV-Online Latvia C-762/19 | Kompletter Katalog einer Quelle kann „wesentlicher Teil“ sein; verboten erst bei Beeinträchtigung der Investition. | gelb (mit vollständigem Abzug einer Quelle höher) | Seit dem Ausbau übernimmt Fundus bei Poly Haven, ambientCG und Fontsource nahezu den ganzen Bestand. Gegenargumente: CC0-Assets, die APIs sind ausdrücklich zur Weiterverwendung da (Poly Haven: „free to use, for any purpose“), jede Karte verlinkt zurück und Downloads laufen über die Quelle, sodass Fundus kein Ersatzprodukt ist. Trotzdem ein offener Punkt für den Betreiber. |
| Datenschutz | LG München I 3 O 17493/20 (Google Fonts); EuGH Breyer C-582/14, Fashion ID C-40/17; § 25 TDDDG; DSK-OH Digitale Dienste | IP-Übermittlung an Dritte ohne Notwendigkeit ist rechtswidrig (100 € Schadensersatz im Fall des LG). Opt-in ist der richtige Weg. | gelb, mit Opt-in grün | Standard aus, kein Fremd-Request vor dem Klick (auch kein preconnect), Schriften und Skripte selbst gehostet, Widerruf auf der Datenschutzseite. |
| Pflichttexte, DSA | § 5 DDG, § 18 MStV, Art. 13 DSGVO; DSA Art. 2, 3, 6, 11, 12, 16 | Kein Vermittlungsdienst, keine Suchmaschine im Sinne des DSA (keine Nutzerinhalte). Impressum nach MStV schon jetzt, nach DDG spätestens mit Werbung. | grün | Impressum und Datenschutz als Entwurf, Angaben in `src/betreiber.js`. Kommen Nutzer-Uploads dazu, wird Fundus Hostingdienst (Art. 16 DSA). |
| Markennamen | §§ 14, 23 MarkenG | Nennung der Quelle als Hinweis ist erlaubt. | grün | Namen nur als Text, keine Logos, Hinweis „nicht verbunden mit …“ auf der Quellenseite. |

## Offene Punkte für den Betreiber

- Betreiberangaben in `src/betreiber.js` eintragen (Name, Anschrift, E-Mail, Hoster, Log-Löschfrist).
- Ab wann Gewinnerzielungsabsicht vorliegt (Werbung, Affiliate) und ob Fundus sich wie eine Suchmaschine auf
  „Vorschaubilder III“ berufen kann.
- DPF-Zertifizierung der US-Empfänger (Wikimedia Foundation, GitHub, Openverse-Betreiber) prüfen; Rechtsmittel
  C-703/25 P gegen den EU-US-Angemessenheitsbeschluss beobachten.
- Ob das Speichern der Opt-in-Wahl in localStorage nach § 25 Abs. 2 Nr. 2 TDDDG einwilligungsfrei ist, hat keine
  Aufsichtsbehörde ausdrücklich bestätigt (gut vertretbar).
- Metadaten-Lizenzen der APIs außer Wikimedia (dort CC0) im Einzelnen.
- Openverse-Nutzungsbedingungen verbieten Scraping; der Adapter bleibt im erlaubten Seitenfenster der API (240 Treffer
  je Suchbegriff). Für deutlich mehr: erweiterten Zugang bei Openverse anfragen.
- Freesound direkt bleibt aus (API-Bedingungen § 1 und § 4 f: keine ähnlichen Datenbanken).
- Free Music Archive direkt bleibt aus (geprüft 26.11.2026, freemusicarchive.org/Terms_of_Use, „Restrictions on Use“):
  lit. d verbietet direkte Links auf einzelne Audiodateien („deep links … such as mp3 files“), also Hörproben und
  Downloads über `/track/…/stream/` und `/download/`; lit. e verbietet automatisierte Anfragen und Data Mining. Eine API
  gibt es nicht mehr (`/api` 404). robots.txt sperrt nur KI-Crawler und nennt eine Sitemap, die liefert aber nur
  Adressen, die Metadaten stünden erst auf jeder Titelseite. Der Forschungsdatensatz mdeff/fma (Metadaten CC BY 4.0,
  „meant for research purposes“) ist ein Stand von 2017 aus der abgeschalteten API und änderte nichts an lit. d.
  FMA-Titel kommen erlaubt über Wikimedia Commons (`Category:Free Music Archive`) und die Internet-Archive-Sammlung
  `freemusicarchive`. Details: `docs/stand/fundus-fma.md`.
- Internet Archive nimmt seit 26.11.2026 alle Fassungen von CC BY und BY-SA an (1.0 bis 4.0, auch Länderfassungen
  wie `by/3.0/us`, `by/2.1/jp`). Die portierten Lizenzen gewähren dieselben Rechte (vervielfältigen, bearbeiten,
  kommerziell, Namensnennung, bei SA gleiche Bedingungen), nur nach nationalem Recht formuliert. Fundus zeigt deshalb
  die echte Länderfassung („CC BY 3.0 US“ mit Link auf deren Lizenzseite), nicht die allgemeine. Weiter draußen: NC,
  ND, Sampling+, `licenses/publicdomain/` und `choose/publicdomain-2` (alte, mehrdeutige Angaben), „FMA_License“.
- Smithsonian-Nutzungsbedingungen (si.edu/termsofuse) ließen sich automatisiert nicht abrufen (Cloudflare); CC0 ist über
  die API-Doku und den AWS-Registry-Eintrag belegt. Vor dem Einschalten mit Schlüssel einmal im Browser lesen.
- OGA-BY 3.0 und 4.0 (OpenGameArt) sind seit 23.11.2026 zugelassen. Gelesen: die Lizenztexte
  (static.opengameart.org/OGA-BY-3.0.txt, opengameart.org/sites/default/files/archive/oga-by-40.txt) und die FAQ. Die
  Nutzungsrechte sind dieselben wie bei CC BY (vervielfältigen, bearbeiten, auch kommerziell), Namensnennung ist Pflicht.
  Weggefallen ist nur das Verbot technischer Schutzmaßnahmen (DRM). Wird neben CC BY angeboten, nimmt der Adapter CC BY.
- Gebaut, aber zurückgehalten (Entscheidung des Betreibers, Stand 23.11.2026):
  - Rijksmuseum: `iiif.micr.io/robots.txt` enthält erst `Allow: /`, nach dem Cloudflare-Block dann `Disallow: /` für
    alle. Bis zur Klärung gilt das Verbot.
  - National Gallery of Art: CC0 ist für die Daten belegt. Für die Bilder heißt es nur „free of charge for any use“.
    `api.nga.gov/robots.txt` bittet vor dem Crawlen um Kontakt.
  - Godot Shaders: vollständige Übernahme (rund 2.260 Shader) über einen internen Endpunkt. Wegen des Datenbankrechts
    (§ 87b UrhG, wesentlicher Teil) erst nach Rückfrage beim Betreiber der Seite.
  - Europeana: Für den Betrieb ist ein Projektschlüssel nötig, ein persönlicher Schlüssel reicht laut Bedingungen nicht.
  - SMK: rechtlich unproblematisch (Public Domain), technisch zu langsam (Bildserver rendert in 21 bis 84 s).
  - Internet Archive `computoser` (computererzeugte Musik, CC BY-SA 4.0): ob daran überhaupt ein Urheberrecht
    besteht, ist offen.
- Bewertungen: Fundus zeigt nur Bewertungen der Quellseiten (Internet Archive aus der Such-API, Blender Extensions aus den
  öffentlichen Listenseiten `/add-ons/?page=N`, robots.txt erlaubt `/`, Content-Signal `search=yes, ai-train=no, use=reference`;
  Fundus trainiert nichts und verlinkt die Quelle). Abschaltbar mit `"blender": { "bewertungen": false }`.
- Mini-Vorschaubilder: eigene Kopie auf dem Server, siehe Matrix. Bei Meldungen das Vorschaubild mit entfernen
  (passiert automatisch beim nächsten `npm run vorschau`, sobald der Eintrag gesperrt ist; danach löscht
  `npm run vorschau:r2` es aus dem R2-Bucket, im Cloudflare-Cache lebt es höchstens noch einen Tag).
- Entscheidung Fynn 23.11.2026 für fundus.fynn.land: Fundus liefert die eigenen Vorschaubilder für alle Einträge weiter
  selbst aus („So, dass wir sie weiterhin anzeigen können“), nicht nur für gemeinfreie. Der Meldeweg ist in der
  Fußzeile („Eintrag melden“, `#/melden`), auf jeder Karte und im Fundus-Abschnitt von Impressum und Datenschutz auf
  fynn.land verlinkt.

## Quellen

UrhG: https://www.gesetze-im-internet.de/urhg/ · DDG § 5: https://www.gesetze-im-internet.de/ddg/__5.html ·
MStV § 18: https://www.gesetze-bayern.de/Content/Document/MStV-18 · TDDDG § 25: https://www.gesetze-im-internet.de/ttdsg/__25.html ·
DSA: https://dejure.org/gesetze/DSA/3.html · LG München I: https://www.gesetze-bayern.de/Content/Document/Y-300-Z-BECKRS-B-2022-N-612 ·
DSK-Orientierungshilfe: https://datenschutzkonferenz-online.de/media/oh/OH_Digitale_Dienste.pdf ·
EuGH/BGH-Entscheidungen über https://dejure.org/dienste/vernetzung/rechtsprechung (Gericht, Datum, Aktenzeichen wie oben).
