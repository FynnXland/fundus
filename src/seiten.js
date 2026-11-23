import { BETREIBER } from './betreiber.js';
import { ARTEN } from './katalog.js';
import { vorschau } from './vorschau.js';
import { esc, safeUrl, zahl, datum, store } from './util.js';

const luecke = (was) => `<span class="platzhalterdaten">[${esc(was)} fehlt noch]</span>`;
const wert = (v, was) => (v ? esc(v) : luecke(was));

// Hosts that previews load from, per source. Shown in the privacy policy and kept next to the adapters.
const VORSCHAU_HOSTS = [
  ['Openverse', 'api.openverse.org (Vorschaubilder) sowie die Server der dort verzeichneten Anbieter, etwa live.staticflickr.com und cdn.freesound.org'],
  ['Wikimedia Commons (Bilder, Audio, Video)', 'upload.wikimedia.org, thumb.wikimedia.org'],
  ['Poly Haven', 'cdn.polyhaven.org, dl.polyhaven.org'],
  ['ambientCG', 'acg-media.struffelproductions.com'],
  ['Fontsource', 'cdn.jsdelivr.net'],
  ['Iconify', 'api.iconify.design'],
  ['Smithsonian Open Access', 'ids.si.edu, 3d-api.si.edu, smithsonian-open-access.s3-us-west-2.amazonaws.com'],
  ['Internet Archive', 'archive.org und die Download-Server, auf die es weiterleitet (dn….ca.archive.org, ia….us.archive.org)'],
  ['Cleveland Museum of Art', 'openaccess-cdn.clevelandart.org'],
  ['Wellcome Collection', 'iiif.wellcomecollection.org'],
  ['Khronos glTF Sample Assets', 'raw.githubusercontent.com'],
  ['Godot Asset Library', 'raw.githubusercontent.com, user-images.githubusercontent.com, media.githubusercontent.com, github.com, gitlab.com, codeberg.org'],
  ['OpenGameArt.org', 'opengameart.org'],
  ['Openclipart', 'openclipart.org'],
];

function quellen({ katalog, fehler }) {
  const stand = katalog?.stand;
  const liste = stand
    ? stand.sources
        .map(
          (s) => `<li><a href="${esc(safeUrl(s.url))}" rel="noopener noreferrer" target="_blank">${esc(s.name)}</a><span class="zahl">${zahl(s.count)} Einträge</span><span class="klein">${esc(s.kinds.map((k) => ARTEN[k]?.label).join(', '))} · <a href="${esc(safeUrl(s.terms))}" rel="noopener noreferrer" target="_blank">Nutzungsbedingungen</a>${s.hinweis ? ` · ${esc(s.hinweis)}` : ''}</span></li>`,
        )
        .join('')
    : `<li>${fehler ? 'Die Liste der Quellen ließ sich gerade nicht laden.' : 'Wird geladen …'}</li>`;
  return `
  <h1>Quellen &amp; Lizenzen</h1>
  <p>Fundus ist ein Katalog, kein Lager. Ein Crawler fragt die öffentlichen Schnittstellen der Quellen ab und übernimmt Angaben über ein Werk: Titel, Urheber, Lizenz, Ursprungsseite und die Adressen der Dateien. Downloads, große Vorschauen, Hörproben und 3D-Ansichten lädt dein Browser direkt bei der Quelle.</p>
  <p>Eine Ausnahme gibt es: Für jedes Objekt mit Bild legt Fundus ein kleines Vorschaubild ab, 320 Pixel breit, damit der Katalog ohne Anfragen an fremde Server etwas zeigen kann. Schriften bekommen ein Musterbild, das die Buchstaben „Aa“ in der Schrift selbst zeigt. Die offenen Lizenzen erlauben diese Kopie; Urheber und Lizenz stehen an jedem Objekt.</p>

  <h2>Welche Lizenzen aufgenommen werden</h2>
  <p>Nur Lizenzen, die Nutzung, Änderung und Weitergabe erlauben, auch für kommerzielle Projekte:</p>
  <ul>
    <li>gemeinfrei: CC0, Public Domain Mark und Werke, deren Schutz abgelaufen ist</li>
    <li>Creative Commons BY und BY-SA</li>
    <li>offene Softwarelizenzen wie MIT, Apache 2.0, BSD, MPL und GPL</li>
    <li>die SIL Open Font License für Schriften</li>
  </ul>
  <p>Werke mit dem Zusatz NC (nicht kommerziell) oder ND (keine Bearbeitung) fallen heraus, ebenso alles, dessen Lizenz die Quelle nicht eindeutig angibt. Die Lizenz übernimmt Fundus so, wie die Quelle sie nennt. Stimmt sie dort nicht, stimmt sie auch hier nicht. Für solche Fälle gibt es auf jeder Karte den Link „Eintrag melden“.</p>

  <h2>Woher die Einträge kommen</h2>
  <p>Stand der Daten: ${esc(datum(stand?.crawledAt))}.</p>
  <ul class="quellenliste">${liste}</ul>
  <p>Fundus ist mit keiner dieser Quellen verbunden und wird von ihnen weder betrieben noch empfohlen. Die Namen stehen hier nur, damit klar ist, woher ein Werk kommt. 3D-Modelle, Texturen und HDRIs von Poly Haven: Powered by <a href="https://polyhaven.com" rel="noopener noreferrer" target="_blank">Poly Haven</a>.</p>

  <h2>Doppelte Einträge</h2>
  <p>Viele Werke liegen bei mehreren Quellen. Fundus führt sie zusammen, wenn die Quellen dieselbe Prüfsumme der Datei nennen (Wikimedia Commons und Poly Haven veröffentlichen sie), wenn zwei Skills denselben SKILL.md-Text haben oder wenn zwei Fotos aus verschiedenen Quellen im Vorschaubild praktisch identisch sind. Das zusammengeführte Objekt nennt im Reiter „Herkunft“ die weiteren Quellen.${stand?.zusammengefuehrt ? ` Beim letzten Abgleich waren es ${zahl(stand.zusammengefuehrt)} Doppelte.` : ''}</p>

  <h2>Tote Links</h2>
  <p>Bei jedem Abgleich fragt eine Linkprüfung jede Ursprungsseite, jedes Vorschaubild und jede Download-Adresse ab. Schlägt sie bei einem Eintrag zweimal hintereinander fehl, verschwindet er aus dem Katalog. Ein einzelner Fehlschlag reicht dafür nicht, denn auch große Server antworten gelegentlich eine Minute lang nicht.</p>

  <h2>Namensnennung</h2>
  <p>Jede Karte hat einen fertigen Text zum Kopieren, mit Titel, Urheber, Ursprungsseite und Lizenz. Bei CC BY und BY-SA ist diese Angabe Pflicht, bei CC0 und gemeinfreien Werken freiwillig. Die Kurzbeschreibungen der Lizenzen auf den Karten sind eine Lesehilfe ohne Gewähr. Was gilt, steht im verlinkten Lizenztext.</p>`;
}

function impressum() {
  return `
  <h1>Impressum</h1>
  <p class="hinweis">Entwurf. Vor der Veröffentlichung müssen die markierten Angaben in <code>src/betreiber.js</code> stehen.</p>
  <h2>Angaben nach § 5 DDG und § 18 Abs. 1 MStV</h2>
  <p>${wert(BETREIBER.name, 'Name')}<br />${wert(BETREIBER.anschrift, 'Anschrift')}</p>
  <h2>Kontakt</h2>
  <p>E-Mail: ${BETREIBER.email ? `<a href="mailto:${esc(BETREIBER.email)}">${esc(BETREIBER.email)}</a>` : luecke('E-Mail-Adresse')}</p>
  <h2>Verantwortlich für den Inhalt</h2>
  <p>${wert(BETREIBER.name, 'Name')}, Anschrift wie oben.</p>
  <h2>Inhalte Dritter</h2>
  <p>Die Werke im Katalog stammen von Dritten und liegen auf deren Servern. Fundus übernimmt Titel, Urheber und Lizenz so, wie die jeweilige Quelle sie angibt. Wer einen Fehler oder eine Rechtsverletzung findet, kann den Eintrag über die Seite <a href="#/melden">Eintrag melden</a> mitteilen. Gemeldete Einträge nehmen wir bis zur Klärung aus dem Katalog.</p>`;
}

function datenschutz() {
  const an = vorschau.an();
  return `
  <h1>Datenschutz</h1>
  <p class="hinweis">Entwurf. Die markierten Angaben fehlen noch, ein Abgleich mit dem tatsächlichen Hosting steht aus.</p>

  <h2>Verantwortlich</h2>
  <p>${wert(BETREIBER.name, 'Name')}, ${wert(BETREIBER.anschrift, 'Anschrift')}, ${BETREIBER.email ? esc(BETREIBER.email) : luecke('E-Mail-Adresse')}.</p>

  <h2>Beim Aufruf der Seite</h2>
  <p>Die Seite liegt bei ${wert(BETREIBER.hoster, 'Webhoster')}. Dessen Server speichert bei jedem Abruf, wie bei jeder Website üblich, IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browserkennung in einem Protokoll. Das dient dem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Gelöscht wird das Protokoll nach ${BETREIBER.logTage ? `${esc(String(BETREIBER.logTage))} Tagen` : luecke('Löschfrist')}.</p>
  <p>Fundus setzt keine Cookies und nutzt weder Statistik- noch Werbedienste. Schriften, Programmcode und die kleinen Vorschaubilder im Katalog liefert der eigene Server aus, ohne Umweg über fremde Netzwerke.</p>

  <h2>Vorschauen von den Quellen</h2>
  <p>Große Vorschaubilder, Hörproben, 3D-Modelle und Schriftproben liegen bei den Quellen. Fundus lädt sie erst, wenn du es willst: entweder über den Schalter „Vorschauen von Quellen“ oben auf der Seite oder einzeln über den Knopf in der Detailansicht eines Objekts. Dann ruft dein Browser die Datei direkt beim Server der Quelle ab. Mit eingeschaltetem Schalter zeigt der Katalog außerdem für Objekte, die noch kein eigenes Vorschaubild haben, ein kleines Bild der Quelle; es lädt erst, wenn die Karte in die Nähe des sichtbaren Bereichs kommt. Der erfährt dabei deine IP-Adresse, den Zeitpunkt, die Datei und deine Browserkennung. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit über denselben Schalter oder den Knopf unten zurücknehmen kannst.</p>
  <p>Je nach Quelle gehen die Anfragen an diese Server:</p>
  <ul>${VORSCHAU_HOSTS.map(([n, h]) => `<li>${esc(n)}: ${esc(h)}</li>`).join('')}</ul>
  <p>Mehrere dieser Anbieter sitzen in den USA, etwa die Wikimedia Foundation und GitHub. Für Übermittlungen dorthin gilt der Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework, soweit der Empfänger danach zertifiziert ist. ${luecke('Prüfung der Zertifizierung je Empfänger')}</p>

  <h2>Downloads und Links</h2>
  <p>Ein Klick auf einen Download lädt die Datei direkt vom Server der Quelle, ein Klick auf „Ursprungsseite“ öffnet deren Website. Für beides gilt die Datenschutzerklärung der jeweiligen Quelle. Pakete (etwa ein 3D-Modell mit Texturen oder ein Skill-Ordner von raw.githubusercontent.com) holt dein Browser Datei für Datei von der Quelle und packt sie auf deinem Gerät zu einer ZIP-Datei.</p>

  <h2>Gespeicherte Einstellungen</h2>
  <p>Drei Einstellungen merkt sich die Seite im lokalen Speicher deines Browsers: ob Vorschauen von den Quellen laden sollen (<code>fundus.vorschau</code>), ob du das helle oder dunkle Farbschema gewählt hast (<code>fundus.thema</code>) und ob du Symbole oder eine Liste sehen willst (<code>fundus.ansicht</code>). Alles bleibt auf deinem Gerät, wird nie übertragen und entsteht nur, wenn du die jeweilige Einstellung änderst (§ 25 Abs. 2 Nr. 2 TDDDG).</p>
  <p><button type="button" class="knopf" id="einstellungenweg">Vorschauen ausschalten und Einstellungen löschen</button> <span id="einstellungenstatus" aria-live="polite">${an ? 'Vorschauen sind gerade eingeschaltet.' : 'Vorschauen sind gerade ausgeschaltet.'}</span></p>

  <h2>Deine Rechte</h2>
  <p>Du kannst Auskunft über deine Daten verlangen, ihre Berichtigung, Löschung oder eingeschränkte Verarbeitung, außerdem kannst du der Verarbeitung widersprechen und eine Kopie in einem gängigen Format bekommen (Art. 15 bis 21 DSGVO). Fundus selbst speichert über dich nichts außer dem Server-Protokoll. Beschweren kannst du dich bei einer Datenschutz-Aufsichtsbehörde, zum Beispiel der deines Bundeslandes.</p>`;
}

function melden({ katalog, params }) {
  const id = params.get('id');
  // byId holds index rows (titel, quellname), not full entries; the row has no source address, the card link does
  const zeile = id ? katalog?.byId.get(id) : null;
  const it = zeile ? { id: zeile.id, sig: zeile.sig, title: zeile.titel ?? zeile.title, source: { name: zeile.quellname ?? zeile.source?.name } } : null;
  const karte = it ? `${location.origin}${location.pathname}#/karte/${encodeURIComponent(it.id)}` : '';
  const betreff = it ? `Fundus-Meldung ${it.sig}: ${it.title}` : 'Fundus-Meldung';
  const text = it ? `Eintrag: ${it.title}\nSignatur: ${it.sig}\nKennung: ${it.id}\nQuelle: ${it.source.name}\nKarte: ${karte}\n\nWas stimmt nicht?\n` : 'Welcher Eintrag (Titel oder Signatur)?\n\nWas stimmt nicht?\n';
  const mail = BETREIBER.email
    ? `<p><a class="knopf knopf--haupt" href="mailto:${esc(BETREIBER.email)}?subject=${encodeURIComponent(betreff)}&amp;body=${encodeURIComponent(text)}">E-Mail mit diesen Angaben schreiben</a></p>`
    : `<p>${luecke('Kontaktadresse für Meldungen')}</p>`;
  return `
  <h1>Eintrag melden</h1>
  ${it ? `<p>Es geht um <strong>${esc(it.title)}</strong> (Signatur <span class="kf__sig">${esc(it.sig)}</span>) von ${esc(it.source.name)}.</p>` : ''}
  <p>Melde einen Eintrag, wenn die Lizenz falsch angegeben ist, ein Werk ohne Erlaubnis bei der Quelle liegt, du als Urheber nicht im Katalog stehen willst oder die Datei nicht mehr erreichbar ist. Bis zur Klärung nehmen wir den Eintrag aus dem Katalog.</p>
  <p>Beachte: Die Datei selbst liegt bei der Quelle. Soll sie dort verschwinden, wende dich zusätzlich an die Quelle${it ? `, also an <a href="${esc(safeUrl(it.source.url))}" rel="noopener noreferrer" target="_blank">${esc(it.source.name)}</a>` : ''}.</p>
  ${mail}`;
}

export const SEITEN = {
  quellen: { titel: 'Quellen & Lizenzen', braucht: 'stand', html: quellen },
  impressum: { titel: 'Impressum', html: impressum },
  datenschutz: { titel: 'Datenschutz', html: datenschutz },
  melden: { titel: 'Eintrag melden', braucht: 'stand', html: melden },
};

// The delete button on the privacy page.
document.addEventListener('click', (e) => {
  if (e.target.id !== 'einstellungenweg') return;
  vorschau.setzen(false);
  store.remove('fundus.thema');
  store.remove('fundus.ansicht');
  delete document.documentElement.dataset.theme;
  document.dispatchEvent(new Event('fundus:thema-zurueck'));
  const s = document.getElementById('einstellungenstatus');
  if (s) s.textContent = 'Erledigt. Vorschauen sind aus, gespeicherte Einstellungen gelöscht.';
});
