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
  for (const t of ['Toy Car', 'Dutch Ship Large 01', 'Merkava Tank 3D print model', 'Voskhod Rocket', 'Curiosity Rover', 'Fire Truck']) {
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
