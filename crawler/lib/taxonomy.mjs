// Subcategories (Unterkategorien) per kind, the second level of the tree on the left of the site.
// The title decides first; only if no rule matches the title do tags and source categories count (a life
// jacket tagged "boat" is not a vehicle). Within each pass the first matching rule wins, so more specific
// rules come first. Entries that match nothing land in "Sonstiges".

import { projektOrdner } from './projekte.mjs';

const ESC = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// R: word starts ("microscop" finds "microscopy"); used where the lists were written that way (video, shader, …).
const R = (label, ...words) => ({ label, re: new RegExp(`(^|[^a-zäöüß])(${words.join('|')})`, 'i') });

// W: whole words with an optional English plural ("car" finds "cars", not "carved" or "cartilage").
// A trailing * marks a prefix ("symphon*"). A RegExp is used as it is, without word boundaries, for
// parts inside words ("hedron" in "dodecahedron") or patterns like "BWV 988".
const W = (label, ...words) => {
  const roh = words.filter((w) => w instanceof RegExp).map((w) => w.source);
  const teile = words.filter((w) => !(w instanceof RegExp)).map((w) => (w.endsWith('*') ? `${ESC(w.slice(0, -1))}[a-zäöüß]*` : `${ESC(w)}(?:s|es)?`));
  const wort = teile.length ? [`(?:^|[^a-zäöüß0-9])(?:${teile.join('|')})(?![a-zäöüß])`] : [];
  return { label, re: new RegExp([...wort, ...roh].join('|'), 'i') };
};

export const UNTER = {
  bild: [
    W('Weltraum', 'space', 'galaxy', 'galaxies', 'nebula', 'planet', 'moon', 'mond', 'astronom*', 'nasa', 'star cluster', 'weltraum'),
    W('Tiere', 'animal', 'bird', 'insect', 'butterfly', 'butterflies', 'moth', 'cat', 'dog', 'horse', 'fish', 'mammal', 'reptile', 'spider', 'beetle', 'tier', 'tiere', 'vogel', 'fauna', 'lepidoptera', 'aves', 'mouse', 'mice', 'rat', 'squirrel', 'rabbit', 'hare', 'fox', 'wolf', 'wolves', 'bear', 'deer', 'elk', 'moose', 'boar', 'lion', 'tiger', 'leopard', 'cheetah', 'elephant', 'giraffe', 'zebra', 'monkey', 'ape', 'gorilla', 'lemur', 'bat', 'whale', 'dolphin', 'seal', 'otter', 'cattle', 'cow', 'sheep', 'goat', 'pig', 'donkey', 'camel', 'lizard', 'snake', 'turtle', 'tortoise', 'frog', 'toad', 'salamander', 'crocodile', 'bee', 'wasp', 'ant', 'dragonfly', 'dragonflies', 'damselfly', 'grasshopper', 'snail', 'crab', 'jellyfish', 'owl', 'eagle', 'hawk', 'falcon', 'kite', 'vulture', 'heron', 'egret', 'stork', 'crane', 'swan', 'duck', 'goose', 'geese', 'gull', 'tern', 'pelican', 'parrot', 'macaw', 'swallow', 'swift', 'sparrow', 'finch', 'warbler', 'flycatcher', 'kingfisher', 'woodpecker', 'hummingbird', 'robin', 'thrush', 'tit', 'crow', 'raven', 'magpie', 'pigeon', 'dove', 'penguin', 'flamingo', 'peacock', 'moustique'),
    W('Pflanzen', 'plant', 'flower', 'tree', 'leaf', 'leaves', 'botanical', 'blossom', 'fungi', 'mushroom', 'flora', 'pflanze', 'pflanzen', 'blume', 'blumen', 'baum'),
    W('Architektur', 'architecture', 'building', 'church', 'cathedral', 'castle', 'palace', 'tower', 'bridge', 'house', 'interior', 'monastery', 'monasteries', 'temple', 'mosque', 'kirche', 'schloss', 'gebäude', 'palacio', 'catedral', 'cattedrale', 'cathédrale', 'kathedrale', 'dom', 'basilica', 'basilique', 'chapel', 'chapelle', 'kapelle', 'iglesia', 'église', 'chiesa', 'abbey', 'abbaye', 'kloster', 'burg', 'fortress', 'fort', 'citadel', 'château', 'castello', 'castillo', 'synagogue', 'pagoda', 'shrine', 'lighthouse', 'windmill', 'mill', 'facade', 'fassade'),
    W('Stadt', 'city', 'cities', 'street', 'urban', 'skyline', 'night', 'stadt', 'straße'),
    W('Landschaft', 'landscape', 'mountain', 'lake', 'river', 'sea', 'beach', 'coast', 'forest', 'valley', 'valleys', 'glacier', 'sunset', 'sunrise', 'waterfall', 'landschaft', 'berg', 'see', 'wald'),
    W('Kunst & Grafik', 'painting', 'drawing', 'print', 'poster', 'illustration', 'engraving', 'artwork', 'woodcut', 'lithograph', 'gemälde', 'zeichnung'),
    W('Technik', 'machine', 'engine', 'locomotive', 'train', 'car', 'aircraft', 'airplane', 'ship', 'vehicle', 'technology', 'technologies', 'maschine', 'automobile', 'sports car', 'porsche', 'ferrari', 'lamborghini', 'volkswagen', 'mercedes-benz', 'bmw', 'audi', 'opel', 'fiat', 'citroën', 'renault', 'peugeot', 'tram', 'tramway', 'bus', 'tractor', 'helicopter', 'motorcycle'),
    W('Essen', 'food', 'fruit', 'vegetable', 'dish', 'bread', 'essen'),
    W('Texturen & Muster', 'texture', 'pattern', 'background', 'surface', 'muster'),
  ],
  grafik: [
    R('Sprites & Figuren', 'sprite', 'sprites', 'character', 'characters', 'spritesheet', 'animation', 'enemy', 'player', 'npc'),
    R('Tilesets & Welten', 'tileset', 'tilesets', 'tile', 'tiles', 'tilemap', 'platformer', 'dungeon', 'terrain', 'isometric', 'rpg'),
    R('Benutzeroberfläche', 'ui', 'gui', 'interface', 'button', 'buttons', 'hud', 'menu', 'cursor'),
    R('Pixel-Art', 'pixel', 'pixelart', 'pixel-art', '8bit', '8-bit', '16bit'),
    R('Vektor & Clipart', 'clipart', 'clip art', 'vector', 'svg', 'illustration'),
    R('Hintergründe', 'background', 'backgrounds', 'parallax', 'skybox'),
    R('Effekte', 'particle', 'particles', 'effect', 'effects', 'explosion', 'smoke'),
  ],
  // 3D: Poly Haven tags its models well; Commons 3D files (mostly STL) often have only a title, so the rules
  // also know the groups that dominate there: polyhedra, anatomy, scans of finds, planetary surfaces, print parts.
  '3d': [
    W('Geometrie & Mathematik', 'polyhedron', 'polyhedra', 'polytope', 'prism', 'antiprism', 'pyramid', 'bipyramid', 'trapezohedron', 'rotunda', 'cupola', 'stellation', 'deltahedron', 'compound of', 'torus', 'tori', 'klein bottle', 'möbius', 'mobius', 'knot', 'minimal surface', 'tessellation', 'lattice', 'fractal', 'curve', 'courbe', 'viviani', 'geometr*', /hedr(?:on|a)\b/, /\bJ\d{1,2}\b/),
    W('Anatomie & Biologie', 'bodyparts3d', 'anatomy', 'anatomical', 'bone', 'skull', 'cranium', 'neurocranium', 'rib', 'vertebra', 'vertebrae', 'cartilage', 'femur', 'tibia', 'pelvis', 'mandible', 'tooth', 'teeth', 'heart', 'brain', 'organ', 'muscle', 'skeleton', 'fossil', 'shell', 'tortoise', 'turtle', 'insect', 'protein', 'molecule', 'virus', 'cell', 'ear', 'jaw', 'hip', 'spine', 'clavicle', 'fibula', 'humerus', 'ulna', 'scapula', 'sternum', 'ventricle', 'artery', 'arteries', 'aorta', 'vein', 'venography', 'angiography', 'abdominal', 'kidney', 'liver', 'lung', 'cta', 'mri', 'crânio', 'schädel'),
    W('Schuhe', 'shoe', 'sneaker', 'boot', 'sandal', 'slipper', 'loafer', 'moccasin', 'heel', 'oxford shoe', 'vans', 'crocs', 'schuh'),
    W('Spielzeug', 'toy', 'lego', 'duplo', 'plush', 'plushie', 'teddy', 'doll', 'puzzle', 'rattle', 'sorting', 'stacking', 'baby', 'kids', 'spielzeug'),
    W('Fahrzeuge & Raumfahrt', 'vehicle', 'car', 'automobile', /(?<!hand\s)\btrucks?\b/, 'lorry', 'bus', 'van', 'tractor', 'forklift', 'train', 'locomotive', 'tram', 'wagon', 'railcar', 'ship', 'boat', 'yacht', 'sailboat', 'canoe', 'kayak', 'submarine', 'ferry', 'pinnace', 'aircraft', 'jet', 'airplane', 'aeroplane', 'seaplane', 'warplane', 'airliner', 'glider', 'helicopter', 'drone', 'rocket', 'spacecraft', 'space shuttle', 'lunar module', 'rover', 'motorcycle', 'motorbike', 'scooter', 'bike', 'bicycle', 'panzer', /\b(?:battle|army|military|merkava|leopard|tiger|sherman|abrams|t-\d{2})\s+tanks?\b/, 'kart', 'probe', 'space probe', 'space telescope', 'space station', 'capsule', 'lander', 'uav', 'quadrotor', 'quadcopter', 'multirotor', 'multicopter', 'hexacopter', 'vtol', 'auv', 'rov', 'ugv', 'usv', 'golf cart', 'cart', 'wheelchair', 'buggy', 'atv', 'trailer', 'pickup', 'suv', 'hatchback', 'sedan', 'ambulance', 'fire truck', 'subway', 'metro', 'cessna', 'prius', 'wam-v', 'carriage', 'fahrzeug', 'auto', 'schiff', 'flugzeug'),
    W('Musikinstrumente', 'violin', 'viola', 'cello', 'guitar', 'piano', 'drum', 'trumpet', 'trombone', 'flute', 'clarinet', 'saxophone', 'harp', 'accordion', 'banjo', 'ukulele', 'lute', 'xylophone', 'instrument', 'musical instrument'),
    W('Waffen & Militär', 'weapon', 'rifle', 'gun', 'pistol', 'revolver', 'cartridge', 'ammunition', 'bullet', 'grenade', 'cannon', 'mortar', 'sword', 'dagger', 'estoc', 'machete', 'spear', 'bow', 'arrow', 'shield', 'armor', 'armour', 'parabellum', 'nato'),
    W('Figuren & Skulpturen', 'statue', 'sculpture', 'bust', 'figurine', 'figure', 'carved', 'carving', 'relief', 'idol', 'totem', 'gargoyle', 'lion', 'elephant', 'skulptur', 'statuette', 'venus', 'torso', 'scan the world', 'death mask', 'dödsmask', 'gisant'),
    W('Archäologie & Fundstücke', 'artifact', 'artefact', 'artefato', 'archaeolog*', 'excavation', 'tomb', 'burial', 'sepultamento', 'pottery', 'amphora', 'coin', 'inscription', 'stele', 'ruin', 'ancient', 'neolithic', 'roman', 'palmyra'),
    W('Weltraum & Gelände', 'asteroid', 'comet', 'planet', 'mars', 'moon', 'lunar', 'crater', 'elevation', 'terrain', 'topograph*', 'heightmap', 'satellite', 'meteorite', /^\(\d+\)/),
    W('Möbel', 'furniture', 'chair', 'table', 'sofa', 'couch', 'shelf', 'shelves', 'cabinet', 'bed', 'seating', 'desk', 'lamp', 'stool', 'bench', 'wardrobe', 'dresser', 'nightstand', 'möbel'),
    W('Kleidung & Ausrüstung', 'jacket', 'life jacket', 'helmet', 'hat', 'cap', 'shoe', 'boot', 'glove', 'shirt', 'dress', 'bag', 'backpack', 'umbrella', 'glasses', 'mask', 'watch', 'kleidung'),
    W('Essen', 'food', 'fruit', 'apple', 'pear', 'lemon', 'orange', 'mandarinorange', 'avocado', 'melon', 'cucumber', 'banana', 'vegetable', 'bread', 'pastry', 'cookie', 'cake', 'cheese', 'essen'),
    W('Geschirr & Haushalt', 'kitchen', 'plate', 'cup', 'mug', 'bowl', 'pot', 'pan', 'kettle', 'bottle', 'jar', 'can', 'vase', 'goblet', 'tableware', 'cutlery', 'spoon', 'fork', 'knife', 'teapot', 'tea set', 'cleaner', 'bucket', 'basket', 'jerrycan'),
    W('Werkzeug & Technik', 'tool', 'electronic', 'electronics', 'industrial', 'machine', 'camera', 'radio', 'computer', 'wrench', 'hammer', 'axe', 'screwdriver', 'hand truck', 'drill', 'saw', 'engine', 'motor', 'projector', 'boombox', 'boom box', 'telephone', 'phone', 'speaker'),
    W('3D-Druck & Bauteile', '3d print', '3d-print', '3d printing', 'printable', 'stl', 'nut', 'bolt', 'screw', 'washer', 'gear', 'bracket', 'mount', 'holder', 'hinge', 'adapter', 'enclosure', 'spare part', 'caster', 'ballcaster', 'mockup'),
    W('Gebäude & Architektur', 'building', 'architecture', 'house', 'church', 'basilica', 'cathedral', 'castle', 'tower', 'bridge', 'monument', 'temple', 'pier', 'column', 'stairs', 'door', 'window', 'wall', 'fence', 'roof', 'gate', 'windmill', 'heater', 'fireplace'),
    W('Natur & Pflanzen', 'plant', 'tree', 'rock', 'stone', 'nature', 'flower', 'bush', 'grass', 'log', 'mushroom', 'shrub', 'fern', 'cactus', 'cacti', 'leaf', 'leaves', 'branch', 'driftwood', 'coral', 'anemone'),
    W('Deko & Requisiten', 'decorative', 'decor', 'ornament', 'candle', 'clock', 'frame', 'toy', 'barrel', 'crate', 'prop', 'postcard', 'book', 'trophy', 'pouf', 'lantern'),
    W('Testmodelle', 'test', 'testgrid', 'sample', 'morph', 'suzanne', 'spheres', 'cube', 'box'),
  ],
  textur: [
    R('Holz', 'wood', 'plank', 'bark', 'holz'),
    R('Stein & Ziegel', 'brick', 'stone', 'rock', 'cobble', 'marble', 'granite', 'concrete', 'plaster', 'tiles', 'tile', 'pavement', 'stein', 'ziegel'),
    R('Metall', 'metal', 'rust', 'steel', 'iron', 'copper', 'aluminium', 'gold', 'metall'),
    R('Boden & Natur', 'ground', 'soil', 'dirt', 'sand', 'grass', 'gravel', 'moss', 'snow', 'mud', 'forest floor', 'leaves', 'rocks', 'aerial'),
    R('Stoff & Leder', 'fabric', 'cloth', 'leather', 'carpet', 'textile', 'stoff', 'leder'),
    R('Kunststoff & Glas', 'plastic', 'rubber', 'glass', 'kunststoff', 'glas'),
    R('Dach & Fassade', 'roof', 'facade', 'roofing'),
    R('Straße', 'asphalt', 'road', 'street'),
  ],
  hdri: [
    R('Innenräume', 'indoor', 'interior', 'studio', 'room'),
    R('Abend & Nacht', 'night', 'sunset', 'sunrise', 'dusk', 'dawn', 'evening', 'sunrise-sunset'),
    R('Himmel', 'skies', 'sky', 'clouds', 'cloudy'),
    R('Stadt', 'urban', 'city', 'street'),
    R('Natur', 'nature', 'forest', 'field', 'mountain', 'outdoor'),
  ],
  // textur and hdri keep word starts: ambientCG writes names together ("WoodFloor041").
  musik: [
    W('Klassik & Orchester', 'classical', 'orchestra', 'orchestral', 'piano', 'symphon*', 'string', 'strings', 'baroque', 'sonata', 'sonatina', 'concerto', 'nocturne', 'prelude', 'fugue', 'etude', 'étude', 'variation', 'waltz', 'mazurka', 'polonaise', 'minuet', 'quartet', 'quintet', 'trio', 'opus', 'op.', 'musopen', 'chamber music', 'opera', 'aria', 'cantata', 'requiem', 'overture', 'suite', 'bach', 'beethoven', 'mozart', 'chopin', 'brahms', 'schubert', 'haydn', 'handel', 'händel', 'vivaldi', 'liszt', 'debussy', 'tchaikovsky', 'mendelssohn', 'schumann', 'satie', 'grieg', 'dvořák', 'dvorak', 'mussorgsky', 'reicha', 'scarlatti', 'telemann', 'rachmaninoff', 'ravel', 'verdi', 'wagner', 'elgar', 'purcell', 'joplin', /\bBWV\s?\d/, /\bK\.\s?\d{2,3}\b/, /\bD\s?\d{3}\b/),
    W('Gesang & Chor', 'hymn', 'anthem', 'national anthem', 'choir', 'chorus', 'chorale', 'carol', 'gospel', 'song', 'lied', 'lieder', 'vocal', 'singing', 'how great thou art'),
    W('Volksmusik & Traditionell', 'folk', 'traditional', 'bagpipe', 'bagpipes', 'pipers', 'fiddle', 'reel', 'jig', 'polka', 'ethnic', 'world music', 'volksmusik'),
    W('Elektronisch', 'electronic', 'techno', 'house', 'ambient', 'synth', 'synthesizer', 'chiptune', 'edm', 'electro', 'idm', 'trance', 'dubstep', 'drum and bass', 'dnb', 'breakbeat', 'downtempo', 'experimental', 'glitch', 'netlabel', 'bpm', 'midi'),
    W('Rock & Pop', 'rock', 'pop', 'punk', 'metal', 'indie', 'grunge', 'alternative'),
    W('Jazz & Blues', 'jazz', 'blues', 'swing', 'funk', 'soul', 'ragtime', 'bossa nova'),
    W('Akustik & Folk', 'acoustic', 'guitar', 'country', 'singer-songwriter', 'ukulele', 'banjo'),
    W('Hip-Hop', 'hip hop', 'hip-hop', 'hiphop', 'rap', 'beats', 'lofi', 'lo-fi', 'trap'),
    W('Filmmusik', 'cinematic', 'soundtrack', 'film', 'epic', 'trailer', 'score', 'game music'),
  ],
  sound: [
    W('Tiere', 'bird', 'birdsong', 'dog', 'cat', 'animal', 'insect', 'cricket', 'frog', 'toad', 'cow', 'horse', 'owl', 'heron', 'pipit', 'warbler', 'sparrow', 'crow', 'gull', 'duck', 'goose', 'geese', 'bat', 'whale', 'monkey', 'zoo', 'dierentuin', 'xeno-canto', 'birds', 'vogel', /\bXC\d{4,}/),
    W('Wetter & Natur', 'rain', 'thunder', 'wind', 'storm', 'water', 'river', 'stream', 'ocean', 'wave', 'waves', 'sea', 'forest', 'fire', 'nature', 'waterfall', 'creek', 'ice', 'snow'),
    W('Instrumente & Töne', 'harmonica', 'music box', 'musical box', 'bell', 'bells', 'chime', 'gong', 'drum', 'cymbal', 'piano note', 'note', 'notes', 'tone', 'sine', 'tuning fork', 'synthetic sound', 'test tone', 'loop', 'messton', 'whistle', 'organ', /\d+\s?hz\b/),
    W('Schritte & Körper', 'footstep', 'footsteps', 'step', 'breath', 'breathing', 'heartbeat', 'voice', 'scream', 'laugh', 'clap', 'applause', 'cough', 'snore', 'kiss'),
    W('Türen & Mechanik', 'door', 'lock', 'key', 'switch', 'mechanical', 'machine', 'engine', 'motor', 'gear', 'ratchet', 'tool', 'tools', 'drill', 'saw', 'hammer', 'metal', 'clock', 'typewriter'),
    W('Benutzeroberfläche', 'click', 'button', 'ui', 'interface', 'beep', 'notification', 'blip', 'menu', 'alert', 'error sound'),
    W('Explosion & Kampf', 'explosion', 'gun', 'gunshot', 'shot', 'impact', 'hit', 'sword', 'punch', 'crash', 'firework', 'fireworks'),
    W('Stadt & Verkehr', 'city', 'traffic', 'car', 'train', 'tram', 'bus', 'station', 'street', 'crowd', 'market', 'airport', 'telephone', 'fernsprecher', 'stadt'),
    W('Atmosphären & Feldaufnahmen', 'ambience', 'ambient', 'atmosphere', 'atmosfeer', 'sfeer', 'drone', 'room tone', 'field recording', 'soundscape', 'phonography', 'soundmap', 'geluid van nederland', 'radio aporee'),
  ],
  icon: [
    R('Farbig', 'multicolor', 'multi-color', 'colorful', 'flat color'),
    R('Allgemein', 'material', 'general', 'ui'),
    R('Marken & Logos', 'logo', 'brand'),
    R('Emoji', 'emoji'),
    W('Flaggen & Karten', 'flag', 'map', 'country flag', 'flags'),
  ],
  schrift: [
    R('Serif', 'serif'),
    R('Grotesk', 'grotesk', 'sans-serif', 'sans'),
    R('Monospace', 'monospace'),
    R('Handschrift', 'handschrift', 'handwriting'),
    R('Display', 'display'),
  ],
  skript: [
    R('Blender', 'blender'),
    R('Browser & Userscripts', 'userscript', 'tampermonkey', 'greasemonkey', 'browser'),
    R('Shell & Automation', 'shell', 'bash', 'automation', 'powershell', 'zsh'),
    R('Python', 'python'),
  ],
  // projekt: crawler/lib/projekte.mjs (topics first, see there)
  projekt: [],
  skill: [
    R('Entwicklung', 'code', 'coding', 'git', 'test', 'debug', 'refactor', 'review', 'api', 'typescript', 'python', 'frontend', 'backend', 'devops'),
    R('Dokumente', 'pdf', 'docx', 'xlsx', 'pptx', 'document', 'spreadsheet', 'slides', 'markdown'),
    R('Design & Medien', 'design', 'art', 'image', 'video', 'audio', 'brand', 'canvas', 'ui', 'ux'),
    R('Recherche & Schreiben', 'research', 'paper', 'write', 'writing', 'content', 'blog', 'seo', 'academic'),
    R('Daten & Analyse', 'data', 'analytics', 'sql', 'dashboard', 'chart'),
    R('Arbeitsweise', 'plan', 'planning', 'workflow', 'memory', 'agent', 'productivity', 'project'),
  ],
  // Rules match word starts only, so short words that open longer ones ("sea" in "seamless", "car" in
  // "carbon", "cat" in "cathedral") are left out or written with a trailing space.
  video: [
    R('Luftaufnahmen', 'drone', 'aerial', 'flyover', 'fpv', 'drohne', 'luftaufnahme'),
    R('Zeitraffer', 'timelapse', 'time-lapse', 'time lapse', 'hyperlapse', 'zeitraffer'),
    R('Zeitlupe', 'slow motion', 'slow-motion', 'slowmo', 'high-speed', 'high speed', 'zeitlupe'),
    R('Weltraum', 'space', 'nasa', 'esa ', 'galaxy', 'nebula', 'planet', 'rocket', 'aurora', 'international space station', 'weltraum'),
    R('Tiere', 'animal', 'wildlife', 'bird', 'insect', 'fish', 'cats', 'kitten', 'dog', 'horse', 'mammal', 'tier', 'vogel'),
    R('Natur & Wetter', 'nature', 'landscape', 'forest', 'waterfall', 'river', 'lake', 'sea ', 'ocean', 'beach', 'mountain', 'cloud', 'storm', 'thunder', 'snow', 'sunset', 'sunrise', 'natur', 'wald', 'wasserfall', 'gewitter'),
    R('Stadt & Verkehr', 'city', 'street', 'traffic', 'train', 'railway', 'tram', 'cars', 'car ', 'airport', 'highway', 'stadt', 'verkehr', 'straßenbahn'),
    R('Historisches Filmmaterial', 'newsreel', 'archival footage', 'silent film', 'historic footage', 'stummfilm', 'wochenschau'),
    R('Wissenschaft & Technik', 'microscop', 'experiment', 'laboratory', 'robot', 'machine', 'engine', '3d print', 'simulation', 'mikroskop'),
    R('Menschen & Kultur', 'people', 'dance', 'sport', 'concert', 'festival', 'parade', 'crowd', 'tanz'),
  ],
  shader: [
    R('Wasser & Flüssigkeit', 'water', 'ocean', 'wave', 'liquid', 'river', 'underwater', 'caustic', 'wasser'),
    R('Outline & Toon', 'outline', 'toon', 'cel shad', 'cel-shad', 'cartoon', 'anime'),
    R('Pixel & Retro', 'pixel', 'crt', 'vhs', 'retro', 'dither', 'palette', 'psx', 'ps1', 'low-poly', 'lowpoly'),
    R('Feuer & Effekte', 'fire', 'flame', 'smoke', 'explosion', 'vfx', 'magic', 'energy', 'lightning', 'portal', 'shield', 'hologram', 'dissolve'),
    R('Licht & Glühen', 'glow', 'bloom', 'neon', 'emission', 'god ray', 'light', 'shine'),
    R('Verzerrung & Übergänge', 'distort', 'transition', 'wobble', 'warp', 'ripple', 'shockwave', 'glitch', 'wipe'),
    R('Natur & Gelände', 'grass', 'foliage', 'tree', 'leaves', 'terrain', 'snow', 'sand', 'cloud', 'fog', 'sky'),
    R('Nachbearbeitung', 'post-process', 'post process', 'postprocess', 'screen', 'vignette', 'blur', 'chromatic', 'color grading', 'filter'),
    R('2D (Canvas Item)', 'canvas item', 'canvas_item'),
    R('3D (Spatial)', 'spatial'),
    R('Partikel', 'particles'),
  ],
};

export const SONSTIGES = 'Sonstiges';

// Icon styles that the icon adapters set in meta.stil; they decide before any word rule.
const ICON_STILE = new Set(['Emoji', '3D', 'Farbig', 'Illustrationen', 'Pixel', 'Spiele']);

export function unterkategorie(item) {
  const regeln = UNTER[item.kind];
  if (!regeln) return SONSTIGES;
  if (item.kind === 'projekt') return projektOrdner(item.title, item.description, item.tags, item.meta?.sprache) ?? SONSTIGES;
  if (item.kind === 'icon') {
    if (ICON_STILE.has(item.meta?.stil)) return item.meta.stil;
    // Iconify sets: the set's category ("UI Multicolor", "Emoji", "Flags") says more than its name
    for (const r of regeln) if (item.meta?.kategorie && r.re.test(item.meta.kategorie)) return r.label;
  }
  const rest = [...(item.tags ?? []), item.meta?.kategorie, item.meta?.art, item.description?.slice(0, 160)].filter(Boolean).join(' · ');
  for (const text of [item.title ?? '', rest]) {
    for (const r of regeln) if (r.re.test(text)) return r.label;
  }
  return SONSTIGES;
}
