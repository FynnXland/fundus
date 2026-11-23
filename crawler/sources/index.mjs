import openverse from './openverse.mjs';
import wikimedia from './wikimedia.mjs';
import polyhaven from './polyhaven.mjs';
import ambientcg from './ambientcg.mjs';
// artic.mjs (Art Institute of Chicago) is switched off: since 23.11.2026 its IIIF image server answers
// hotlinked requests with a Cloudflare challenge (403), in the browser as well. Blocks are respected, not worked around.
import github from './github.mjs';
import fontsource from './fontsource.mjs';
import iconify from './iconify.mjs';
import internetarchive from './internetarchive.mjs';
import smithsonian from './smithsonian.mjs';
// freesound.mjs is switched off: the Freesound API terms (sections 1 and 4 f) forbid building similar
// databases from it. Freesound sounds still reach the catalogue through Openverse.
// met.mjs (Metropolitan Museum) is switched off: images.metmuseum.org answers automated requests with an
// Imperva bot challenge (checked 23.11.2026). Blocks are respected, not worked around.

// Order matters for dedupe: direct sources first, aggregators (Openverse) last.
export const SOURCES = [wikimedia, polyhaven, ambientcg, smithsonian, github, fontsource, iconify, internetarchive, openverse].map(({ crawl, ...meta }) => ({ ...meta, crawl }));
