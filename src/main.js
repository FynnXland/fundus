import './styles.css';
import { ladeKatalog, beimNachladen, filtern, bedarf, hat, hole, hatKopf2, ladeKopf2, nurKoepfe, zusammenfassen, gruppeVon, artVonSerie, ARTEN, LIZENZGRUPPEN, SORTIERUNGEN, STANDARD_SORT } from './katalog.js';
import { vorschau, hoerprobe, alleAnhalten, DRITTLAND_HINWEIS } from './vorschau.js';
import { infoOeffnen, infoSchliessen } from './karte.js';
import { SEITEN } from './seiten.js';
import { symbol } from './symbole.js';
import { esc, store, zahl, datum, sterneHtml, beliebtheitHtml } from './util.js';

const SEITENGROESSE = 120;
const main = document.getElementById('inhalt');
const fenster = document.getElementById('infofenster');
const suchfeld = document.getElementById('suchfeld');
const themaknopf = document.getElementById('themaknopf');
const vorschauschalter = document.getElementById('vorschauschalter');

const zustand = {
  katalog: null,
  fehler: null,
  filter: { q: '', art: '', unter: '', lizenz: 'alle', format: '', quelle: '', sort: STANDARD_SORT, serie: '' },
  ansicht: store.get('fundus.ansicht') === 'liste' ? 'liste' : 'raster',
  // folders show a group of entries that belong together as one card; "einzeln" shows every entry
  gruppiert: store.get('fundus.gruppen') !== 'einzeln',
  sichtbar: SEITENGROESSE,
  autoSeiten: 0, // pages added by scrolling since the last press of "Weitere anzeigen"
  katalogHash: '#/',
  gerendert: null,
  wurzelAlle: false, // "Alle Objekte" shows a sample until the visitor asks for everything
  lauf: 0,
};

const imKatalog = () => Boolean(main.querySelector('.katalog'));

/* ---------------- Kopfleiste: Thema, Vorschauen, Suche ---------------- */
function aktuellesThema() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function kopfZustand() {
  const dunkel = aktuellesThema() === 'dark';
  themaknopf.setAttribute('aria-pressed', String(dunkel));
  themaknopf.setAttribute('aria-label', dunkel ? 'Helles Farbschema einschalten' : 'Dunkles Farbschema einschalten');
  vorschauschalter.setAttribute('aria-checked', String(vorschau.an()));
}
themaknopf.addEventListener('click', () => {
  const neu = aktuellesThema() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = neu;
  store.set('fundus.thema', neu === 'dark' ? 'dunkel' : 'hell');
  kopfZustand();
});
// Switching on asks first and names the risk of servers outside the EU; switching off needs no question.
const vorschaufrage = document.getElementById('vorschaufrage');
document.getElementById('vf-drittland').innerHTML = DRITTLAND_HINWEIS;
vorschaufrage.addEventListener('close', () => {
  if (vorschaufrage.returnValue === 'an') vorschau.setzen(true);
  vorschauschalter.focus();
});
vorschauschalter.addEventListener('click', () => {
  if (vorschau.an()) vorschau.setzen(false);
  else {
    vorschaufrage.returnValue = '';
    vorschaufrage.showModal();
  }
});
vorschau.beiAenderung(() => {
  kopfZustand();
  alleAnhalten();
  if (imKatalog()) trefferZeigen({ behalteAnzahl: true });
});

document.getElementById('suchform').addEventListener('submit', (e) => {
  e.preventDefault();
  filterSetzen({ q: suchfeld.value });
});
let tipp;
suchfeld.addEventListener('input', () => {
  // live results only while the catalogue is on screen; on a text page the search waits for Enter
  if (!imKatalog()) return;
  clearTimeout(tipp);
  tipp = setTimeout(() => filterSetzen({ q: suchfeld.value }, true), 250);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || fenster.open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault();
  suchfeld.focus();
  suchfeld.select();
});

/* ---------------- Routing ---------------- */
function lesen() {
  const raw = location.hash.slice(1) || '/';
  const [pfad, query = ''] = raw.split('?');
  return { teile: pfad.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

async function route() {
  const { teile, params } = lesen();
  const [erste, zweite] = teile;

  if (!erste || erste === 'karte') {
    if (!erste) {
      zustand.filter = {
        q: params.get('q') ?? '',
        art: params.get('art') ?? '',
        unter: params.get('unter') ?? '',
        lizenz: params.get('lizenz') ?? 'alle',
        format: params.get('format') ?? '',
        quelle: params.get('quelle') ?? '',
        sort: params.get('sort') ?? STANDARD_SORT,
        serie: params.get('serie') ?? '',
      };
      // a group belongs to one kind; the link may name only the group
      if (zustand.filter.serie && !zustand.filter.art) zustand.filter.art = artVonSerie(zustand.filter.serie);
      zustand.katalogHash = location.hash || '#/';
    }
    if (!imKatalog()) {
      katalogBauen();
      zustand.gerendert = null;
      zustand.sichtbar = SEITENGROESSE;
    }
    await katalogLaden();
    leisteZeigen();
    filterAbgleichen();
    startZeigen();
    // Opening or closing the detail sheet must not rebuild the grid: the card the visitor came from keeps its focus.
    const schluessel = JSON.stringify([zustand.filter, zustand.wurzelAlle, zustand.gruppiert]);
    if (schluessel !== zustand.gerendert || !main.querySelector('#ablage > *')) {
      const k = zustand.katalog;
      const was = k ? brauche() : 'start';
      if (k && !hat(k, was)) {
        // the index of a folder loads when it is first needed
        const lauf = ++zustand.lauf;
        ladeanzeige(ladetext(was));
        await hole(k, was).catch(() => {});
        if (lauf !== zustand.lauf) return; // a newer navigation took over
      }
      trefferZeigen();
    }
    if (!(erste === 'karte' && zweite)) document.title = seitentitel();
    if (erste === 'karte' && zweite) infoOeffnen(fenster, zustand.katalog, decodeURIComponent(zweite));
    else if (fenster.open) infoSchliessen(fenster, false);
    return;
  }

  if (fenster.open) infoSchliessen(fenster, false);
  const seite = SEITEN[erste];
  if (seite?.braucht === 'stand') await katalogLaden();
  const titel = seite ? seite.titel : 'Nicht gefunden';
  const inhalt = seite
    ? seite.html({ katalog: zustand.katalog, fehler: zustand.fehler, params })
    : `<h1>Diese Seite gibt es nicht</h1><p>Unter <code>${esc(location.hash)}</code> liegt nichts.</p>`;
  main.innerHTML = `<article class="dokument"><a class="zurueck" href="${esc(zustand.katalogHash)}"><span aria-hidden="true">‹</span> Zum Katalog</a>${inhalt}</article>`;
  document.title = `${titel} · Fundus`;
  // pages that do something after they are in the document (the access page loads its numbers)
  seite?.bereit?.(main);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function katalogLaden() {
  if (zustand.katalog || zustand.fehler) return;
  try {
    zustand.katalog = await ladeKatalog();
    // a folder shows its head at once; when the rest arrives, the grid fills up without losing the place
    beimNachladen(zustand.katalog, (was) => {
      if (imKatalog() && brauche() === was) trefferZeigen({ behalteAnzahl: true });
    });
  } catch (err) {
    zustand.fehler = err;
  }
}
/** What the current view needs (katalog.js bedarf); groups only in the grouped view. */
const brauche = () => bedarf(zustand.filter, zustand.wurzelAlle, zustand.gruppiert);

/* ---------------- Katalog ---------------- */
const SORT_TEXT = { empfohlen: 'Empfohlen', bewertung: 'Beste Bewertung', gemischt: 'Gemischt sortiert', neu: 'Neueste zuerst', name: 'Name A bis Z', quelle: 'Nach Quelle sortiert' };

/* ---------------- Start: MCP access first (Fundus is mainly a library for AI assistants) ---------------- */
const MCP_URL = 'https://fundus.fynn.land/mcp';
const KI_WEGE = [
  { id: 'app', name: 'Claude-App', html: '<p>In claude.ai oder Claude Desktop: Einstellungen, Connectors, „Add custom connector“. Name <strong>Fundus</strong>, dann die Adresse einfügen.</p>' },
  { id: 'code', name: 'Claude Code', html: '<p>Im Terminal:</p>', befehl: `claude mcp add --transport http fundus ${MCP_URL}` },
  { id: 'codex', name: 'Codex', html: '<p>In der Codex-App oder der IDE-Erweiterung: Einstellungen, MCP servers, „Add server“, Streamable HTTP, Adresse einfügen. Oder in <code>~/.codex/config.toml</code> (gilt auch für die CLI):</p>', befehl: `[mcp_servers.fundus]\nurl = "${MCP_URL}"` },
  { id: 'cursor', name: 'Cursor', html: '<p>In <code>~/.cursor/mcp.json</code> (alle Projekte) oder <code>.cursor/mcp.json</code>:</p>', befehl: `{ "mcpServers": { "fundus": { "url": "${MCP_URL}" } } }` },
  { id: 'vscode', name: 'VS Code', html: '<p>Mit GitHub Copilot: Befehlspalette „Chat: Open Customizations“, MCP Servers, „Add Server“, HTTP, Adresse einfügen, als ID <strong>fundus</strong>. Oder in <code>~/.copilot/mcp-config.json</code>:</p>', befehl: `{ "mcpServers": { "fundus": { "type": "http", "url": "${MCP_URL}", "tools": ["*"] } } }` },
];
const KI_BEISPIELE = [
  'Such mir in Fundus drei CC0-Stühle als glTF, zeig mir die Vorschauen und gib mir Lizenz und Download-Links für den schönsten.',
  'Finde in Fundus Regengeräusche, die ich frei verwenden darf, und schreib mir die Namensnennung dazu.',
];
const kopierknopf = (text, label, klasse = 'knopf knopf--klein') =>
  `<button type="button" class="${klasse}" data-kopieren="${esc(text)}" aria-label="${esc(label)}">Kopieren</button>`;

function kiBlock() {
  return `
  <section class="ki" id="ki" aria-labelledby="ki-titel">
    <div class="ki__haupt">
      <h1 id="ki-titel">Freie Assets für deine KI</h1>
      <p class="ki__satz" id="ki-satz">Trag diese Adresse in deinen KI-Assistenten ein. Dann sucht er im Katalog, sieht sich Vorschauen an und bekommt Lizenz, Namensnennung und Download-Links.</p>
      <div class="ki__adresse">
        <code class="ki__url">${esc(MCP_URL)}</code>
        ${kopierknopf(MCP_URL, 'Adresse kopieren', 'knopf knopf--haupt')}
      </div>
      <p class="ki__prinzip">Die Dateien bleiben bei der Quelle, Fundus verweist nur darauf. Jede Karte nennt Lizenz und Namensnennung.</p>
      <button type="button" class="ki__weiter" id="zumkatalog">Lieber selbst stöbern? Zum Katalog <span aria-hidden="true">↓</span></button>
    </div>
    <div class="ki__neben">
      <div class="ki__karte">
      <div class="segmente" role="tablist" aria-label="Wo du die Adresse einträgst">
        ${KI_WEGE.map((w, i) => `<button type="button" role="tab" id="ki-tab-${w.id}" aria-controls="ki-weg-${w.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(w.name)}</button>`).join('')}
      </div>
      <div class="ki__wege">
      ${KI_WEGE.map((w, i) => `<div class="ki__weg" role="tabpanel" id="ki-weg-${w.id}" aria-labelledby="ki-tab-${w.id}"${i ? ' hidden' : ''}>${w.html}${w.befehl ? `<div class="ki__befehl"><code>${esc(w.befehl)}</code>${kopierknopf(w.befehl, `Befehl für ${w.name} kopieren`)}</div>` : ''}</div>`).join('')}
      </div>
      <p class="ki__klein">Andere MCP-Clients: Transport Streamable HTTP, ohne Anmeldung.</p>
      </div>
      <h2 class="ki__zwischen">Probier zum Beispiel</h2>
      <ul class="ki__beispiele">
        ${KI_BEISPIELE.map((b, i) => `<li><q>${esc(b)}</q>${kopierknopf(b, `Beispiel ${i + 1} kopieren`)}</li>`).join('')}
      </ul>
    </div>
    <span class="unsichtbar" aria-live="polite" id="ki-meldung"></span>
  </section>`;
}

async function kopieren(knopf) {
  const text = knopf.dataset.kopieren;
  const meldung = main.querySelector('#ki-meldung');
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // no clipboard (insecure context, denied): select the visible text so Ctrl+C works
    const code = knopf.parentElement.querySelector('code, q');
    if (code) getSelection().selectAllChildren(code);
  }
  knopf.textContent = ok ? 'Kopiert' : 'Markiert';
  knopf.classList.add('ist-kopiert');
  if (meldung) meldung.textContent = ok ? 'In die Zwischenablage kopiert.' : 'Text markiert, kopieren mit Strg+C.';
  clearTimeout(knopf.zurueck);
  knopf.zurueck = setTimeout(() => {
    knopf.textContent = 'Kopieren';
    knopf.classList.remove('ist-kopiert');
  }, 1800);
}

function kiTab(tab, fokus = false) {
  const ki = main.querySelector('#ki');
  for (const t of ki.querySelectorAll('[role="tab"]')) {
    const an = t === tab;
    t.setAttribute('aria-selected', String(an));
    t.tabIndex = an ? 0 : -1;
    ki.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !an;
  }
  if (fokus) tab.focus();
}

function kiVerbinden() {
  const ki = main.querySelector('#ki');
  ki.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-kopieren]');
    if (knopf) kopieren(knopf);
    const tab = e.target.closest('[role="tab"]');
    if (tab) kiTab(tab);
    if (e.target.closest('#zumkatalog')) main.querySelector('.katalog').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  ki.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const tabs = [...ki.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const ziel = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (ziel === undefined) return;
    e.preventDefault();
    kiTab(tabs[(ziel + tabs.length) % tabs.length], true);
  });
}

// The MCP block shows on the plain start page only; any filter or search hides it.
function startZeigen() {
  const ki = main.querySelector('#ki');
  if (!ki) return;
  const f = zustand.filter;
  const start = !f.art && !f.unter && !f.q && (!f.lizenz || f.lizenz === 'alle') && !f.format && !f.quelle;
  ki.hidden = !start;
  // one h1 per view: on the start page the catalogue title steps down a level
  const titel = main.querySelector('#ordnertitel');
  if (start) titel.setAttribute('aria-level', '2');
  else titel.removeAttribute('aria-level');
  const total = zustand.katalog?.stand?.total;
  if (start && total) main.querySelector('#ki-satz').textContent = `Trag diese Adresse in deinen KI-Assistenten ein. Dann sucht er in ${zahl(total)} freien Objekten, sieht sich Vorschauen an und bekommt Lizenz, Namensnennung und Download-Links.`;
}

function katalogBauen() {
  document.title = 'Fundus · freie Assets';
  main.innerHTML = `${kiBlock()}
  <div class="katalog">
    <nav class="leiste" id="leiste" aria-label="Ordner"></nav>
    <section class="inhalt" aria-labelledby="ordnertitel">
      <a class="zurueck inhalt__zurueck" id="gruppezurueck" href="#/" hidden></a>
      <header class="inhalt__kopf">
        <h1 id="ordnertitel">Alle Objekte</h1>
        <p class="inhalt__anzahl" id="anzahl" aria-live="polite"></p>
      </header>
      <p class="inhalt__einleitung" id="einleitung">Freie Bilder, 3D-Modelle, Materialien, Musik, Sounds, Icons, Schriften, Code und Claude-Skills aus offenen Quellen, zum Stöbern und Suchen.</p>
      <div class="filter">
        <div class="segmente" role="group" aria-label="Lizenz" id="lizenzwahl">
          ${Object.entries({ alle: 'Alle Lizenzen', frei: 'Ohne Namensnennung', nennung: 'Mit Namensnennung', gleich: 'Gleiche Bedingungen' }).map(([k, v]) => `<button type="button" data-lizenz="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}
        </div>
        <label class="wahl"><span class="unsichtbar">Format</span><select id="formatwahl"><option value="">Alle Formate</option></select></label>
        <label class="wahl"><span class="unsichtbar">Quelle</span><select id="quellwahl"><option value="">Alle Quellen</option></select></label>
        <label class="wahl"><span class="unsichtbar">Sortierung</span><select id="sortwahl">${Object.keys(SORTIERUNGEN).map((k) => `<option value="${k}">${esc(SORT_TEXT[k])}</option>`).join('')}</select></label>
        <div class="filter__rechts">
          <div class="segmente" role="group" aria-label="Zusammengehörige Objekte" id="gruppenwahl">
            <button type="button" data-gruppen="an" aria-pressed="true">Gruppiert</button>
            <button type="button" data-gruppen="aus" aria-pressed="false">Einzeln</button>
          </div>
          <div class="segmente" role="group" aria-label="Ansicht">
            <button type="button" data-ansicht="raster" aria-pressed="true">Raster</button>
            <button type="button" data-ansicht="liste" aria-pressed="false">Liste</button>
          </div>
        </div>
        <button type="button" class="knopf" id="zufallknopf">Zufälliges Objekt</button>
      </div>
      <div class="ablage" id="ablage" aria-busy="false"></div>
      <p class="stand" id="stand"></p>
    </section>
  </div>`;

  main.querySelector('#lizenzwahl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lizenz]');
    if (b) filterSetzen({ lizenz: b.dataset.lizenz });
  });
  main.querySelector('#formatwahl').addEventListener('change', (e) => filterSetzen({ format: e.target.value }));
  main.querySelector('#quellwahl').addEventListener('change', (e) => filterSetzen({ quelle: e.target.value }));
  main.querySelector('#sortwahl').addEventListener('change', (e) => filterSetzen({ sort: e.target.value }));
  main.querySelectorAll('[data-ansicht]').forEach((b) =>
    b.addEventListener('click', () => {
      zustand.ansicht = b.dataset.ansicht;
      store.set('fundus.ansicht', zustand.ansicht);
      filterAbgleichen();
      trefferZeigen({ behalteAnzahl: true });
    }),
  );
  main.querySelectorAll('[data-gruppen]').forEach((b) =>
    b.addEventListener('click', () => {
      zustand.gruppiert = b.dataset.gruppen === 'an';
      store.set('fundus.gruppen', zustand.gruppiert ? 'gruppiert' : 'einzeln');
      filterAbgleichen();
      route(); // the grouped view also needs the groups of the folder
    }),
  );
  main.querySelector('#zufallknopf').addEventListener('click', zufall);
  kiVerbinden();
  main.querySelector('#leiste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ordner]');
    if (!b) return;
    const [art = '', unter = ''] = b.dataset.ordner.split('|');
    filterSetzen({ art, unter });
  });
  const ablage = main.querySelector('#ablage');
  ablage.addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-hoerprobe]');
    if (knopf) hoerprobe(knopf, knopf.dataset.hoerprobe);
    if (e.target.closest('#mehrknopf')) { zustand.autoSeiten = 0; mehrZeigen({ fokus: true }); }
    if (e.target.closest('#allesknopf')) {
      // keep what is already on screen and add the next page once everything is loaded
      const n = zustand.sichtbar + SEITENGROESSE;
      zustand.wurzelAlle = true;
      route().then(() => {
        zustand.sichtbar = n;
        trefferZeigen({ behalteAnzahl: true, fokusAb: n - SEITENGROESSE });
      });
    }
    if (e.target.closest('#nochmal')) route();
    if (e.target.closest('#filterweg')) filterSetzen({ q: '', art: '', unter: '', lizenz: 'alle', format: '', quelle: '', serie: '' });
  });
  // previews fade in once loaded; a missing preview file falls back to the kind glyph
  ablage.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('da'); }, true);
  ablage.addEventListener('error', (e) => {
    if (e.target.tagName !== 'IMG') return;
    const art = e.target.closest('[data-art]')?.dataset.art;
    e.target.parentElement.classList.add('karte__bild--zeichen');
    e.target.outerHTML = symbol(art, 40);
  }, true);
}

async function zufall() {
  await katalogLaden();
  const liste = zustand.katalog ? filtern(zustand.katalog, zustand.filter, zustand.wurzelAlle).liste : [];
  const auswahl = liste.length ? liste : zustand.katalog?.start ?? [];
  if (!auswahl.length) return;
  location.hash = `#/karte/${encodeURIComponent(auswahl[Math.floor(Math.random() * auswahl.length)].id)}`;
}

const ordnerVon = (f) => f.unter || (f.art ? ARTEN[f.art]?.label ?? f.art : 'Alle Objekte');
const gruppe = () => (zustand.filter.serie && zustand.katalog ? gruppeVon(zustand.katalog, zustand.filter.serie) : null);
const ordnername = () => (zustand.filter.serie ? gruppe()?.name ?? 'Gruppe' : ordnerVon(zustand.filter));
const seitentitel = () => (zustand.filter.art ? `${ordnername()} · Fundus` : 'Fundus · freie Assets');

function filterAbgleichen() {
  const f = zustand.filter;
  if (document.activeElement !== suchfeld) suchfeld.value = f.q;
  if (!imKatalog()) return;
  main.querySelectorAll('[data-lizenz]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lizenz === (f.lizenz in LIZENZGRUPPEN ? f.lizenz : 'alle'))));
  main.querySelectorAll('[data-ansicht]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ansicht === zustand.ansicht)));
  main.querySelectorAll('[data-gruppen]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.gruppen === 'an') === zustand.gruppiert)));
  main.querySelector('#sortwahl').value = f.sort in SORTIERUNGEN ? f.sort : STANDARD_SORT;
  const k = zustand.katalog;
  if (!k) return;
  const qw = main.querySelector('#quellwahl');
  if (qw.options.length <= 1) for (const s of k.stand.sources.filter((s) => s.count > 0)) qw.add(new Option(`${s.name} (${zahl(s.count)})`, s.id));
  qw.value = f.quelle;
  const fw = main.querySelector('#formatwahl');
  if (fw.options.length <= 1) {
    const formate = Object.entries(k.stand.perFormat ?? {}).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
    for (const [fmt, n] of formate) fw.add(new Option(`${fmt.toUpperCase()} (${zahl(n)})`, fmt));
  }
  fw.value = f.format;
}

/** The address of a filter. */
function hashFuer(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === 'lizenz' && v === 'alle') && !(k === 'sort' && v === STANDARD_SORT)) p.set(k, v);
  return `#/${p.toString() ? `?${p}` : ''}`;
}

function filterSetzen(teil, ersetzen = false) {
  const f = { ...zustand.filter, ...teil };
  if (teil.art !== undefined && teil.unter === undefined) f.unter = '';
  // another folder or a search leaves the group (the search finds single entries in the whole catalogue)
  if (teil.serie === undefined && (teil.art !== undefined || teil.unter !== undefined || teil.q)) f.serie = '';
  const ziel = hashFuer(f);
  zustand.sichtbar = SEITENGROESSE;
  if (ersetzen) {
    history.replaceState(null, '', ziel);
    route();
  } else if (ziel !== location.hash) {
    location.hash = ziel;
  } else {
    route();
  }
}

function leisteZeigen() {
  const leiste = main.querySelector('#leiste');
  const k = zustand.katalog;
  if (!leiste || !k) return;
  const f = zustand.filter;
  const eintrag = (wert, label, n, aktiv, zeichen, klasse = '') =>
    `<li><button type="button" class="ordner ${klasse}" data-ordner="${esc(wert)}" ${aktiv ? 'aria-current="true"' : ''}>${zeichen ? symbol(zeichen) : ''}<span class="ordner__name">${esc(label)}</span><span class="ordner__zahl">${zahl(n)}</span></button>`;
  const teile = ['<ul class="ordnerliste">', eintrag('|', 'Alle Objekte', k.stand.total, !f.art, 'alle'), '</li>'];
  for (const [art, a] of Object.entries(ARTEN)) {
    const n = k.stand.perKind?.[art] ?? 0;
    if (!n) continue;
    const offen = f.art === art;
    teile.push(eintrag(`${art}|`, a.label, n, offen && !f.unter, art));
    const unter = Object.entries(k.stand.perUnter?.[art] ?? {}).sort((x, y) => (x[0] === 'Sonstiges' ? 1 : y[0] === 'Sonstiges' ? -1 : y[1] - x[1]));
    if (offen && unter.length > 1) {
      teile.push('<ul>');
      for (const [u, m] of unter) teile.push(eintrag(`${art}|${u}`, u, m, f.unter === u, null, 'ordner--unter'), '</li>');
      teile.push('</ul>');
    }
    teile.push('</li>');
  }
  // the legal pages again where they are always in reach: with a list that grows while scrolling the footer is far
  teile.push('</ul>', '<p class="leiste__recht"><a href="#/impressum">Impressum</a><a href="#/datenschutz">Datenschutz</a></p>');
  leiste.innerHTML = teile.join('');
  // on narrow screens the folders are a horizontal row: keep the chosen one in view
  const aktiv = leiste.querySelector('[aria-current]');
  const liste = leiste.firstElementChild;
  if (aktiv && liste.scrollWidth > liste.clientWidth) liste.scrollLeft = Math.max(0, aktiv.offsetLeft - liste.offsetLeft - 16);
}

/*
 * Pictures load only when their card comes close to the screen (one viewport height ahead), never the
 * whole list at once. Our own mini previews always; the small picture at the source only with
 * "Vorschauen von Quellen" switched on and only for entries that have no mini preview yet. 3D models and HDRIs
 * appear as a still picture here; the model itself loads in the detail sheet on request.
 */
const nahe = 'IntersectionObserver' in window
  ? new IntersectionObserver((eintraege) => {
    for (const e of eintraege) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      nahe.unobserve(img);
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    }
  }, { rootMargin: '100% 0px' })
  : null;

function bilderBeobachten(wurzel) {
  for (const img of wurzel.querySelectorAll('img[data-src]')) {
    if (nahe) nahe.observe(img);
    else img.src = img.dataset.src;
  }
}

/**
 * Endless list: the next page is added when the "Weitere anzeigen" button comes within a screen height of the
 * view. The button stays for keyboard users and for browsers without IntersectionObserver.
 */
const unten = 'IntersectionObserver' in window
  ? new IntersectionObserver((eintraege) => {
    // after AUTO_SEITEN pages the list waits for the button: the footer with Impressum and Datenschutz must stay
    // within reach, and a folder of 40,000 entries would otherwise never end
    if (!eintraege.some((e) => e.isIntersecting) || zustand.autoSeiten >= AUTO_SEITEN || SCHMAL.matches) return;
    zustand.autoSeiten++;
    mehrZeigen();
  }, { rootMargin: '0px 0px 100% 0px' })
  : null;

/** The kind whose folder is shown as a whole, without subfolder, search, group or a filter that needs every row; else ''. */
function artWurzel() {
  const f = zustand.filter;
  return f.art && !f.serie && !/[|!]/.test(brauche()) ? f.art : '';
}

/**
 * What stands below the last card of a big folder shown as a whole: it holds only its best rows here, so first a
 * button for the second head, then a pointer to subfolders and search. '' everywhere else.
 */
function endeHtml(geladen, gesamt) {
  const art = artWurzel();
  // "Alle Objekte": the big folders are here with their best rows only, so the mixed list ends early
  if (!art && /^alle(\+g)?$/.test(brauche()) && [...zustand.katalog.arten.keys()].some((a) => nurKoepfe(zustand.katalog, a))) {
    return `<p class="mehr mehr--ende">Hier enden die ersten ${zahl(geladen)} von ${zahl(gesamt)} Objekten. Große Ordner zeigen hier nur ihre besten Einträge, alle weiteren findest du in den Ordnern und über die Suche.</p>`;
  }
  if (!art) return '';
  if (hatKopf2(zustand.katalog, art)) return `<div class="mehr"><button class="knopf" type="button" id="mehrknopf">${mehrText(SEITENGROESSE)}</button></div>`;
  if (nurKoepfe(zustand.katalog, art)) return `<p class="mehr mehr--ende">Hier enden die ersten ${zahl(geladen)} von ${zahl(gesamt)} Objekten. Alle weiteren findest du in den Unterordnern und über die Suche.</p>`;
  return '';
}

const AUTO_SEITEN = 4;
// On a phone the grid has two columns and the folders are a row of chips without room for the legal links: 600
// cards would put the footer 120,000 px away. There the list grows only by the button, as before.
const SCHMAL = matchMedia('(max-width: 760px)');
const mehrText = (rest) => `Weitere ${zahl(Math.min(SEITENGROESSE, rest))} anzeigen`;

function endeBeobachten() {
  unten?.disconnect();
  const knopf = main.querySelector('#mehrknopf');
  if (knopf) unten?.observe(knopf);
}

/** Adds the next page to the grid or table without rebuilding what is there. fokus: move the focus to the first new entry (button pressed). */
function mehrZeigen({ fokus = false } = {}) {
  const ablage = main.querySelector('#ablage');
  const ziel = ablage?.querySelector('.raster, .liste tbody');
  const karten = zustand.karten ?? [];
  const von = zustand.sichtbar;
  if (!ziel) return;
  if (von >= karten.length) {
    // the end of the head of a big folder: fetch its second head, then go on from the same place
    const art = artWurzel();
    if (!art || !hatKopf2(zustand.katalog, art)) return;
    const lauf = zustand.lauf;
    ladeKopf2(zustand.katalog, art).then(() => {
      if (lauf !== zustand.lauf || artWurzel() !== art) return;
      trefferZeigen({ behalteAnzahl: true });
      mehrZeigen({ fokus });
    }).catch(() => {});
    return;
  }
  zustand.sichtbar += SEITENGROESSE;
  const neue = karten.slice(von, zustand.sichtbar);
  const letzte = ziel.lastElementChild;
  const mitVorschau = vorschau.an();
  ziel.insertAdjacentHTML('beforeend', ziel.matches('.raster')
    ? neue.map((c) => (c.gruppe ? gruppenkarte(c, mitVorschau) : karte(c.o, mitVorschau))).join('')
    : neue.map((c) => (c.gruppe ? gruppenzeile(c) : listenzeile(c.o))).join(''));
  for (let el = letzte?.nextElementSibling; el; el = el.nextElementSibling) bilderBeobachten(el);
  const rest = karten.length - zustand.sichtbar;
  if (rest > 0) ablage.querySelector('#mehrknopf').textContent = mehrText(rest);
  else {
    ablage.querySelector('.mehr')?.remove();
    ablage.insertAdjacentHTML('beforeend', zustand.schluss?.() ?? '');
  }
  if (fokus) letzte?.nextElementSibling?.querySelector('.karte__link, .liste__name a')?.focus();
  // observing again reports at once when the button is still near the view (tall screens, short rows)
  endeBeobachten();
}

function karte(o, mitVorschau) {
  let flaeche;
  const foto = o.art === 'bild' ? ' karte__bild--foto' : '';
  if (o.vorschau) {
    flaeche = `<span class="karte__bild${foto}"><img data-src="/vorschau/${esc(o.vorschau)}" alt="" width="${o.vb}" height="${o.vh}" decoding="async" /></span>`;
  } else if (o.fremd && mitVorschau) {
    flaeche = `<span class="karte__bild${foto}"><img data-src="${esc(o.fremd)}" alt="" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" /></span>`;
  } else if (o.text) {
    flaeche = `<span class="karte__bild karte__bild--text"><span>${esc(o.text)}</span></span>`;
  } else {
    flaeche = `<span class="karte__bild karte__bild--zeichen">${symbol(o.art, 40)}</span>`;
  }
  const hoeren = o.audio && mitVorschau ? `<button type="button" class="knopf knopf--klein karte__hoeren" data-hoerprobe="${esc(o.audio)}" aria-pressed="false" aria-label="Hörprobe ${esc(o.titel)}">Anhören</button>` : '';
  return `<li class="karte" data-art="${esc(o.art)}">
    <a class="karte__link" href="#/karte/${encodeURIComponent(o.id)}">
      ${flaeche}
      <span class="karte__titel">${esc(o.titel)}</span>
      <span class="karte__meta"><span class="mono">${esc(o.lizenz)}</span> · ${esc(o.quellname)}</span>
      ${o.bewertung ? sterneHtml(o.bewertung) : o.beliebtheit ? beliebtheitHtml({ ...o.beliebtheit, quelle: o.quellname, sammlung: o.art === 'skill' }) : ''}
    </a>${hoeren}
  </li>`;
}

/*
 * A group as one folder card: up to four member pictures as a mosaic, the name, the size here and the source.
 * Our own mini previews always, pictures at the source only with "Vorschauen von Quellen" (like single cards).
 * The link opens the members and keeps the filters of the folder.
 */
const gruppenLink = (g) => hashFuer({ ...zustand.filter, q: '', art: g.art, serie: g.id });
function gruppenkarte({ gruppe: g, n, o }, mitVorschau) {
  const foto = g.art === 'bild' ? ' karte__bild--foto' : '';
  const bilder = g.bilder
    .map((b) => (b.v ? `<img data-src="/vorschau/${esc(b.v)}" alt="" width="${b.b}" height="${b.h}" decoding="async" />` : b.f && mitVorschau ? `<img data-src="${esc(b.f)}" alt="" decoding="async" fetchpriority="low" referrerpolicy="no-referrer" />` : ''))
    .filter(Boolean);
  const flaeche = bilder.length
    ? `<span class="karte__bild karte__mosaik karte__mosaik--${bilder.length}${foto}">${bilder.map((b) => `<span>${b}</span>`).join('')}</span>`
    : `<span class="karte__bild karte__bild--zeichen">${symbol(g.art, 40)}</span>`;
  return `<li class="karte karte--gruppe" data-art="${esc(g.art)}">
    <a class="karte__link" href="${esc(gruppenLink(g))}">
      <span class="karte__stapel">${flaeche}<span class="karte__zahl">${symbol('gruppe', 15)}${zahl(n)}<span class="unsichtbar"> Objekte</span></span></span>
      <span class="karte__titel">${esc(g.name)}</span>
      <span class="karte__meta">Gruppe · ${esc(o.quellname)}</span>
    </a>
  </li>`;
}

function gruppenzeile({ gruppe: g, n, o }) {
  return `<tr class="liste__gruppe">
    <td class="liste__name"><a href="${esc(gruppenLink(g))}">${symbol('gruppe', 18)}<span>${esc(g.name)}</span></a></td>
    <td>Gruppe mit ${zahl(n)} Objekten</td>
    <td class="mono">${esc(g.lizenz || 'verschieden')}</td>
    <td>${esc(o.quellname)}</td>
    <td></td>
  </tr>`;
}

function listenzeile(o) {
  return `<tr>
    <td class="liste__name"><a href="#/karte/${encodeURIComponent(o.id)}">${symbol(o.art, 18)}<span>${esc(o.titel)}</span></a></td>
    <td>${esc(ARTEN[o.art]?.einzahl ?? o.art)}${o.unter && o.unter !== 'Sonstiges' ? ` · ${esc(o.unter)}` : ''}</td>
    <td class="mono">${esc(o.lizenz)}</td>
    <td>${esc(o.quellname)}</td>
    <td class="mono">${esc(o.formate.split(' ').slice(0, 3).join(' ').toUpperCase())}</td>
  </tr>`;
}

// needs look like 'bild', 'bild!', 'bild|Holz', 'alle', 'alle!' or 's|<art>|<unter>|<suche>' (see bedarf in katalog.js)
function ladetext(was) {
  if (was.startsWith('s|')) return 'Suche läuft …';
  if (was.startsWith('g|')) return 'Gruppe wird geladen …';
  const art = was.split(/[|!+]/)[0];
  return art === 'alle' ? 'Alle Ordner werden geladen …' : `${ARTEN[art]?.label ?? 'Ordner'} wird geladen …`;
}

function ladeanzeige(text) {
  const ablage = main.querySelector('#ablage');
  if (!ablage) return;
  ablage.setAttribute('aria-busy', 'true');
  ablage.innerHTML = `<div class="zustand" role="status"><span class="lader" aria-hidden="true"></span><p>${esc(text)}</p></div>`;
}

function trefferZeigen({ behalteAnzahl = false, fokusAb } = {}) {
  const ablage = main.querySelector('#ablage');
  if (!ablage) return;
  startZeigen();
  if (!zustand.katalog && !zustand.fehler) {
    ladeanzeige('Katalog wird geladen …');
    return;
  }
  ablage.setAttribute('aria-busy', 'false');
  if (zustand.fehler) {
    ablage.innerHTML = `<div class="zustand" role="alert"><h2>Der Katalog ließ sich nicht laden</h2><p>${esc(zustand.fehler.message)}. Meist hilft es, die Seite neu zu laden. Bleibt der Fehler, fehlen auf dem Server die Katalogdaten (<code>npm run build</code> erzeugt sie).</p><button class="knopf knopf--haupt" type="button" onclick="location.reload()">Seite neu laden</button></div>`;
    return;
  }
  const k = zustand.katalog;
  const f = zustand.filter;
  zustand.gerendert = JSON.stringify([f, zustand.wurzelAlle, zustand.gruppiert]);
  main.querySelector('#ordnertitel').textContent = ordnername();
  main.querySelector('#einleitung').hidden = Boolean(f.art || f.q);
  const zurueck = main.querySelector('#gruppezurueck');
  zurueck.hidden = !f.serie;
  if (f.serie) {
    zurueck.href = hashFuer({ ...f, serie: '' });
    zurueck.innerHTML = `<span aria-hidden="true">‹</span> ${esc(ordnerVon(f))}`;
  }
  // opening or leaving a group from far down the grid starts at its title, below the sticky header
  if (f.serie !== zustand.serieGezeigt) {
    const kopf = main.querySelector('.inhalt');
    const oben = kopf.getBoundingClientRect().top;
    if (zustand.serieGezeigt !== undefined && oben < 0) window.scrollTo({ top: window.scrollY + oben - 80 });
    zustand.serieGezeigt = f.serie;
  }
  document.title = seitentitel();
  if (!k.stand.total) {
    main.querySelector('#anzahl').textContent = '';
    ablage.innerHTML = '<div class="zustand"><h2>Der Fundus ist noch leer</h2><p>Es wurde noch nichts eingesammelt. <code>npm run crawl</code> holt Einträge von den Quellen, <code>npm run daten</code> stellt sie bereit.</p></div>';
    return;
  }
  if (!hat(k, brauche())) {
    main.querySelector('#anzahl').textContent = '';
    zustand.gerendert = null;
    ablage.innerHTML = '<div class="zustand" role="alert"><h2>Dieser Ordner ließ sich nicht laden</h2><p>Die Verbindung zum Katalog ist abgebrochen. Versuch es noch einmal; die anderen Ordner sind davon nicht betroffen.</p><button class="knopf knopf--haupt" type="button" id="nochmal">Noch einmal versuchen</button></div>';
    return;
  }
  const { liste, auswahl } = filtern(k, f, zustand.wurzelAlle);
  // folders show a group as one card; a search, a group itself and the start sample show single entries
  const gruppiert = zustand.gruppiert && !f.q && !f.serie && !auswahl;
  main.querySelector('#gruppenwahl').hidden = Boolean(f.q || f.serie || auswahl);
  const karten = gruppiert ? zusammenfassen(k, liste, f) : liste.map((o) => ({ o }));
  if (!behalteAnzahl) { zustand.sichtbar = SEITENGROESSE; zustand.autoSeiten = 0; }
  zustand.karten = karten;
  unten?.disconnect();
  const zeigen = karten.slice(0, zustand.sichtbar);
  // while a folder is still loading, the list is shorter than the folder: the full count is in the data already
  const ohneFilter = !f.unter && !f.q && !f.serie && (!f.lizenz || f.lizenz === 'alle') && !f.format && !f.quelle;
  const gesamt = auswahl || (zustand.wurzelAlle && !f.art && ohneFilter) ? k.stand.total
    : f.art && ohneFilter ? (k.stand.perKind[f.art] ?? liste.length) : liste.length;
  const urheber = f.serie && gruppe()?.urheber && !/^unbekannt$/i.test(gruppe().urheber) ? ` von ${gruppe().urheber}` : '';
  main.querySelector('#anzahl').textContent = `${zahl(gesamt)} ${gesamt === 1 ? 'Objekt' : 'Objekte'}${f.q ? ` für „${f.q}“` : urheber}`;
  main.querySelector('#stand').textContent = `Stand der Daten: ${datum(k.stand.crawledAt)}. Vorschauen von den Quellen sind ${vorschau.an() ? 'eingeschaltet' : 'ausgeschaltet'}.`;

  if (!liste.length) {
    ablage.innerHTML = '<div class="zustand"><h2>Hier liegt nichts</h2><p>Zu dieser Suche und diesen Filtern gibt es kein Objekt. Versuch ein allgemeineres Wort oder nimm einen Filter heraus.</p><button class="knopf knopf--haupt" type="button" id="filterweg">Alle Filter zurücksetzen</button></div>';
    return;
  }
  const mitVorschau = vorschau.an();
  // what stands below the last entry (mehrZeigen asks again once the list has been scrolled to its end):
  // the first screen is a sample, everything else loads on request; a big folder ends with a pointer
  zustand.schluss = () => (auswahl && k.stand.total > liste.length
    ? '<div class="mehr"><button class="knopf" type="button" id="allesknopf">Mehr aus allen Ordnern anzeigen</button></div>'
    : endeHtml(liste.length, gesamt));
  const mehr = karten.length > zeigen.length
    ? `<div class="mehr"><button class="knopf" type="button" id="mehrknopf">${mehrText(karten.length - zeigen.length)}</button></div>`
    : zustand.schluss();
  if (zustand.ansicht === 'liste') {
    ablage.innerHTML = `<div class="liste-rahmen"><table class="liste"><thead><tr><th scope="col">Name</th><th scope="col">Art</th><th scope="col">Lizenz</th><th scope="col">Quelle</th><th scope="col">Formate</th></tr></thead><tbody>${zeigen.map((c) => (c.gruppe ? gruppenzeile(c) : listenzeile(c.o))).join('')}</tbody></table></div>${mehr}`;
  } else {
    ablage.innerHTML = `<ul class="raster">${zeigen.map((c) => (c.gruppe ? gruppenkarte(c, mitVorschau) : karte(c.o, mitVorschau))).join('')}</ul>${mehr}`;
    nahe?.disconnect();
    bilderBeobachten(ablage);
  }
  if (fokusAb !== undefined) ablage.querySelectorAll('.karte__link, .liste__name a')[fokusAb]?.focus();
  endeBeobachten();
}

/* ---------------- Start ---------------- */
kopfZustand();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', kopfZustand);
document.addEventListener('fundus:thema-zurueck', kopfZustand);
document.addEventListener('fundus:schliessen', () => {
  if (location.hash.startsWith('#/karte/')) location.hash = zustand.katalogHash;
});
window.addEventListener('hashchange', route);
route();
