// Info window ("Info: <title>"): data sheet, files, origin, similar entries. The mini preview from our own
// server shows at once; the large preview, sound, 3D model or font sample loads from the source only
// after consent (switch in the menu, or "load this preview" here).

import { ARTEN, ladeKarte, ladeArt, aehnliche, mehrAusSammlung } from './katalog.js';
import { vorschau, alleAnhalten, DRITTLAND_HINWEIS } from './vorschau.js';
import { symbol } from './symbole.js';
import { esc, safeUrl, bytes, host, datum, zahl, sterneHtml, beliebtheitHtml, bewertungAusEintrag } from './util.js';

const SCHRIFTPROBE = 'Fundus 1984: Quax jagt Wölfe über den Deich.';
let ausloeser = null;
let aufraeumen = null;
let leeren = 0;

/* ---------------- Lizenz in einem Satz ---------------- */
const PERMISSIV = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'BSL-1.0', 'Artistic-2.0']);
export function lizenzSatz(l) {
  if (l.id === 'OFL-1.1') return 'Die Schrift darf frei genutzt, eingebettet, verändert und weitergegeben werden. Allein verkaufen darf man sie nicht, und eine veränderte Fassung braucht einen eigenen Namen.';
  if (!l.attribution) return 'Nutzen, ändern und weitergeben ohne Bedingungen, auch kommerziell. Eine Namensnennung ist nicht nötig, aber gern gesehen.';
  if (l.family === 'code') {
    if (PERMISSIV.has(l.id)) return 'Nutzen, ändern und weitergeben erlaubt, auch kommerziell. Bei der Weitergabe muss der Lizenz- und Copyright-Hinweis mitkommen.';
    return 'Nutzen und ändern erlaubt, auch kommerziell. Wer eine veränderte Fassung weitergibt, muss deren Quellcode unter derselben Lizenz offenlegen.';
  }
  if (l.shareAlike) return 'Nutzen, ändern und weitergeben erlaubt, auch kommerziell, wenn du Urheber, Quelle und Lizenz nennst. Veränderte Fassungen müssen unter derselben Lizenz stehen.';
  return 'Nutzen, ändern und weitergeben erlaubt, auch kommerziell, wenn du Urheber, Quelle und Lizenz nennst.';
}

/* ---------------- Bausteine ---------------- */
const NAMEN = { abmessung: 'Abmessung', original: 'Original', dauer: 'Dauer', polygone: 'Polygone', aufloesung: 'Auflösung', art: 'Art', sterne: 'Sterne auf GitHub', sprache: 'Sprache', zuletzt: 'Letzte Änderung', repository: 'Repository', sammlung: 'Sammlung', dateien: 'Dateien', schnitte: 'Schnitte', kategorie: 'Kategorie', icons: 'Icons', abrufe: 'Downloads', version: 'Version', blender: 'Blender', godot: 'Godot', stil: 'Stil', gestalter: 'Gestaltung' };

/* ---------------- 3D: which file the viewer can show ---------------- */
const MODELL_FORMATE = ['glb', 'gltf', 'dae', 'obj', 'stl', 'ply'];
const MODELL_MAX = 80 * 1024 * 1024;
const endungVon = (u) => (u ?? '').split('?')[0].split('#')[0].split('.').pop().toLowerCase();

/**
 * Source for the 3D viewer, or null: the source's own glTF preview, a Gazebo Fuel model (meshes fetched one by
 * one, the ZIP is never needed), or a single mesh file among the downloads (STL from Commons and the like).
 */
export function modellQuelleVon(it) {
  if (it.kind !== '3d') return null;
  const p = it.preview;
  if (p.type === 'model' && p.url) return { teile: [{ url: p.url, format: endungVon(p.url) }], dateien: p.dateien };
  // ambientCG: only a ZIP; the crawler stored the direct address of the smallest one
  if (p.zip?.url) return { zip: p.zip.url, zuGross: p.zip.size > MODELL_MAX ? p.zip.size : 0 };
  if (it.source.id === 'fuel') {
    const zip = it.downloads.find((d) => /\/models\/[^/]+\.zip$/.test(d.url));
    if (zip) return { fuel: zip.url.replace(/\.zip$/, '') };
  }
  const datei = it.downloads.find((d) => !d.paket && MODELL_FORMATE.includes((d.format ?? endungVon(d.url)).toLowerCase()));
  if (datei) {
    const f = (datei.format ?? endungVon(datei.url)).toLowerCase();
    // STL from 3D printing is Z up; glTF is Y up by definition. Very large files load only on request.
    return { teile: [{ url: datei.url, format: f }], zHoch: f === 'stl', zuGross: datei.size > MODELL_MAX ? datei.size : 0 };
  }
  return null;
}

function grossVorschauHosts(it) {
  const p = it.preview;
  const m = modellQuelleVon(it);
  const modellUrls = m ? (m.fuel ? [m.fuel] : m.zip ? [m.zip] : m.teile.map((t) => t.url)) : [];
  return [...new Set([...modellUrls, p.url, p.thumb, ...Object.values(p.dateien ?? {}).slice(0, 1)].filter(Boolean).map(host))].join(' und ');
}

function brauchtQuelle(it) {
  return it.preview.type !== 'text' && Boolean(it.preview.url || it.preview.thumb);
}

// kinds that are code someone else wrote; the card says that nobody checked it
const SOFTWARE = new Set(['projekt', 'skript', 'skill']);

function vorschauFlaeche(it, mitVorschau) {
  const lokal = it.vorschau ? `<img class="info__mini" src="/vorschau/${esc(it.vorschau.pfad)}" alt="Vorschau: ${esc(it.title)}" width="${it.vorschau.b}" height="${it.vorschau.h}" />` : `<span class="info__symbol">${symbol(it.kind, 64)}</span>`;
  if (!brauchtQuelle(it)) return textVorschau(it);
  if (mitVorschau) return `${lokal}<p class="info__hinweis" role="status">Lädt von ${esc(grossVorschauHosts(it))} …</p>`;
  const was = modellQuelleVon(it) ? '3D-Ansicht' : { model: '3D-Ansicht', audio: 'Hörprobe', font: 'Schriftprobe' }[it.preview.type] ?? 'Große Vorschau';
  return `${lokal}
    <div class="info__zustimmung">
      <p>${esc(was)} kommt direkt von ${esc(grossVorschauHosts(it))}. Dabei erfährt der Server deine IP-Adresse.</p>
      <p class="info__klein">${DRITTLAND_HINWEIS}</p>
      <div class="knopfreihe">
        <button type="button" class="knopf knopf--haupt" data-einmal>${esc(was)} laden</button>
        <button type="button" class="knopf" data-immer>Immer laden</button>
      </div>
    </div>`;
}

function textVorschau(it) {
  const dateien = it.downloads.find((d) => d.paket)?.paket.files;
  if (dateien) return `<div class="info__text-vorschau">${symbol(it.kind, 40)}<p class="info__klein">Inhalt des Ordners</p><ul class="dateiliste">${dateien.slice(0, 40).map((f) => `<li>${esc(f.path)}</li>`).join('')}</ul></div>`;
  return `<div class="info__text-vorschau">${symbol(it.kind, 40)}<p class="textvorschau">${esc(it.preview.text || it.description || 'Keine Beschreibung bei der Quelle.')}</p></div>`;
}

function datenblatt(it) {
  const z = [];
  const add = (k, v) => z.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`);
  add('Urheber', it.creator.url ? `<a href="${esc(safeUrl(it.creator.url))}" rel="noopener noreferrer" target="_blank">${esc(it.creator.name)}</a>` : esc(it.creator.name));
  add('Lizenz', `<a href="${esc(safeUrl(it.license.url))}" rel="noopener noreferrer" target="_blank">${esc(it.license.name)}</a><span class="datenblatt__satz">${esc(lizenzSatz(it.license))}</span>`);
  add('Ordner', `${esc(ARTEN[it.kind]?.label ?? it.kind)} ▸ ${esc(it.unter ?? 'Sonstiges')}`);
  for (const [k, v] of Object.entries(it.meta ?? {})) if (v) add(NAMEN[k] ?? k, esc(v));
  if (it.collection) add('Sammlung', it.collection.url ? `<a href="${esc(safeUrl(it.collection.url))}" rel="noopener noreferrer" target="_blank">${esc(it.collection.name)}</a>` : esc(it.collection.name));
  if (it.tags.length) add('Schlagworte', esc(it.tags.join(', ')));
  add('Signatur', `<span class="mono">${esc(it.sig)}</span>`);
  return `<dl class="datenblatt">${z.join('')}</dl>`;
}

function downloadsHtml(it) {
  return it.downloads
    .map((d, i) => {
      const groesse = d.size ? ` · ${bytes(d.size)}` : '';
      const cls = i === 0 ? 'knopf knopf--haupt' : 'knopf';
      if (d.paket) return `<button type="button" class="${cls}" data-paket="${i}">${esc(d.label)}${groesse}</button>`;
      return `<a class="${cls}" href="${esc(safeUrl(d.url))}" rel="noopener noreferrer" download>${esc(d.label)}${groesse}</a>`;
    })
    .join('');
}

function dateienTab(it) {
  const zeilen = [];
  for (const d of it.downloads) {
    if (d.paket) {
      zeilen.push(`<li><strong>${esc(d.label)}</strong>${d.size ? ` <span class="mono">${bytes(d.size)}</span>` : ''}<ul class="dateiliste">${d.paket.files.map((f) => `<li><a href="${esc(safeUrl(f.url))}" rel="noopener noreferrer">${esc(f.path)}</a></li>`).join('')}</ul></li>`);
    } else {
      zeilen.push(`<li><a href="${esc(safeUrl(d.url))}" rel="noopener noreferrer">${esc(d.label)}</a>${d.format ? ` <span class="mono">${esc(d.format.toUpperCase())}</span>` : ''}${d.size ? ` <span class="mono">${bytes(d.size)}</span>` : ''}<br /><span class="info__klein mono">${esc(host(d.url))}</span></li>`);
    }
  }
  return `<p class="info__klein">Alle Dateien liegen bei der Quelle. Pakete setzt dein Browser aus diesen Einzeldateien zusammen; Fundus speichert keine Kopie.</p><ul class="dateien">${zeilen.join('')}</ul>`;
}

function herkunftTab(it) {
  const auch = it.auch?.length
    ? `<h4>Auch erhältlich bei</h4><p class="info__klein">Dieselbe Datei lag bei mehreren Quellen; Fundus zeigt sie einmal.</p><ul class="dateien">${it.auch.map((a) => `<li><a href="${esc(safeUrl(a.url))}" rel="noopener noreferrer" target="_blank">${esc(a.quelle)}</a> <span class="mono">${esc(a.lizenz)}</span></li>`).join('')}</ul>`
    : '';
  return `<dl class="datenblatt">
      <dt>Ursprung</dt><dd><a href="${esc(safeUrl(it.source.url))}" rel="noopener noreferrer" target="_blank">Seite bei ${esc(it.source.name)}</a></dd>
      ${it.via?.length ? `<dt>Gefunden über</dt><dd>${esc(it.via.join(', '))}</dd>` : ''}
      <dt>Aufgenommen</dt><dd>${esc(datum(it.firstSeen))}</dd>
      <dt>Links geprüft</dt><dd>${esc(datum(it.checkedAt))}</dd>
      <dt>Lizenz laut Quelle</dt><dd>${esc(it.license.name)}</dd>
    </dl>
    ${auch}
    <p class="info__klein">Die Lizenz übernimmt Fundus so, wie die Quelle sie nennt. Falsch, Datei weg oder Urheber nicht einverstanden? <a href="#/melden?id=${encodeURIComponent(it.id)}">Eintrag melden</a></p>`;
}

function kachelKlein(o) {
  const bild = o.vorschau ? `<img src="/vorschau/${esc(o.vorschau)}" alt="" loading="lazy" decoding="async" />` : symbol(o.art, 28);
  return `<li><a class="mini" href="#/karte/${encodeURIComponent(o.id)}"><span class="mini__bild">${bild}</span><span class="mini__name">${esc(o.titel)}</span></a></li>`;
}

const ZU_ZEICHEN = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
function blattKopf(kicker, titel) {
  return `<div class="blatt__kopf"><p class="blatt__kicker">${esc(kicker)}</p>${titel ? `<h2 class="unsichtbar" id="if-titel">${esc(titel)}</h2>` : ''}<button class="rundknopf" type="button" data-zu aria-label="Schließen">${ZU_ZEICHEN}</button></div>`;
}

/** Rating of the source (scaled to 5) and popularity, with the source named; nothing if the source has neither. */
function bewertungsZeile(it) {
  const { bewertung, beliebtheit } = bewertungAusEintrag(it);
  if (!bewertung && !beliebtheit) return '';
  const quelle = it.rating?.source ?? it.popularity?.source;
  const original = bewertung && it.rating.max !== 5 ? `<span class="info__klein">Original: ${esc(String(it.rating.value).replace('.', ','))} von ${esc(String(it.rating.max))}</span>` : '';
  const stimmen = bewertung ? `<span class="info__klein">${esc(bewertung.anzahl.toLocaleString('de-DE'))} ${bewertung.anzahl === 1 ? 'Bewertung' : 'Bewertungen'} auf ${quelle?.url ? `<a href="${esc(safeUrl(quelle.url))}" rel="noopener noreferrer" target="_blank">${esc(quelle.name)}</a>` : esc(quelle?.name ?? '')}</span>` : '';
  return `<div class="info__bewertung">${sterneHtml(bewertung, { gross: true })}${stimmen}${original}${beliebtheitHtml(beliebtheit && { ...beliebtheit, sammlung: it.kind === 'skill' })}</div>`;
}

function infoHtml(it, katalog, mitVorschau) {
  const a = ARTEN[it.kind];
  const o = katalog.byId.get(it.id);
  const aehn = o ? aehnliche(katalog, o) : [];
  const mehr = o ? mehrAusSammlung(katalog, o) : [];
  const ph = it.source.id === 'polyhaven' ? '<p class="info__klein">Powered by <a href="https://polyhaven.com" rel="noopener noreferrer" target="_blank">Poly Haven</a></p>' : '';
  return `
  ${blattKopf(`${a?.einzahl ?? it.kind} · ${it.source.name}`)}
  <div class="info">
    <div class="info__vorschau" id="info-vorschau">${vorschauFlaeche(it, mitVorschau)}</div>
    <div class="info__haupt">
      <h2 class="info__titel" id="if-titel">${esc(it.title)}</h2>
      ${bewertungsZeile(it)}
      ${it.serie ? `<p class="info__gruppe">Gehört zur Gruppe <a href="#/?art=${encodeURIComponent(it.kind)}&amp;serie=${encodeURIComponent(it.serie.id)}">${esc(it.serie.name)}</a> mit ${zahl(it.serie.anzahl)} Objekten</p>` : ''}
      ${it.description ? `<p class="info__beschreibung">${esc(it.description)}</p>` : ''}
      <div class="knopfreihe">${downloadsHtml(it)}</div>
      ${SOFTWARE.has(it.kind) ? '<p class="info__klein">Software von Dritten: Fundus prüft weder Sicherheit noch Datenschutz noch, ob die Lizenzangabe stimmt. Schau dir den Code an, bevor du ihn einsetzt.</p>' : ''}
      <p class="info__klein" id="paketstatus" aria-live="polite">Download direkt von ${esc([...new Set(it.downloads.map((d) => host(d.paket ? d.paket.files[0].url : d.url)))].join(', '))}.</p>
      <div class="reiter segmente" role="tablist" aria-label="Angaben">
        <button type="button" role="tab" id="tab-uebersicht" aria-controls="tp-uebersicht" aria-selected="true">Übersicht</button>
        <button type="button" role="tab" id="tab-dateien" aria-controls="tp-dateien" aria-selected="false" tabindex="-1">Dateien</button>
        <button type="button" role="tab" id="tab-herkunft" aria-controls="tp-herkunft" aria-selected="false" tabindex="-1">Herkunft</button>
      </div>
      <div class="reiterseite" role="tabpanel" id="tp-uebersicht" aria-labelledby="tab-uebersicht">${datenblatt(it)}</div>
      <div class="reiterseite" role="tabpanel" id="tp-dateien" aria-labelledby="tab-dateien" hidden>${dateienTab(it)}</div>
      <div class="reiterseite" role="tabpanel" id="tp-herkunft" aria-labelledby="tab-herkunft" hidden>${herkunftTab(it)}</div>
      <div class="nennung">
        <h4>Namensnennung zum Kopieren</h4>
        <p id="nennungstext" class="mono">${esc(it.attribution)}</p>
        <button type="button" class="knopf" data-kopieren>Text kopieren</button><span class="nennung__status" aria-live="polite"></span>
      </div>
      ${ph}
      <p class="info__klein">Lizenz-Kurzfassungen ohne Gewähr, verbindlich ist der verlinkte Lizenztext.</p>
    </div>
  </div>
  ${aehn.length ? `<section class="info__reihe" aria-labelledby="aehnl"><h4 id="aehnl">Ähnliche Objekte${it.unter && it.unter !== 'Sonstiges' ? ` in ${esc(it.unter)}` : ''}</h4><ul class="minis">${aehn.map(kachelKlein).join('')}</ul></section>` : ''}
  ${mehr.length ? `<section class="info__reihe" aria-labelledby="mehrs"><h4 id="mehrs">Mehr ${it.collection ? `aus ${esc(it.collection.name)}` : `von ${esc(it.creator.name)}`}</h4><ul class="minis">${mehr.map(kachelKlein).join('')}</ul></section>` : ''}`;
}

/* ---------------- Große Vorschau von der Quelle ---------------- */
async function grossLaden(fenster, it, { grossesModell = false } = {}) {
  const ziel = fenster.querySelector('#info-vorschau');
  const p = it.preview;
  const alt = `Vorschau: ${it.title}`;
  const fehler = (text) => {
    ziel.querySelector('.info__hinweis, .info__zustimmung')?.remove();
    ziel.insertAdjacentHTML('beforeend', `<p class="info__hinweis">${esc(text)} <a href="${esc(safeUrl(it.source.url))}" rel="noopener noreferrer" target="_blank">Zur Ursprungsseite</a></p>`);
  };
  ziel.querySelector('.info__zustimmung')?.remove();
  if (!ziel.querySelector('.info__hinweis')) ziel.insertAdjacentHTML('beforeend', `<p class="info__hinweis" role="status">Lädt von ${esc(grossVorschauHosts(it))} …</p>`);

  if (p.icons?.length) {
    // icon sets: a sheet of example icons, each an SVG from the source
    ziel.innerHTML = `<ul class="iconblatt">${p.icons.slice(0, 12).map((u) => `<li><img src="${esc(safeUrl(u))}" alt="" referrerpolicy="no-referrer" loading="lazy" /></li>`).join('')}</ul><p class="info__hinweis">Beispiele aus dem Set, geladen von ${esc(host(p.icons[0]))}</p>`;
    return;
  }
  const mq = modellQuelleVon(it);
  if (mq?.zuGross && !grossesModell) {
    // show the still picture now and offer the model, so a 137 MB file never loads by surprise
    queueMicrotask(() => ziel.insertAdjacentHTML('afterend', `<p class="info__klein modell-gross">Das 3D-Modell ist ${esc(bytes(mq.zuGross))} groß. <button type="button" class="knopf knopf--klein" data-modell-gross>3D-Modell trotzdem laden</button></p>`));
  } else if (mq) {
    try {
      const { modellZeigen, fuelQuelle, zipQuelle } = await import('./modell.js');
      const quelle = mq.fuel ? await fuelQuelle(mq.fuel) : mq.zip ? await zipQuelle(mq.zip) : mq;
      if (!fenster.open) { quelle.freigeben?.(); return; }
      let weg;
      try { weg = await modellZeigen(ziel, quelle, alt); } catch (err) { quelle.freigeben?.(); throw err; }
      aufraeumen = quelle.freigeben ? () => { weg(); quelle.freigeben(); } : weg;
    } catch (err) {
      console.warn(err);
      fehler('Das 3D-Modell ließ sich nicht laden.');
    }
    return;
  }
  if (p.type === 'image' || (p.type === 'audio' && !p.url)) {
    const img = new Image();
    img.alt = alt;
    img.className = 'info__gross';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => { ziel.replaceChildren(img); };
    img.onerror = () => {
      if (p.thumb && img.src !== p.thumb) img.src = safeUrl(p.thumb);
      else fehler('Die große Vorschau ließ sich nicht laden.');
    };
    img.src = safeUrl(p.url || p.thumb);
    return;
  }
  if (p.type === 'audio') {
    const player = document.createElement('audio');
    player.controls = true;
    player.preload = 'metadata';
    player.src = safeUrl(p.url);
    player.addEventListener('error', () => fehler('Die Hörprobe ließ sich nicht abspielen.'), { once: true });
    ziel.querySelector('.info__hinweis')?.remove();
    ziel.append(player);
    return;
  }
  if (p.type === 'font') {
    try {
      const name = `fundus-${it.id.replace(/[^a-z0-9]/gi, '-')}`;
      const face = new FontFace(name, `url(${safeUrl(p.url)})`);
      await face.load();
      document.fonts.add(face);
      ziel.innerHTML = `<div class="schriftmuster" style="font-family:'${name}'"><p class="schriftmuster__gross">${esc(it.title)}</p><p class="schriftmuster__mittel">${esc(SCHRIFTPROBE)}</p><p>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz äöüß 0123456789</p></div>`;
    } catch {
      // some origins send no CORS header (GitHub release files); then the rendered sample picture stays
      if (it.vorschau) ziel.querySelector('.info__hinweis')?.remove();
      else fehler('Die Schrift ließ sich nicht laden.');
    }
    return;
  }
  if (p.type === 'model') {
    try {
      const { modellZeigen } = await import('./modell.js');
      if (!fenster.open) return;
      aufraeumen = await modellZeigen(ziel, p.url, p.dateien ?? {}, alt);
    } catch (err) {
      console.warn(err);
      fehler('Das 3D-Modell ließ sich nicht laden.');
    }
  }
}

function verdrahten(fenster, it, mitVorschau) {
  // on the content, which is rebuilt for every entry (the dialog itself stays, its listeners would pile up)
  fenster.querySelector('.info')?.addEventListener('click', (e) => {
    if (!e.target.closest('[data-modell-gross]')) return;
    e.target.closest('.modell-gross')?.remove();
    grossLaden(fenster, it, { grossesModell: true });
  });
  if (brauchtQuelle(it) && mitVorschau) grossLaden(fenster, it);
  fenster.querySelector('[data-einmal]')?.addEventListener('click', () => grossLaden(fenster, it));
  fenster.querySelector('[data-immer]')?.addEventListener('click', () => { vorschau.setzen(true); grossLaden(fenster, it); });

  const tabs = [...fenster.querySelectorAll('[role="tab"]')];
  const waehlen = (t) => {
    for (const x of tabs) {
      const an = x === t;
      x.setAttribute('aria-selected', String(an));
      x.tabIndex = an ? 0 : -1;
      fenster.querySelector(`#${x.getAttribute('aria-controls')}`).hidden = !an;
    }
    t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => waehlen(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') waehlen(tabs[(i + 1) % tabs.length]);
      if (e.key === 'ArrowLeft') waehlen(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });

  fenster.querySelector('[data-kopieren]')?.addEventListener('click', async (e) => {
    const status = e.currentTarget.nextElementSibling;
    try {
      await navigator.clipboard.writeText(it.attribution);
      status.textContent = 'Kopiert.';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(fenster.querySelector('#nennungstext'));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      status.textContent = 'Text ist markiert, kopiere ihn mit Strg+C.';
    }
  });

  fenster.querySelectorAll('[data-paket]').forEach((knopf) => {
    knopf.addEventListener('click', async () => {
      const d = it.downloads[Number(knopf.dataset.paket)];
      const status = fenster.querySelector('#paketstatus');
      const von = host(d.paket.files[0].url);
      knopf.disabled = true;
      try {
        const { paketLaden } = await import('./paket.js');
        await paketLaden(d.paket, (n, gesamt) => { status.textContent = `Lade Datei ${n} von ${gesamt} von ${von} …`; });
        status.textContent = `Fertig: ${d.paket.name}.zip mit ${d.paket.files.length} Dateien, direkt von ${von}.`;
      } catch (err) {
        status.innerHTML = `Das Paket ließ sich nicht zusammenstellen (${esc(err.message)}). Die Dateien gibt es einzeln im Reiter „Dateien“ und auf der <a href="${esc(safeUrl(it.source.url))}" rel="noopener noreferrer" target="_blank">Ursprungsseite</a>.`;
      } finally {
        knopf.disabled = false;
      }
    });
  });
}

/* ---------------- Öffnen und Schließen ---------------- */
function aufraeumenJetzt(fenster) {
  fenster.querySelectorAll('audio').forEach((a) => a.pause());
  aufraeumen?.();
  aufraeumen = null;
}

export async function infoOeffnen(fenster, katalog, id) {
  if (!fenster.open) {
    ausloeser = document.activeElement;
    clearTimeout(leeren);
    fenster.innerHTML = `${blattKopf('Fundus', 'Objekt wird geladen')}<div class="zustand" role="status"><span class="lader" aria-hidden="true"></span><p>Wird geladen …</p></div>`;
    fenster.showModal();
  }
  aufraeumenJetzt(fenster);
  alleAnhalten();
  let it = null;
  let fehler = null;
  try {
    it = katalog ? await ladeKarte(id) : null;
    // similar entries come from the folder's index, which may not be loaded yet (direct link, start sample)
    if (it) await ladeArt(katalog, it.kind).catch(() => {});
  } catch (err) {
    fehler = err;
  }
  if (!fenster.open) return;
  if (!it) {
    fenster.innerHTML = `${blattKopf('Fundus')}<div class="zustand"><h2 id="if-titel">Nicht gefunden</h2><p>${fehler ? `Der Eintrag ließ sich nicht laden (${esc(fehler.message)}). Versuch es gleich noch einmal.` : 'Diesen Eintrag gibt es im Fundus nicht mehr. Vielleicht hat die Quelle ihn entfernt und die Linkprüfung hat ihn ausgeblendet.'}</p></div>`;
  } else {
    fenster.innerHTML = infoHtml(it, katalog, vorschau.an());
    verdrahten(fenster, it, vorschau.an());
    document.title = `${it.title} · Fundus`;
  }
  fenster.scrollTop = 0;
  fenster.querySelector('[data-zu]')?.focus();
}

export function infoSchliessen(fenster, navigieren = true) {
  fenster.querySelectorAll('audio').forEach((a) => a.pause());
  if (fenster.open) fenster.close();
  // the content stays until the closing transition has run, then the sheet is emptied
  clearTimeout(leeren);
  leeren = setTimeout(() => {
    if (fenster.open) return;
    aufraeumenJetzt(fenster);
    fenster.innerHTML = '';
  }, 300);
  if (ausloeser?.isConnected) ausloeser.focus({ preventScroll: true });
  ausloeser = null;
  if (navigieren) document.dispatchEvent(new Event('fundus:schliessen'));
}

const dlg = document.getElementById('infofenster');
dlg.addEventListener('click', (e) => {
  if (e.target === dlg || e.target.closest('[data-zu]')) infoSchliessen(dlg);
});
dlg.addEventListener('cancel', (e) => {
  e.preventDefault();
  infoSchliessen(dlg);
});
