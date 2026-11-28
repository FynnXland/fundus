// German search words and their English equivalents. Almost every title and tag in Fundus is English, so "Schreibtisch",
// "Fernseher" or "Teppich" found nothing (MCP feedback 28.11.2026). A query word that is a key here also finds what its
// English words find; the German word itself still counts (German titles exist, e.g. at Wikimedia Commons).
// Keys are normalised as suchindex.mjs normalises (lowercase, umlauts folded: ä → a, ß → ss). Values are single
// index words, so "still life" is written as two words that both must match (see alternativen()).
const ROH = {
  // furniture and rooms
  tisch: 'table', tische: 'table', schreibtisch: 'desk', esstisch: 'dining table', couchtisch: 'coffee table', beistelltisch: 'side table',
  stuhl: 'chair', stuhle: 'chair', sessel: 'armchair', hocker: 'stool', bank: 'bench', sofa: 'sofa couch', couch: 'couch sofa',
  schrank: 'cabinet cupboard wardrobe', kleiderschrank: 'wardrobe', kommode: 'dresser drawers', regal: 'shelf shelves', bucherregal: 'bookshelf bookcase',
  bett: 'bed', nachttisch: 'nightstand', lampe: 'lamp light', lampen: 'lamp', leuchte: 'lamp light', stehlampe: 'floor lamp', kronleuchter: 'chandelier',
  teppich: 'rug carpet', vorhang: 'curtain', vorhange: 'curtain', kissen: 'pillow cushion', decke: 'blanket ceiling', spiegel: 'mirror', bilderrahmen: 'frame',
  tur: 'door', ture: 'door', fenster: 'window', treppe: 'stairs staircase', wand: 'wall', boden: 'floor ground', dach: 'roof', zaun: 'fence', kamin: 'fireplace',
  wohnzimmer: 'living room', schlafzimmer: 'bedroom', kuche: 'kitchen', bad: 'bathroom', badezimmer: 'bathroom', buro: 'office', flur: 'hallway',
  kuhlschrank: 'fridge refrigerator', herd: 'stove', ofen: 'oven stove', spule: 'sink', waschbecken: 'sink', toilette: 'toilet', dusche: 'shower', badewanne: 'bathtub',
  heizung: 'radiator heater', heizkorper: 'radiator',
  // things
  fernseher: 'tv television', radio: 'radio', telefon: 'telephone phone', handy: 'phone smartphone', rechner: 'computer', bildschirm: 'monitor screen',
  tastatur: 'keyboard', maus: 'mouse', kamera: 'camera', lautsprecher: 'speaker', kopfhorer: 'headphones', uhr: 'clock watch', wecker: 'alarm clock',
  buch: 'book', bucher: 'books', zeitung: 'newspaper', brief: 'letter', karte: 'map card', flasche: 'bottle', glas: 'glass', tasse: 'cup mug', becher: 'mug cup',
  teller: 'plate', schussel: 'bowl', topf: 'pot', pfanne: 'pan', messer: 'knife', gabel: 'fork', loffel: 'spoon', geschirr: 'tableware dishes', vase: 'vase',
  kerze: 'candle', laterne: 'lantern', korb: 'basket', kiste: 'crate box', karton: 'box cardboard', fass: 'barrel', eimer: 'bucket', koffer: 'suitcase', tasche: 'bag',
  werkzeug: 'tool tools', hammer: 'hammer', schraube: 'screw', zange: 'pliers', sage: 'saw', spielzeug: 'toy', puppe: 'doll', ball: 'ball', schwert: 'sword', helm: 'helmet',
  schuh: 'shoe', schuhe: 'shoes', hut: 'hat', jacke: 'jacket', kleid: 'dress', brille: 'glasses',
  // vehicles
  fahrzeug: 'vehicle', auto: 'car', lastwagen: 'truck', lkw: 'truck', bus: 'bus', zug: 'train', strassenbahn: 'tram', fahrrad: 'bicycle bike', motorrad: 'motorcycle',
  flugzeug: 'airplane aircraft', hubschrauber: 'helicopter', schiff: 'ship', boot: 'boat', rakete: 'rocket', traktor: 'tractor',
  // nature and places
  pflanze: 'plant', pflanzen: 'plants', blume: 'flower', blumen: 'flowers', baum: 'tree', baume: 'trees', strauch: 'bush shrub', gras: 'grass', blatt: 'leaf', blatter: 'leaves',
  stein: 'stone rock', steine: 'stones rocks', felsen: 'rock cliff', berg: 'mountain', berge: 'mountains', wald: 'forest', see: 'lake', fluss: 'river', meer: 'sea ocean',
  strand: 'beach', wuste: 'desert', himmel: 'sky', wolke: 'cloud', wolken: 'clouds', sonne: 'sun', mond: 'moon', stern: 'star', sterne: 'stars', nacht: 'night',
  sonnenuntergang: 'sunset', sonnenaufgang: 'sunrise', regen: 'rain', schnee: 'snow', nebel: 'fog', gewitter: 'thunderstorm', donner: 'thunder', wind: 'wind', feuer: 'fire', wasser: 'water',
  stadt: 'city', strasse: 'street road', haus: 'house', hauser: 'houses', gebaude: 'building', kirche: 'church', burg: 'castle', schloss: 'castle palace', brucke: 'bridge', turm: 'tower',
  innen: 'interior indoor', innenraum: 'interior indoor', aussen: 'outdoor exterior', landschaft: 'landscape',
  // animals
  tier: 'animal', tiere: 'animals', hund: 'dog', katze: 'cat', vogel: 'bird', vogel_: 'birds', pferd: 'horse', kuh: 'cow', schaf: 'sheep', schwein: 'pig', fisch: 'fish', insekt: 'insect',
  schmetterling: 'butterfly', biene: 'bee', spinne: 'spider', maus_: 'mouse',
  // pictures and art
  gemalde: 'painting', bild: 'picture image', foto: 'photo photograph', zeichnung: 'drawing', portrat: 'portrait', stillleben: 'still life', skulptur: 'sculpture', statue: 'statue',
  plakat: 'poster', muster: 'pattern', hintergrund: 'background', symbol: 'icon', schrift: 'font typeface', textur: 'texture', oberflache: 'surface',
  // materials and looks
  holz: 'wood wooden', metall: 'metal', stahl: 'steel', eisen: 'iron', messing: 'brass', kupfer: 'copper', gold: 'gold', silber: 'silver', beton: 'concrete', ziegel: 'brick',
  marmor: 'marble', fliesen: 'tiles', leder: 'leather', stoff: 'fabric cloth', kunststoff: 'plastic', papier: 'paper', rost: 'rust rusty', sand: 'sand', erde: 'soil dirt', kies: 'gravel',
  // style and era
  rustikal: 'rustic', antik: 'antique', altmodisch: 'vintage old', alt: 'old vintage', modern: 'modern', zeitgenossisch: 'contemporary', klassisch: 'classic',
  industriell: 'industrial', skandinavisch: 'scandinavian', viktorianisch: 'victorian', barock: 'baroque', mittelalter: 'medieval', mittelalterlich: 'medieval',
  futuristisch: 'futuristic', abgenutzt: 'worn', verwittert: 'weathered', sauber: 'clean', rostig: 'rusty rusted',
  // sound and music
  musik: 'music', gerausch: 'sound', gerausche: 'sounds', klavier: 'piano', gitarre: 'guitar', trommel: 'drum', glocke: 'bell', schritte: 'footsteps', stimme: 'voice',
  vogelgesang: 'birdsong', applaus: 'applause', explosion: 'explosion', schuss: 'gunshot', klick: 'click',
};
// a trailing underscore only separates a second meaning in the list above ("vogel" is singular and plural)
for (const k of Object.keys(ROH)) if (k.endsWith('_')) { ROH[k.slice(0, -1)] = `${ROH[k.slice(0, -1)] ?? ''} ${ROH[k]}`.trim(); delete ROH[k]; }

export const SYNONYME = Object.freeze(Object.fromEntries(Object.entries(ROH).map(([k, v]) => [k, v])));

/**
 * The ways a query word can be found: itself, and for a German word its English equivalents. An equivalent of two
 * words ("still life", "dining table") is one alternative whose words must all match.
 * Returns [[word, ...], ...]: the first alternative is the word itself.
 */
export function alternativen(w) {
  const roh = ROH[w];
  if (!roh) return [[w]];
  // "sofa couch" = two alternatives; "living room" = one alternative of two words; the list says which by the
  // phrases below, everything else is split into single words
  const PHRASEN = ['dining table', 'coffee table', 'side table', 'floor lamp', 'living room', 'still life', 'alarm clock'];
  const out = [[w]];
  let rest = ` ${roh} `;
  for (const p of PHRASEN) if (rest.includes(` ${p} `)) { out.push(p.split(' ')); rest = rest.replace(` ${p} `, ' '); }
  for (const x of rest.trim().split(/\s+/).filter(Boolean)) if (x !== w) out.push([x]);
  return out;
}
