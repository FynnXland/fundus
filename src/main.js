import './styles.css';
import { ladeKatalog, beimNachladen, filtern, bedarf, hat, hole, ARTEN, LIZENZGRUPPEN, SORTIERUNGEN, STANDARD_SORT } from './katalog.js';
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
  filter: { q: '', art: '', unter: '', lizenz: 'alle', format: '', quelle: '', sort: STANDARD_SORT },
  ansicht: store.get('fundus.ansicht') === 'liste' ? 'liste' : 'raster',
  sichtbar: SEITENGROESSE,
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
      };
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
    // Opening or closing the detail sheet must not rebuild the grid: the card the visitor came from keeps its focus.
    const schluessel = JSON.stringify([zustand.filter, zustand.wurzelAlle]);
    if (schluessel !== zustand.gerendert || !main.querySelector('#ablage > *')) {
      const k = zustand.katalog;
      const was = k ? bedarf(zustand.filter, zustand.wurzelAlle) : 'start';
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
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function katalogLaden() {
  if (zustand.katalog || zustand.fehler) return;
  try {
    zustand.katalog = await ladeKatalog();
    // a folder shows its head at once; when the rest arrives, the grid fills up without losing the place
    beimNachladen(zustand.katalog, (was) => {
      if (imKatalog() && bedarf(zustand.filter, zustand.wurzelAlle) === was) trefferZeigen({ behalteAnzahl: true });
    });
  } catch (err) {
    zustand.fehler = err;
  }
}

/* ---------------- Katalog ---------------- */
const SORT_TEXT = { empfohlen: 'Empfohlen', bewertung: 'Beste Bewertung', gemischt: 'Gemischt sortiert', neu: 'Neueste zuerst', name: 'Name A bis Z', quelle: 'Nach Quelle sortiert' };

function katalogBauen() {
  document.title = 'Fundus · freie Assets';
  main.innerHTML = `
  <div class="katalog">
    <nav class="leiste" id="leiste" aria-label="Ordner"></nav>
    <section class="inhalt" aria-labelledby="ordnertitel">
      <header class="inhalt__kopf">
        <h1 id="ordnertitel">Alle Objekte</h1>
        <p class="inhalt__anzahl" id="anzahl" aria-live="polite"></p>
      </header>
      <p class="inhalt__einleitung" id="einleitung">Freie Bilder, 3D-Modelle, Materialien, Musik, Sounds, Icons, Schriften, Code und Claude-Skills aus offenen Quellen. Jedes Objekt nennt Urheber, Lizenz und Ursprung. Die Dateien lädst du direkt bei der Quelle.</p>
      <div class="filter">
        <div class="segmente" role="group" aria-label="Lizenz" id="lizenzwahl">
          ${Object.entries({ alle: 'Alle Lizenzen', frei: 'Ohne Namensnennung', nennung: 'Mit Namensnennung', gleich: 'Gleiche Bedingungen' }).map(([k, v]) => `<button type="button" data-lizenz="${k}" aria-pressed="false">${esc(v)}</button>`).join('')}
        </div>
        <label class="wahl"><span class="unsichtbar">Format</span><select id="formatwahl"><option value="">Alle Formate</option></select></label>
        <label class="wahl"><span class="unsichtbar">Quelle</span><select id="quellwahl"><option value="">Alle Quellen</option></select></label>
        <label class="wahl"><span class="unsichtbar">Sortierung</span><select id="sortwahl">${Object.keys(SORTIERUNGEN).map((k) => `<option value="${k}">${esc(SORT_TEXT[k])}</option>`).join('')}</select></label>
        <div class="segmente filter__rechts" role="group" aria-label="Ansicht">
          <button type="button" data-ansicht="raster" aria-pressed="true">Raster</button>
          <button type="button" data-ansicht="liste" aria-pressed="false">Liste</button>
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
  main.querySelector('#zufallknopf').addEventListener('click', zufall);
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
    if (e.target.closest('#mehrknopf')) {
      zustand.sichtbar += SEITENGROESSE;
      trefferZeigen({ behalteAnzahl: true, fokusAb: zustand.sichtbar - SEITENGROESSE });
    }
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
    if (e.target.closest('#filterweg')) filterSetzen({ q: '', art: '', unter: '', lizenz: 'alle', format: '', quelle: '' });
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

const ordnername = () => zustand.filter.unter || (zustand.filter.art ? ARTEN[zustand.filter.art]?.label ?? zustand.filter.art : 'Alle Objekte');
const seitentitel = () => (zustand.filter.art ? `${ordnername()} · Fundus` : 'Fundus · freie Assets');

function filterAbgleichen() {
  const f = zustand.filter;
  if (document.activeElement !== suchfeld) suchfeld.value = f.q;
  if (!imKatalog()) return;
  main.querySelectorAll('[data-lizenz]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lizenz === (f.lizenz in LIZENZGRUPPEN ? f.lizenz : 'alle'))));
  main.querySelectorAll('[data-ansicht]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ansicht === zustand.ansicht)));
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

function filterSetzen(teil, ersetzen = false) {
  const f = { ...zustand.filter, ...teil };
  if (teil.art !== undefined && teil.unter === undefined) f.unter = '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === 'lizenz' && v === 'alle') && !(k === 'sort' && v === STANDARD_SORT)) p.set(k, v);
  const ziel = `#/${p.toString() ? `?${p}` : ''}`;
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
  teile.push('</ul>');
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
  const art = was.split(/[|!]/)[0];
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
  zustand.gerendert = JSON.stringify([f, zustand.wurzelAlle]);
  main.querySelector('#ordnertitel').textContent = ordnername();
  main.querySelector('#einleitung').hidden = Boolean(f.art || f.q);
  document.title = seitentitel();
  if (!k.stand.total) {
    main.querySelector('#anzahl').textContent = '';
    ablage.innerHTML = '<div class="zustand"><h2>Der Fundus ist noch leer</h2><p>Es wurde noch nichts eingesammelt. <code>npm run crawl</code> holt Einträge von den Quellen, <code>npm run daten</code> stellt sie bereit.</p></div>';
    return;
  }
  if (!hat(k, bedarf(f, zustand.wurzelAlle))) {
    main.querySelector('#anzahl').textContent = '';
    zustand.gerendert = null;
    ablage.innerHTML = '<div class="zustand" role="alert"><h2>Dieser Ordner ließ sich nicht laden</h2><p>Die Verbindung zum Katalog ist abgebrochen. Versuch es noch einmal; die anderen Ordner sind davon nicht betroffen.</p><button class="knopf knopf--haupt" type="button" id="nochmal">Noch einmal versuchen</button></div>';
    return;
  }
  const { liste, auswahl } = filtern(k, f, zustand.wurzelAlle);
  if (!behalteAnzahl) zustand.sichtbar = SEITENGROESSE;
  const zeigen = liste.slice(0, zustand.sichtbar);
  // while a folder is still loading, the list is shorter than the folder: the full count is in the data already
  const ohneFilter = !f.unter && !f.q && (!f.lizenz || f.lizenz === 'alle') && !f.format && !f.quelle;
  const gesamt = auswahl || (zustand.wurzelAlle && !f.art && ohneFilter) ? k.stand.total
    : f.art && ohneFilter ? (k.stand.perKind[f.art] ?? liste.length) : liste.length;
  main.querySelector('#anzahl').textContent = `${zahl(gesamt)} ${gesamt === 1 ? 'Objekt' : 'Objekte'}${f.q ? ` für „${f.q}“` : ''}`;
  main.querySelector('#stand').textContent = `Stand der Daten: ${datum(k.stand.crawledAt)}. Vorschauen von den Quellen sind ${vorschau.an() ? 'eingeschaltet' : 'ausgeschaltet'}.`;

  if (!liste.length) {
    ablage.innerHTML = '<div class="zustand"><h2>Hier liegt nichts</h2><p>Zu dieser Suche und diesen Filtern gibt es kein Objekt. Versuch ein allgemeineres Wort oder nimm einen Filter heraus.</p><button class="knopf knopf--haupt" type="button" id="filterweg">Alle Filter zurücksetzen</button></div>';
    return;
  }
  const mitVorschau = vorschau.an();
  let mehr = '';
  if (liste.length > zeigen.length) mehr = `<div class="mehr"><button class="knopf" type="button" id="mehrknopf">Weitere ${zahl(Math.min(SEITENGROESSE, liste.length - zeigen.length))} anzeigen</button></div>`;
  // the first screen is a sample; everything else loads on request
  else if (auswahl && k.stand.total > liste.length) mehr = `<div class="mehr"><button class="knopf" type="button" id="allesknopf">Alle ${zahl(k.stand.total)} Objekte laden</button></div>`;
  if (zustand.ansicht === 'liste') {
    ablage.innerHTML = `<div class="liste-rahmen"><table class="liste"><thead><tr><th scope="col">Name</th><th scope="col">Art</th><th scope="col">Lizenz</th><th scope="col">Quelle</th><th scope="col">Formate</th></tr></thead><tbody>${zeigen.map(listenzeile).join('')}</tbody></table></div>${mehr}`;
  } else {
    ablage.innerHTML = `<ul class="raster">${zeigen.map((o) => karte(o, mitVorschau)).join('')}</ul>${mehr}`;
    nahe?.disconnect();
    bilderBeobachten(ablage);
  }
  if (fokusAb !== undefined) ablage.querySelectorAll('.karte__link, .liste__name a')[fokusAb]?.focus();
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
