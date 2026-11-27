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
  <h1>Dein Zugang für KI-Assistenten</h1>
  <div id="zugang" aria-live="polite"><p>Wird geladen …</p></div>`;
}

const kontakt = (kennung) => `<p>Brauchst du für ein Projekt mehr? Schreib mir kurz, was du baust${kennung ? `, und nenn die Kennung <code>${esc(kennung)}</code>` : ''}: auf <a href="${DISCORD}" rel="noopener" target="_blank">Discord</a> oder über das <a href="${IMPRESSUM}" rel="noopener" target="_blank">Impressum</a>.</p>`;

const kurzDatenschutz = `
  <h2>Was dabei gespeichert wird</h2>
  <p>Fundus speichert von deinem Zugang nur einen Hashwert des Schlüssels, den Tag der Erzeugung und die Zahl der Aufrufe der letzten sieben Tage. Was dein Assistent sucht, wird nicht festgehalten. Der Schlüssel selbst liegt nur in diesem Browser (<code>${MERK}</code>), und erst, wenn du auf „Zugang erzeugen“ klickst. Löschst du den Zugang, sind Hashwert und Zahlen weg. Alles Weitere steht in der <a href="${esc(BETREIBER.datenschutz)}" rel="noopener" target="_blank">Datenschutzerklärung</a>.</p>`;

function ohneZugang(g) {
  return `
  <p>Der Zugang unter <code>${MCP}</code> funktioniert ohne Anmeldung, mit ${zahl(g.anonym)} Aufrufen am Tag je Anschluss. Über claude.ai und Claude Desktop teilst du dir das Kontingent mit allen, die dort ohne eigenen Zugang unterwegs sind.</p>
  <p>Mit einem eigenen Zugang bekommst du ${zahl(g.browser)} Aufrufe am Tag nur für dich und siehst hier, wie viele du verbraucht hast. Er kostet nichts und braucht kein Konto.</p>
  <p><button type="button" class="knopf knopf--haupt" data-zugang="neu">Zugang erzeugen</button> <span id="zugang-status"></span></p>
  ${kurzDatenschutz}`;
}

function mitZugang(key, s) {
  const adresse = `${MCP}?key=${key}`;
  const rest = Math.max(0, s.grenze - s.heute);
  return `
  <p>Trag diese Adresse statt der allgemeinen in deinen KI-Assistenten ein. Behandle sie wie ein Passwort: Wer sie kennt, verbraucht dein Kontingent.</p>
  <div class="ki__adresse"><code class="ki__url">${esc(adresse)}</code><button type="button" class="knopf knopf--haupt" data-zugang="kopieren" data-text="${esc(adresse)}">Kopieren</button></div>
  ${s.gesperrt ? '<p class="hinweis">Dieser Zugang ist gesperrt. Melde dich, wenn du nicht weißt, warum.</p>' : ''}
  <h2>Verbrauch</h2>
  <p><strong>${zahl(s.heute)} von ${zahl(s.grenze)}</strong> Aufrufen heute, ${zahl(rest)} übrig. Der Zähler beginnt jeden Tag um 00:00 Uhr Weltzeit neu, in Deutschland also um 1 Uhr oder im Sommer um 2 Uhr.</p>
  <table class="zugang__tage"><thead><tr><th scope="col">Tag</th><th scope="col">Aufrufe</th></tr></thead><tbody>${[...s.tage].reverse().map((t) => `<tr><td>${esc(datum(t.tag))}</td><td>${zahl(t.n)}</td></tr>`).join('')}</tbody></table>
  <p>Kennung dieses Zugangs: <code>${esc(s.kennung)}</code>, erzeugt am ${esc(datum(s.erzeugt))}.</p>
  ${kontakt(s.kennung)}
  <p><button type="button" class="knopf" data-zugang="loeschen">Zugang löschen</button> <span id="zugang-status"></span></p>
  ${kurzDatenschutz}`;
}

async function zeigen(feld) {
  let info;
  try { info = await frage('info'); } catch { info = { ok: false }; }
  if (!info.ok) { feld.innerHTML = '<p>Die Angaben zum Zugang ließen sich gerade nicht laden. Versuch es gleich noch einmal.</p>'; return; }
  if (!info.an) {
    feld.innerHTML = `<p>Der Zugang unter <code>${MCP}</code> funktioniert ohne Anmeldung. Eigene Zugänge mit eigenem Tageskontingent sind vorbereitet, aber noch nicht eingeschaltet.</p>`;
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
      if (status) status.textContent = r.status === 429 ? 'Von diesem Anschluss wurden heute schon drei Zugänge erzeugt. Morgen geht es wieder.' : 'Das hat gerade nicht geklappt. Versuch es gleich noch einmal.';
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
  <p>Damit niemand den Zugang unter <code>${MCP}</code> mit Anfragen überflutet, zählt Fundus die Aufrufe je Tag: ohne eigenen Zugang zu einem Hashwert aus deiner IP-Adresse, dem Datum und einem geheimen Wert, der jeden Tag ein anderer ist und nach dem folgenden Tag gelöscht wird. Die IP-Adresse selbst und deine Suchbegriffe werden nicht gespeichert. Einen eigenen Zugang mit eigenem Kontingent erzeugst du freiwillig auf der Seite <a href="#/zugang">Dein Zugang</a>; dort steht auch, was dazu gespeichert wird.</p>`;
}
