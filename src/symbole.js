// Small line glyphs, one per kind. They appear only where an entry has no picture (sounds without a cover,
// code without a description) and in the sidebar, so a visitor can tell kinds apart at a glance.
// Drawn for this project on a 24 px grid, 1.6 px round strokes.

const P = {
  bild: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 16.5l4.5-4 3.5 3 3-2.5 5 4.5"/>',
  grafik: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  '3d': '<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/>',
  textur: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 12h16M12 4v16M8 4v8M16 12v8"/>',
  hdri: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>',
  icon: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><circle cx="16.8" cy="7.3" r="3.3"/><path d="M7.2 13.6l3.4 6H3.8z"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="3.2"/>',
  musik: '<path d="M9.5 17.5V6.2l9-2v11.3"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="16" cy="15.5" r="2.5"/>',
  sound: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3"/>',
  schrift: '<path d="M4 18.5L9 5.5h1l5 13M6 14h7"/><path d="M20 18.5v-5.2a2.3 2.3 0 0 0-4.6 0M20 16.2a2.3 2.3 0 1 1-2.3-2.3"/>',
  skript: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14"/>',
  projekt: '<path d="M4 8.5l8-4 8 4-8 4z"/><path d="M4 8.5v7l8 4 8-4v-7M12 12.5v7"/>',
  skill: '<path d="M7 3.5h7l4 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M14 3.5v4h4M8.5 12h7M8.5 15.5h5"/>',
  video: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M10.3 9.3v5.4l4.6-2.7z"/>',
  shader: '<circle cx="12" cy="12" r="8"/><path d="M8.4 9.4a4 4 0 0 1 3-3M4.8 15.2c4.4 1.9 10 1.9 14.4 0"/>',
  alle: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
};

export function symbol(name, groesse = 20) {
  return `<svg class="symbol" viewBox="0 0 24 24" width="${groesse}" height="${groesse}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.skill}</svg>`;
}
