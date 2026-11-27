import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unterkategorie } from '../crawler/lib/taxonomy.mjs';

const u = (kind, title, tags = []) => unterkategorie({ kind, title, tags });

test('3D: Wortanfänge sind keine Treffer mehr (car in carved, cartilage, cartridge)', () => {
  assert.equal(u('3d', 'Carved Wooden Elephant'), 'Figuren & Skulpturen');
  assert.equal(u('3d', 'BodyParts3D Costal cartilage'), 'Anatomie & Biologie');
  assert.equal(u('3d', '.460 Steyr cartridge-full model'), 'Waffen & Militär');
  assert.notEqual(u('3d', 'Carbon Fibre Ball'), 'Fahrzeuge & Raumfahrt');
});

test('3D: der Titel entscheidet vor den Schlagwörtern', () => {
  // real Poly Haven tags: the life jacket is tagged "boat", the leather cleaner "car"
  assert.equal(u('3d', 'Life Jacket', ['ocean', 'boat', 'single-seat']), 'Kleidung & Ausrüstung');
  assert.equal(u('3d', 'Leather Cleaner Can', ['garage', 'car', 'leather']), 'Geschirr & Haushalt');
  // with nothing in the title, the tags still count
  assert.equal(u('3d', 'Pinnace', ['ship', 'boat']), 'Fahrzeuge & Raumfahrt');
});

test('3D: Fahrzeuge erkannt, Gasflasche und Sackkarre nicht', () => {
  assert.equal(u('3d', 'Toy Car'), 'Spielzeug');
  assert.equal(u('3d', 'Boat Shoe', ['boat']), 'Schuhe');
  for (const t of ['Dutch Ship Large 01', 'Merkava Tank 3D print model', 'Voskhod Rocket', 'Curiosity Rover', 'Fire Truck']) {
    assert.equal(u('3d', t), 'Fahrzeuge & Raumfahrt', t);
  }
  assert.notEqual(u('3d', 'Propane Tank'), 'Fahrzeuge & Raumfahrt');
  assert.equal(u('3d', 'Hand Truck'), 'Werkzeug & Technik');
  assert.notEqual(u('3d', 'Hand Plane No4'), 'Fahrzeuge & Raumfahrt');
});

test('3D: die großen Gruppen von Commons haben eigene Ordner', () => {
  assert.equal(u('3d', 'Small icosihemidodecahedron'), 'Geometrie & Mathematik');
  assert.equal(u('3d', 'J56 metabiaugmented hexagonal prism'), 'Geometrie & Mathematik');
  assert.equal(u('3d', '(8567) 1996 HW1 3D model'), 'Weltraum & Gelände');
  assert.equal(u('3d', 'Moon elevation'), 'Weltraum & Gelände');
  assert.equal(u('3d', 'Lapa do Santo - Artefato - Anzol 7'), 'Archäologie & Fundstücke');
  assert.equal(u('3d', 'Nut RH BU01.00x02.00 - SPN-NUT-0009'), '3D-Druck & Bauteile');
  assert.equal(u('3d', 'Violin', ['bow']), 'Musikinstrumente');
  assert.equal(u('3d', 'Sheen Test Grid'), 'Testmodelle');
});

test('Bilder: Kathedrale ist Architektur, nicht Tier', () => {
  assert.equal(u('bild', 'Cathedral of the Holy Trinity, Quebec'), 'Architektur');
  assert.equal(u('bild', 'Catedral de Santa Cecilia, Albi'), 'Architektur');
  assert.equal(u('bild', 'Harvest mouse and blossom'), 'Tiere');
});

test('Musik und Sounds: Komponisten, Vogelstimmen, Feldaufnahmen', () => {
  assert.equal(u('musik', 'Chopin- Nocturne op. 37 no. 1'), 'Klassik & Orchester');
  assert.equal(u('musik', 'Bach, J S - Goldberg Variations, BWV988'), 'Klassik & Orchester');
  assert.equal(u('musik', 'A Hundred Pipers', ['bagpipes music']), 'Volksmusik & Traditionell');
  assert.equal(u('sound', 'Ardea cinerea - Grey Heron XC610467', ['xeno-canto']), 'Tiere');
  assert.equal(u('sound', 'Fernsprecher Bergmannstraße 99', ['field recording', 'soundscape']), 'Stadt & Verkehr');
  assert.equal(u('sound', 'Algemene sfeer van station Hilversum'), 'Stadt & Verkehr');
  assert.equal(u('sound', 'Messton(1000hz)'), 'Instrumente & Töne');
});

test('Icons: Stil aus dem Adapter vor dem Titel, Iconify-Kategorie vor dem Set-Namen', () => {
  assert.equal(unterkategorie({ kind: 'icon', title: 'Red Apple', tags: ['emoji'], meta: { stil: '3D' } }), '3D');
  assert.equal(unterkategorie({ kind: 'icon', title: 'Flat Color Icons', tags: [], meta: { kategorie: 'UI Multicolor' } }), 'Farbig');
  assert.equal(unterkategorie({ kind: 'icon', title: 'Maple leaf', tags: [] }), 'Sonstiges');
  assert.equal(unterkategorie({ kind: 'icon', title: 'Flag: Germany', tags: [] }), 'Flaggen & Karten');
});

test('3D: Drohnen und Gazebo-Fahrzeuge', () => {
  for (const t of ['X3 UAV Config 2', 'Quadrotor', 'Golf Cart', 'Subway R160', 'International Space Station', 'Prius Hybrid']) {
    assert.equal(u('3d', t), 'Fahrzeuge & Raumfahrt', t);
  }
});

const p = (title, description, tags = [], sprache) => unterkategorie({ kind: 'projekt', title, description, tags, meta: { sprache } });

test('Projekte: GitHub-Themen entscheiden, die meisten Treffer gewinnen', () => {
  assert.equal(p('godot-xterm', 'Terminal emulator for the Godot game engine.', ['godot', 'godot-engine', 'terminal']), 'Spiele & Spieleentwicklung');
  assert.equal(p('obsidian-mcp-server', 'Read and edit Obsidian notes', ['ai-agents', 'mcp', 'obsidian']), 'KI-Agenten & MCP');
  assert.equal(p('basement-grotesque', 'The basement grotesque typeface.', ['font', 'typeface']), 'Schriften & Icons');
  assert.equal(p('vulkano', 'Safe and rich Rust wrapper around the Vulkan API', ['rust', 'vulkan']), '3D, Grafik & Bildbearbeitung');
});

test('Projekte ohne Themen: das erste Fachwort der Beschreibung, dann der Name, dann die Sprache', () => {
  assert.equal(p('MobileIE', '[ICCV2025] Implementation of "MobileIE"'), 'KI & Machine Learning');
  assert.equal(p('skillfish', 'The skill manager for AI coding agents.'), 'KI-Agenten & MCP');
  assert.equal(p('x', 'PoC for CVE-2024-1234'), 'Sicherheit & Hacking');
  assert.equal(p('DeepSeek-V3', ''), 'KI & Machine Learning');
  assert.equal(p('juliex', '', [], 'Solidity'), 'Blockchain & Finanzen');
  assert.equal(p('libdxfrw', 'C++ library to read and write DXF/DWG files'), 'Bibliotheken & Werkzeuge');
  assert.equal(p('juliex', '', [], 'Rust'), 'Sonstiges');
});

test('Projekte: allgemeine Wörter kapern keinen Ordner', () => {
  // "network" in a neural network, "learning" in a paper title, "bootstrap" as a verb, a GitHub link in the text
  assert.notEqual(p('ifrnet', 'Intermediate Feature Refine Network for Frame Interpolation'), 'Netzwerk & Selbst hosten');
  assert.notEqual(p('stream-of-search', 'Repository for the paper Stream of Search: Learning to Search in Language'), 'Lernen & Listen');
  assert.notEqual(p('MVPAndroidBootstrap', 'Clean MVP bootstrap architecture'), 'Web-Frontend');
  assert.notEqual(p('java-notes', 'moved to https://github.com/someone/snote'), 'DevOps & Cloud');
});

test('Projekte: bei gleich vielen Themen je Ordner entscheidet die Beschreibung', () => {
  // scrcpy: android (Mobile), ffmpeg (Audio, Video), sdl2 (Spiele)
  assert.equal(p('scrcpy', 'Display and control your Android device', ['android', 'c', 'ffmpeg', 'mirroring', 'sdl2']), 'Mobile Apps');
});

const b = (title, tags = [], source = 'wellcome', meta = {}) => unterkategorie({ kind: 'bild', title, tags, meta, source: { id: source } });

test('Bilder: Museumsbestände haben eigene Ordner', () => {
  assert.equal(b('A physician examining a patient. Engraving.'), 'Medizin & Anatomie');
  assert.equal(b('John Hunter. Line engraving by W. Sharp', ['portrait prints']), 'Porträts & Menschen');
  assert.equal(b('Book of Hours: fol. 12r'), 'Handschriften & Buchseiten');
  assert.equal(b('A horse and a dog. Etching'), 'Tiere', 'das Motiv geht vor der Technik');
  assert.equal(b('Something without a subject. Etching'), 'Kunst & Grafik');
});

test('Bilder aus Cleveland: der Objekttyp entscheidet vor dem Titel, bei Bildern erst danach', () => {
  assert.equal(b('Dish', ['Ceramic', 'Chinese Art'], 'cleveland'), 'Keramik & Glas');
  assert.equal(b('Leaf from a Bible', ['Manuscript', 'Medieval Art'], 'cleveland'), 'Handschriften & Buchseiten');
  assert.equal(b('Coin with an Owl', ['Coins', 'Greek and Roman Art'], 'cleveland'), 'Schmuck & Münzen');
  assert.equal(b('Horse in a Meadow', ['Painting', 'European Painting and Sculpture'], 'cleveland'), 'Tiere');
  assert.equal(b('Untitled', ['Print', 'Prints'], 'cleveland'), 'Kunst & Grafik');
});

test('Bilder: Wellcomes Regal "Archives and manuscripts" macht kein Bild zur Handschrift', () => {
  assert.notEqual(b('Rain charm from the Torres Straits', [], 'wellcome', { art: 'Archives and manuscripts' }), 'Handschriften & Buchseiten');
});
