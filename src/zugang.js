// The page #/zugang: a personal MCP address with its own daily allowance, and what was used of it.
// Works without an account. The key lives in this browser (localStorage "fundus.zugang") and is created only
// when the visitor presses the button, never on loading the page: that is what makes storing it lawful without a
// consent banner (§ 25 Abs. 2 Nr. 2 TDDDG, see docs/MCP-ZUGANG-ENTWURF.md). The server side is worker/zugang.mjs.
import { esc, store, zahl, datum } from './util.js';
import { BETREIBER } from './betreiber.js';
import { sitzung, sitzungVergessen, anmelden, abschliessen, verbinden, abmelden } from './konto.js';

const MERK = 'fundus.zugang';
const MCP = 'https://fundus.fynn.land/mcp';
const DISCORD = 'https://discord.gg/JTHPxAxFpE';
const IMPRESSUM = 'https://fynn.land/impressum.html';

const frage = async (pfad, body) => {
  const res = await fetch(`/api/zugang/${pfad}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const daten = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...daten };
};

export function zugangSeite() {
  return `
  <h1>Dein Zugang</h1>
  <p class="zugang__unter">Für KI-Assistenten, die über MCP im Fundus suchen.</p>
  <div class="zugang" id="zugang" aria-live="polite"><p>Wird geladen …</p></div>`;
}

/** What to tell a visitor whose new key was refused (the same limits apply on the page and through the account). */
const zuVieleText = (r) => (r.fehler === 'zuviele-heute' ? 'Heute wurden schon sehr viele Zugänge erzeugt. Morgen geht es wieder.' : 'Von diesem Anschluss wurden heute schon drei Zugänge erzeugt. Morgen geht es wieder.');

// set while the page is shown: the sign-in page's address, and a line for the next rendering
let kontoHub = null;
let kontoTage = null;
let nachricht = '';

const adressfeld = (adresse, haupt = true) => `<div class="ki__adresse"><code class="ki__url">${esc(adresse)}</code><button type="button" class="knopf${haupt ? ' knopf--haupt' : ''}" data-zugang="kopieren" data-text="${esc(adresse)}">Kopieren</button></div>`;

const gespeichert = (konto) => `
  <details class="zk zk--ruhig">
    <summary>Was dabei gespeichert wird</summary>
    <p>Fundus speichert von deinem Zugang nur einen Hashwert des Schlüssels, den Tag der Erzeugung, den Tag der letzten Nutzung und die Zahl der Aufrufe der letzten Tage. Was dein Assistent sucht, wird nicht festgehalten. Der Schlüssel selbst liegt nur in diesem Browser (<code>${MERK}</code>), und erst, wenn du auf „Zugang erzeugen“ klickst. Löschst du den Zugang, sind Hashwert und Zahlen weg. Alles Weitere steht in der <a href="${esc(BETREIBER.datenschutz)}" rel="noopener" target="_blank">Datenschutzerklärung</a>.</p>${konto ? `
    <p>Verbindest du den Zugang mit deinem fynn.land-Konto, kommt bei Fundus nur dazu, dass er ein Konto-Zugang ist, und der Tag, bis zu dem das gilt: ${kontoTage} Tage nach deinem letzten Besuch dieser Seite mit gültiger Anmeldung. Der Schlüssel liegt dann in deinem Konto. Fundus speichert weder Namen noch E-Mail-Adresse noch die Kennung deines Kontos. In diesem Browser merkt sich die Seite die Anmeldung (<code>fundus.konto</code>) bis du dich abmeldest. Nur während der Anmeldung liegen ihr Zustand und ihr Prüfwert dort (<code>fundus.anmeldung</code>, höchstens 15 Minuten). Löschst du den Zugang, verschwindet der Schlüssel auch aus deinem Konto.</p>` : ''}
  </details>`;

const mehr = (kennung) => `
  <section class="zk">
    <h2>Mehr für ein Projekt</h2>
    <p>Reicht das Kontingent nicht, schreib mir kurz, was du baust${kennung ? ', und nenn diese Kennung' : ''}. Dann schalte ich dir mehr frei.</p>
    ${kennung ? `<p class="zugang__kennung"><span>Kennung</span><code>${esc(kennung)}</code></p>` : ''}
    <p class="zugang__wege"><a class="knopf" href="${DISCORD}" rel="noopener" target="_blank">Discord</a><a class="knopf" href="${IMPRESSUM}" rel="noopener" target="_blank">Kontakt im Impressum</a></p>
  </section>`;

/** The card "Mit fynn.land-Konto". k = { ersetzt, bis } while signed in; s = the key's state, if there is one. */
function kontoKarte(g, k, s) {
  if (kontoHub === null) return '';
  const meldung = nachricht ? `<p class="hinweis" role="status">${esc(nachricht)}</p>` : '';
  const status = '<p class="zugang__klein" id="konto-status" role="status"></p>';
  if (k) {
    return `
  <section class="zk zugang__konto">
    <h2>Mit fynn.land-Konto verbunden</h2>
    ${meldung}
    <p>Dein Zugang ist mit deinem fynn.land-Konto verbunden: ${zahl(g.konto)} Aufrufe am Tag, und er ist auf jedem Gerät da, auf dem du dich anmeldest.</p>
    ${k.ersetzt ? '<p class="zugang__klein">Der Zugang, den dieser Browser vorher hatte, bleibt bestehen, wird hier aber nicht mehr angezeigt. Ab jetzt gilt der aus deinem Konto.</p>' : ''}
    <p class="zugang__klein">Die Verbindung gilt ${kontoTage} Tage ab dem letzten Besuch dieser Seite, derzeit bis zum ${esc(datum(k.bis))}. Meldest du dich ab, bleibt der Zugang in diesem Browser mit ${zahl(g.browser)} Aufrufen am Tag. Der Schlüssel bleibt in deinem Konto, bis du den Zugang löschst.</p>
    <p><button type="button" class="knopf knopf--klein" data-zugang="trennen">Abmelden</button></p>
    ${status}
  </section>`;
  }
  const verbunden = s?.stufe === 'konto';
  return `
  <section class="zk zugang__konto">
    <h2>Mit fynn.land-Konto</h2>
    ${meldung}
    <p>${verbunden ? 'Dieser Zugang hängt an einem fynn.land-Konto, aber du bist hier nicht angemeldet. Melde dich an, damit die Verbindung bestehen bleibt.' : `Mit deinem fynn.land-Konto bekommst du ${zahl(g.konto)} Aufrufe am Tag statt ${zahl(g.browser)}, und dein Zugang ist auf jedem Gerät da, auf dem du dich anmeldest.`}</p>
    <p><button type="button" class="knopf${verbunden ? '' : ' knopf--haupt'}" data-zugang="anmelden">Mit Konto anmelden</button></p>
    <p class="zugang__klein">Du gehst kurz zu fynn.land und kommst hierher zurück. Fundus speichert weder deinen Namen noch deine E-Mail-Adresse noch die Kennung deines Kontos.</p>
    ${status}
  </section>`;
}

/** The ring: how much of today's allowance is used. Drawn as two circles, the second one cut to the share. */
function ring(heute, grenze) {
  const r = 52;
  const umfang = 2 * Math.PI * r;
  const anteil = grenze > 0 ? Math.min(1, heute / grenze) : 1;
  return `<svg class="zugang__ring" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="${zahl(heute)} von ${zahl(grenze)} Aufrufen heute verbraucht">
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--flaeche-2)" stroke-width="12" />
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--akzent)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(anteil * umfang).toFixed(1)} ${umfang.toFixed(1)}" transform="rotate(-90 64 64)"${anteil === 0 ? ' opacity="0"' : ''} />
    <text x="64" y="62" text-anchor="middle" class="zugang__zahl">${zahl(heute)}</text>
    <text x="64" y="82" text-anchor="middle" class="zugang__von">von ${zahl(grenze)}</text>
  </svg>`;
}

const wochentag = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/** Seven days as bars; a list, so a screen reader reads day and number. */
function woche(tage) {
  const hoch = Math.max(1, ...tage.map((t) => t.n));
  return `<ol class="zugang__woche">${tage.map((t, i) => `<li${i === tage.length - 1 ? ' class="ist-heute"' : ''}><span class="zugang__n">${zahl(t.n)}</span><span class="zugang__saeule"><span class="zugang__balken" style="height:${Math.max(3, Math.round((t.n / hoch) * 100))}%"></span></span><span class="zugang__tag">${i === tage.length - 1 ? 'Heute' : esc(wochentag.format(new Date(`${t.tag}T12:00:00Z`)).replace('.', ''))}</span></li>`).join('')}</ol>`;
}

function ohneZugang(g, konto) {
  return `
  <div class="zugang__stufen">
    <section class="zk">
      <h2>Ohne Zugang</h2>
      <p class="zugang__gross">${zahl(g.anonym)}</p>
      <p class="zugang__klein">Aufrufe am Tag je Anschluss. Über claude.ai und Claude Desktop teilst du dir ein Kontingent mit allen, die dort ohne eigenen Zugang suchen.</p>
    </section>
    <section class="zk zk--wahl">
      <h2>Eigener Zugang</h2>
      <p class="zugang__gross">${zahl(g.browser)}</p>
      <p class="zugang__klein">Aufrufe am Tag nur für dich, mit Übersicht über deinen Verbrauch. Kostet nichts und braucht kein Konto.</p>
      <p><button type="button" class="knopf knopf--haupt" data-zugang="neu">Zugang erzeugen</button></p>
      <p class="zugang__klein" id="zugang-status"></p>
    </section>
  </div>
  ${konto}
  ${mehr(null)}
  ${gespeichert(Boolean(konto))}`;
}

function mitZugang(key, s, konto) {
  const adresse = `${MCP}?key=${key}`;
  const rest = Math.max(0, s.grenze - s.heute);
  return `
  ${s.gesperrt ? '<p class="hinweis">Dieser Zugang ist gesperrt. Melde dich, wenn du nicht weißt, warum.</p>' : ''}
  <div class="zugang__oben">
    <section class="zk zugang__heute">
      <h2>Heute</h2>
      ${ring(s.heute, s.grenze)}
      <p class="zugang__klein">${rest ? `${zahl(rest)} übrig.` : 'Für heute aufgebraucht.'} Neu ab 1 Uhr, im Sommer ab 2 Uhr.</p>
    </section>
    <section class="zk">
      <h2>Deine Adresse</h2>
      <p>Trag sie statt der allgemeinen Adresse in deinen KI-Assistenten ein.</p>
      ${adressfeld(adresse)}
      <p class="zugang__klein">Behandle sie wie ein Passwort: Wer sie kennt, verbraucht dein Kontingent.</p>
    </section>
  </div>
  <section class="zk">
    <h2>Letzte sieben Tage</h2>
    ${woche(s.tage)}
  </section>
  ${konto}
  ${mehr(s.kennung)}
  ${gespeichert(Boolean(konto))}
  <p class="zugang__ende">Zugang erzeugt am ${esc(datum(s.erzeugt))}. <button type="button" class="knopf knopf--klein" data-zugang="loeschen">Zugang löschen</button> <span id="zugang-status"></span></p>`;
}

/** What the visitor is told when a sign-in or a call to the account did not work. */
function kontoProblem(r) {
  if (r.fehler === 'konto-zuviele') return 'Das Konto bekommt gerade zu viele Anfragen. Versuch es gleich noch einmal.';
  if (r.status === 429) return zuVieleText(r);
  if (r.fehler === 'sitzung') return 'Deine Anmeldung ist abgelaufen. Melde dich neu an, damit dein Zugang mit Konto weiter gilt.';
  return 'Das Konto ist gerade nicht erreichbar. Dein Zugang gilt weiter wie bisher.';
}
const ruckText = { abgebrochen: 'Die Anmeldung wurde abgebrochen.', 'anderer-tab': 'Die Anmeldung konnte nicht abgeschlossen werden, weil sie in einem anderen Tab begonnen wurde oder zu lange gedauert hat. Versuch es noch einmal.', code: 'Die Anmeldung hat nicht geklappt. Versuch es noch einmal.', 'nicht-bereit': 'Die Anmeldung mit dem Konto ist noch nicht freigeschaltet.', konto: 'Das Konto ist gerade nicht erreichbar. Versuch es gleich noch einmal.' };

async function zeigen(feld) {
  let info;
  try { info = await frage('info'); } catch { info = { ok: false }; }
  if (!info.ok) { feld.innerHTML = '<p>Die Angaben zum Zugang ließen sich gerade nicht laden. Versuch es gleich noch einmal.</p>'; return; }
  if (!info.an) {
    feld.innerHTML = `
    <section class="zk">
      <h2>Adresse für alle</h2>
      <p>Trag sie in deinen KI-Assistenten ein. Eine Anmeldung brauchst du nicht.</p>
      ${adressfeld(MCP)}
      <p class="zugang__klein">Eigene Zugänge mit eigenem Tageskontingent und einer Übersicht über den Verbrauch sind vorbereitet und werden bald eingeschaltet.</p>
    </section>`;
    return;
  }
  kontoHub = info.konto ? info.hub : null;
  kontoTage = info.konto ? info.kontoTage : null;
  let key = store.get(MERK);
  let k = null;          // while a valid session is there: { ersetzt, bis }
  let stand = null;      // the key's state, as far as the account call already told it
  let hinweis = '';
  if (info.konto) {
    const rueck = await abschliessen();
    if (rueck && !rueck.ok) hinweis = ruckText[rueck.grund] ?? ruckText.konto;
    if (sitzung()) {
      // opening the page with a valid session also renews the ninety days
      const r = await verbinden(key);
      if (r.ok) { key = r.key; store.set(MERK, key); stand = r; k = { ersetzt: r.ersetzt, bis: r.kontoBis }; }
      else {
        if (r.status === 401) sitzungVergessen();
        hinweis = kontoProblem(r);
      }
    }
  }
  nachricht = nachricht || hinweis;
  const karte = (s) => { const t = kontoKarte(info.grenzen, k, s); nachricht = ''; return t; };
  if (!key) { feld.innerHTML = ohneZugang(info.grenzen, karte(null)); return; }
  const s = stand ?? await frage('stand', { key }).catch(() => ({ ok: false, status: 0 }));
  if (s.ok) { feld.innerHTML = mitZugang(key, s, karte(s)); return; }
  if (s.status === 404) {
    // deleted on the server (ninety unused days, or deleted from another tab): the address here is dead
    store.remove(MERK);
    feld.innerHTML = `<p class="hinweis">Der Zugang, den dieser Browser sich gemerkt hatte, existiert nicht mehr.</p>${ohneZugang(info.grenzen, karte(null))}`;
    return;
  }
  feld.innerHTML = '<p>Der Verbrauch ließ sich gerade nicht laden. Dein Zugang ist davon nicht betroffen; versuch es gleich noch einmal.</p>';
}

/** Called by the router after the page is in the document. */
export function zugangBereit(main) {
  const feld = main.querySelector('#zugang');
  if (!feld) return;
  zeigen(feld);
  feld.addEventListener('click', async (e) => {
    const knopf = e.target.closest('[data-zugang]');
    if (!knopf) return;
    const was = knopf.dataset.zugang;
    const status = feld.querySelector(was === 'anmelden' || was === 'trennen' ? '#konto-status' : '#zugang-status');
    if (was === 'kopieren') {
      try { await navigator.clipboard.writeText(knopf.dataset.text); knopf.textContent = 'Kopiert'; } catch { getSelection().selectAllChildren(knopf.parentElement.querySelector('code')); knopf.textContent = 'Markiert'; }
      setTimeout(() => { knopf.textContent = 'Kopieren'; }, 1800);
      return;
    }
    knopf.disabled = true;
    if (was === 'neu') {
      const r = await frage('neu', {}).catch(() => ({ ok: false, status: 0 }));
      if (r.ok && r.key) { store.set(MERK, r.key); feld.innerHTML = mitZugang(r.key, r); return; }
      if (status) status.textContent = r.status === 429 ? zuVieleText(r) : 'Das hat gerade nicht geklappt. Versuch es gleich noch einmal.';
    }
    if (was === 'anmelden') {
      if (!(await anmelden(kontoHub))) { if (status) status.textContent = 'Dein Browser lässt die Anmeldung nicht zu, weil er für diese Seite nichts zwischenspeichern darf.'; knopf.disabled = false; }
      return; // the page is being left
    }
    if (was === 'trennen') {
      const r = await abmelden(store.get(MERK));
      if (r.ok) { nachricht = 'Du bist abgemeldet. Der Zugang bleibt in diesem Browser und zählt wieder wie ein Zugang ohne Konto.'; await zeigen(feld); return; }
      if (status) status.textContent = 'Das Abmelden hat gerade nicht geklappt. Versuch es gleich noch einmal.';
    }
    if (was === 'loeschen') {
      const r = await frage('loeschen', { key: store.get(MERK), ...(sitzung() ? { session: sitzung() } : {}) }).catch(() => ({ ok: false }));
      if (r.ok) { store.remove(MERK); sitzungVergessen(); await zeigen(feld); return; }
      if (status) status.textContent = 'Das Löschen hat gerade nicht geklappt. Versuch es gleich noch einmal.';
    }
    knopf.disabled = false;
  });
}

/** Privacy page: the short paragraph on the allowances, shown only while they are switched on. */
export async function datenschutzBereit(main) {
  const feld = main.querySelector('#ds-zugang');
  if (!feld) return;
  const info = await frage('info').catch(() => ({ ok: false }));
  if (!info.ok || !info.an) return;
  feld.innerHTML = `
  <h2>Zugang für KI-Assistenten</h2>
  <p>Damit niemand den Zugang unter <code>${MCP}</code> mit Anfragen überflutet, zählt Fundus die Aufrufe je Tag: ohne eigenen Zugang zu einem Hashwert aus deiner IP-Adresse, dem Datum und einem geheimen Wert, der jeden Tag ein anderer ist und nach dem folgenden Tag gelöscht wird. Die IP-Adresse selbst und deine Suchbegriffe werden nicht gespeichert. Einen eigenen Zugang mit eigenem Kontingent erzeugst du freiwillig auf der Seite <a href="#/zugang">Dein Zugang</a>; dort steht auch, was dazu gespeichert wird. Dein Browser merkt sich den Schlüssel dann im lokalen Speicher (<code>${MERK}</code>). Du löschst ihn auf derselben Seite; der Knopf unten lässt ihn stehen.</p>${info.konto ? `
  <p>Wenn du deinen Zugang mit deinem fynn.land-Konto verbindest, speichert Fundus dazu nur, dass er ein Konto-Zugang ist, und den Tag, bis zu dem das gilt (${info.kontoTage} Tage nach deinem letzten Besuch von <a href="#/zugang">Dein Zugang</a> mit gültiger Anmeldung). Der Schlüssel liegt dann in deinem Konto. Fundus speichert weder deinen Namen noch deine E-Mail-Adresse noch die Kennung deines Kontos. Dein Browser merkt sich die Anmeldung im lokalen Speicher (<code>fundus.konto</code>), bis du dich auf derselben Seite abmeldest; während der Anmeldung liegen dort kurz ihr Zustand und ihr Prüfwert (<code>fundus.anmeldung</code>, höchstens 15 Minuten).</p>` : ''}`;
}
