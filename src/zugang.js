// The page #/zugang: a personal MCP address with its own daily allowance, and what was used of it.
// Works without an account. The key lives in this browser (localStorage "fundus.zugang") and is created only
// when the visitor presses the button, never on loading the page: that is what makes storing it lawful without a
// consent banner (§ 25 Abs. 2 Nr. 2 TDDDG, see docs/MCP-ZUGANG-ENTWURF.md). The server side is worker/zugang.mjs.
import { esc, store, zahl, datum } from './util.js';
import { BETREIBER } from './betreiber.js';

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

const adressfeld = (adresse, haupt = true) => `<div class="ki__adresse"><code class="ki__url">${esc(adresse)}</code><button type="button" class="knopf${haupt ? ' knopf--haupt' : ''}" data-zugang="kopieren" data-text="${esc(adresse)}">Kopieren</button></div>`;

const gespeichert = `
  <details class="zk zk--ruhig">
    <summary>Was dabei gespeichert wird</summary>
    <p>Fundus speichert von deinem Zugang nur einen Hashwert des Schlüssels, den Tag der Erzeugung, den Tag der letzten Nutzung und die Zahl der Aufrufe der letzten Tage. Was dein Assistent sucht, wird nicht festgehalten. Der Schlüssel selbst liegt nur in diesem Browser (<code>${MERK}</code>), und erst, wenn du auf „Zugang erzeugen“ klickst. Löschst du den Zugang, sind Hashwert und Zahlen weg. Alles Weitere steht in der <a href="${esc(BETREIBER.datenschutz)}" rel="noopener" target="_blank">Datenschutzerklärung</a>.</p>
  </details>`;

const mehr = (kennung) => `
  <section class="zk">
    <h2>Mehr für ein Projekt</h2>
    <p>Reicht das Kontingent nicht, schreib mir kurz, was du baust${kennung ? ', und nenn diese Kennung' : ''}. Dann schalte ich dir mehr frei.</p>
    ${kennung ? `<p class="zugang__kennung"><span>Kennung</span><code>${esc(kennung)}</code></p>` : ''}
    <p class="zugang__wege"><a class="knopf" href="${DISCORD}" rel="noopener" target="_blank">Discord</a><a class="knopf" href="${IMPRESSUM}" rel="noopener" target="_blank">Kontakt im Impressum</a></p>
  </section>`;

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

function ohneZugang(g) {
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
  ${mehr(null)}
  ${gespeichert}`;
}

function mitZugang(key, s) {
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
  ${mehr(s.kennung)}
  ${gespeichert}
  <p class="zugang__ende">Zugang erzeugt am ${esc(datum(s.erzeugt))}. <button type="button" class="knopf knopf--klein" data-zugang="loeschen">Zugang löschen</button> <span id="zugang-status"></span></p>`;
}

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
  const key = store.get(MERK);
  if (!key) { feld.innerHTML = ohneZugang(info.grenzen); return; }
  const s = await frage('stand', { key }).catch(() => ({ ok: false, status: 0 }));
  if (s.ok) { feld.innerHTML = mitZugang(key, s); return; }
  if (s.status === 404) {
    // deleted on the server (ninety unused days, or deleted from another tab): the address here is dead
    store.remove(MERK);
    feld.innerHTML = `<p class="hinweis">Der Zugang, den dieser Browser sich gemerkt hatte, existiert nicht mehr.</p>${ohneZugang(info.grenzen)}`;
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
    const status = feld.querySelector('#zugang-status');
    const was = knopf.dataset.zugang;
    if (was === 'kopieren') {
      try { await navigator.clipboard.writeText(knopf.dataset.text); knopf.textContent = 'Kopiert'; } catch { getSelection().selectAllChildren(knopf.parentElement.querySelector('code')); knopf.textContent = 'Markiert'; }
      setTimeout(() => { knopf.textContent = 'Kopieren'; }, 1800);
      return;
    }
    knopf.disabled = true;
    if (was === 'neu') {
      const r = await frage('neu', {}).catch(() => ({ ok: false, status: 0 }));
      if (r.ok && r.key) { store.set(MERK, r.key); feld.innerHTML = mitZugang(r.key, r); return; }
      if (status) status.textContent = r.fehler === 'zuviele-heute' ? 'Heute wurden schon sehr viele Zugänge erzeugt. Morgen geht es wieder.' : r.status === 429 ? 'Von diesem Anschluss wurden heute schon drei Zugänge erzeugt. Morgen geht es wieder.' : 'Das hat gerade nicht geklappt. Versuch es gleich noch einmal.';
    }
    if (was === 'loeschen') {
      const r = await frage('loeschen', { key: store.get(MERK) }).catch(() => ({ ok: false }));
      if (r.ok) { store.remove(MERK); await zeigen(feld); return; }
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
  <p>Damit niemand den Zugang unter <code>${MCP}</code> mit Anfragen überflutet, zählt Fundus die Aufrufe je Tag: ohne eigenen Zugang zu einem Hashwert aus deiner IP-Adresse, dem Datum und einem geheimen Wert, der jeden Tag ein anderer ist und nach dem folgenden Tag gelöscht wird. Die IP-Adresse selbst und deine Suchbegriffe werden nicht gespeichert. Einen eigenen Zugang mit eigenem Kontingent erzeugst du freiwillig auf der Seite <a href="#/zugang">Dein Zugang</a>; dort steht auch, was dazu gespeichert wird. Dein Browser merkt sich den Schlüssel dann im lokalen Speicher (<code>${MERK}</code>). Du löschst ihn auf derselben Seite; der Knopf unten lässt ihn stehen.</p>`;
}
