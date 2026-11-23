import openverse from './openverse.mjs';
import wikimedia from './wikimedia.mjs';
import commonsaudio from './commonsaudio.mjs';
import wikimediavideo from './wikimediavideo.mjs';
import polyhaven from './polyhaven.mjs';
import ambientcg from './ambientcg.mjs';
import khronos from './khronos.mjs';
import cleveland from './cleveland.mjs';
import wellcome from './wellcome.mjs';
// artic.mjs (Art Institute of Chicago) is switched off: since 23.11.2026 its IIIF image server answers
// hotlinked requests with a Cloudflare challenge (403), in the browser as well. Blocks are respected, not worked around.
import github from './github.mjs';
import blender from './blender.mjs';
import godot from './godot.mjs';
import opengameart from './opengameart.mjs';
import openclipart from './openclipart.mjs';
import fontsource from './fontsource.mjs';
import iconify from './iconify.mjs';
import internetarchive from './internetarchive.mjs';
import smithsonian from './smithsonian.mjs';
// freesound.mjs is switched off: the Freesound API terms (sections 1 and 4 f) forbid building similar
// databases from it. Freesound sounds still reach the catalogue through Openverse.
// met.mjs (Metropolitan Museum) is switched off: images.metmuseum.org answers automated requests with an
// Imperva bot challenge (checked 23.11.2026). Blocks are respected, not worked around.
//
// Built but held back (23.11.2026), see docs/stand/orchestrator.md:
//   rijksmuseum.mjs   iiif.micr.io/robots.txt ends in "Disallow: /" after an "Allow: /" block; owner decides
//   europeana.mjs     needs a project API key, a personal key is not for production use
//   nga.mjs           CC0 for the images is an assumption, api.nga.gov/robots.txt asks for contact before crawling
//   godotshaders.mjs  full copy through an internal endpoint, database right (§ 87b UrhG) to be checked first
//   smk.mjs           the image server renders cold pictures in 21 to 84 s, too slow for thumbs.mjs as it is

// Order matters for dedupe: direct sources first, aggregators (Openverse) last.
export const SOURCES = [
  wikimedia, commonsaudio, wikimediavideo, polyhaven, ambientcg, khronos, cleveland, wellcome, smithsonian,
  github, blender, godot, opengameart, openclipart, fontsource, iconify, internetarchive, openverse,
].map(({ crawl, ...meta }) => ({ ...meta, crawl }));
