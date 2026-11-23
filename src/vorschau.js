// Previews load from the servers of the sources, which then see the visitor's IP address.
// That only happens after the visitor switches previews on (stored in localStorage, see docs/RECHT.md)
// or asks for one single preview in the detail view.

import { store } from './util.js';

const KEY = 'fundus.vorschau';
const listeners = new Set();

export const vorschau = {
  an() {
    return store.get(KEY) === 'an';
  },
  setzen(an) {
    if (an) store.set(KEY, 'an');
    else store.remove(KEY);
    listeners.forEach((fn) => fn(an));
  },
  beiAenderung(fn) {
    listeners.add(fn);
  },
};

// One shared player for the listen buttons on the cards, so only one sample plays at a time.
let player;
let aktiverKnopf;

export function hoerprobe(knopf, url) {
  if (!player) {
    player = new Audio();
    player.preload = 'none';
    player.addEventListener('ended', () => zuruecksetzen());
    player.addEventListener('error', () => {
      if (aktiverKnopf) aktiverKnopf.textContent = 'Nicht abspielbar';
      aktiverKnopf = null;
    });
  }
  if (aktiverKnopf === knopf) {
    player.pause();
    zuruecksetzen();
    return;
  }
  zuruecksetzen();
  aktiverKnopf = knopf;
  knopf.textContent = 'Anhalten';
  knopf.setAttribute('aria-pressed', 'true');
  player.src = url;
  player.play().catch(() => {
    knopf.textContent = 'Nicht abspielbar';
    aktiverKnopf = null;
  });
}

function zuruecksetzen() {
  if (aktiverKnopf) {
    aktiverKnopf.textContent = 'Anhören';
    aktiverKnopf.setAttribute('aria-pressed', 'false');
  }
  aktiverKnopf = null;
}

export function alleAnhalten() {
  player?.pause();
  zuruecksetzen();
}
