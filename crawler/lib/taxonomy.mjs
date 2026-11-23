// Subcategories (Unterkategorien) per kind, the second level of the tree on the left of the site.
// Rules match whole words in title, tags and source categories, English and German. The first matching
// rule wins, so more specific rules come first. Entries that match nothing land in "Sonstiges".

const R = (label, ...words) => ({ label, re: new RegExp(`(^|[^a-zäöüß])(${words.join('|')})`, 'i') });

export const UNTER = {
  bild: [
    R('Weltraum', 'space', 'galaxy', 'nebula', 'planet', 'moon', 'mond', 'astronom', 'nasa', 'star cluster', 'weltraum'),
    R('Tiere', 'animal', 'bird', 'insect', 'butterfly', 'moth', 'cat', 'dog', 'horse', 'fish', 'mammal', 'reptile', 'spider', 'beetle', 'tier', 'vogel', 'fauna', 'lepidoptera', 'aves'),
    R('Pflanzen', 'plant', 'flower', 'tree', 'leaf', 'leaves', 'botanical', 'blossom', 'fungi', 'mushroom', 'flora', 'pflanze', 'blume', 'baum'),
    R('Architektur', 'architecture', 'building', 'church', 'cathedral', 'castle', 'palace', 'tower', 'bridge', 'house', 'interior', 'monastery', 'temple', 'mosque', 'kirche', 'schloss', 'gebäude', 'palacio'),
    R('Stadt', 'city', 'street', 'urban', 'skyline', 'night', 'stadt', 'straße'),
    R('Landschaft', 'landscape', 'mountain', 'lake', 'river', 'sea', 'beach', 'coast', 'forest', 'valley', 'glacier', 'sunset', 'sunrise', 'waterfall', 'landschaft', 'berg', 'see', 'wald'),
    R('Kunst & Grafik', 'painting', 'drawing', 'print', 'poster', 'illustration', 'engraving', 'artwork', 'woodcut', 'lithograph', 'gemälde', 'zeichnung'),
    R('Technik', 'machine', 'engine', 'locomotive', 'train', 'car', 'aircraft', 'airplane', 'ship', 'vehicle', 'technology', 'maschine'),
    R('Essen', 'food', 'fruit', 'vegetable', 'dish', 'bread', 'essen'),
    R('Texturen & Muster', 'texture', 'pattern', 'background', 'surface', 'muster'),
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
  '3d': [
    R('Möbel', 'furniture', 'chair', 'table', 'sofa', 'couch', 'shelf', 'cabinet', 'bed', 'seating', 'desk', 'lamp', 'möbel'),
    R('Natur & Pflanzen', 'plant', 'tree', 'rock', 'stone', 'nature', 'flower', 'bush', 'grass', 'log', 'mushroom'),
    R('Geschirr & Küche', 'kitchen', 'food', 'plate', 'cup', 'bowl', 'pot', 'bottle', 'jar', 'vase', 'goblet', 'tableware'),
    R('Werkzeug & Technik', 'tool', 'electronic', 'industrial', 'machine', 'camera', 'radio', 'computer', 'wrench', 'hammer'),
    R('Fahrzeuge', 'vehicle', 'car', 'bike', 'boat', 'truck'),
    R('Gebäude & Teile', 'building', 'architecture', 'door', 'window', 'wall', 'fence', 'barrel', 'crate', 'prop'),
    R('Deko', 'decorative', 'decor', 'ornament', 'statue', 'candle', 'clock', 'frame'),
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
  musik: [
    R('Elektronisch', 'electronic', 'techno', 'house', 'ambient', 'synth', 'chiptune', 'edm', 'electro', 'idm'),
    R('Klassik & Orchester', 'classical', 'orchestra', 'orchestral', 'piano', 'symphony', 'string', 'baroque'),
    R('Rock & Pop', 'rock', 'pop', 'punk', 'metal', 'indie'),
    R('Jazz & Blues', 'jazz', 'blues', 'swing', 'funk', 'soul'),
    R('Akustik & Folk', 'acoustic', 'folk', 'guitar', 'country'),
    R('Hip-Hop', 'hip hop', 'hiphop', 'rap', 'beat', 'lofi', 'lo-fi'),
    R('Filmmusik', 'cinematic', 'soundtrack', 'film', 'epic', 'trailer'),
  ],
  sound: [
    R('Wetter & Natur', 'rain', 'thunder', 'wind', 'storm', 'water', 'river', 'ocean', 'wave', 'forest', 'fire', 'nature'),
    R('Tiere', 'bird', 'dog', 'cat', 'animal', 'insect', 'cricket', 'frog', 'cow', 'horse'),
    R('Schritte & Körper', 'footstep', 'footsteps', 'step', 'breath', 'heartbeat', 'voice', 'scream', 'laugh', 'clap'),
    R('Türen & Mechanik', 'door', 'lock', 'key', 'switch', 'mechanical', 'machine', 'engine', 'motor', 'gear'),
    R('Benutzeroberfläche', 'click', 'button', 'ui', 'interface', 'beep', 'notification', 'blip', 'menu'),
    R('Explosion & Kampf', 'explosion', 'gun', 'shot', 'impact', 'hit', 'sword', 'punch', 'crash'),
    R('Stadt & Verkehr', 'city', 'traffic', 'car', 'train', 'street', 'crowd'),
    R('Atmosphären', 'ambience', 'ambient', 'atmosphere', 'drone', 'room tone'),
  ],
  icon: [
    R('Allgemein', 'material', 'general', 'ui'),
    R('Marken & Logos', 'logo', 'brand'),
    R('Emoji', 'emoji'),
    R('Flaggen & Karten', 'flag', 'map'),
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
  projekt: [
    R('Spiele', 'game', 'game-engine', 'gamedev', 'godot'),
    R('Vorlagen', 'boilerplate', 'template', 'starter'),
    R('Selbst hosten', 'self-hosted', 'selfhosted'),
  ],
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

export function unterkategorie(item) {
  const regeln = UNTER[item.kind];
  if (!regeln) return SONSTIGES;
  const text = [item.title, ...(item.tags ?? []), item.meta?.kategorie, item.meta?.art, item.description?.slice(0, 160)].filter(Boolean).join(' · ');
  for (const r of regeln) if (r.re.test(text)) return r.label;
  return SONSTIGES;
}
