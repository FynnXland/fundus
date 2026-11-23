## The idea

Fundus is a catalogue of freely usable works: pictures, 3D models, textures, HDRIs, icons, music, sounds, videos, fonts, scripts, projects and Claude Code skills. It gathers them from open sources and shows them in one place, each with its creator, licence and original page.

Fundus is a catalogue, not a store. The files stay with their sources, and you download them straight from there. The site itself is in German.

## What is in it

At the last update there were just under 60,000 entries from more than 20 sources, among them Wikimedia Commons, Poly Haven, ambientCG, Gazebo Fuel, the Cleveland Museum of Art, the Wellcome Collection, the Internet Archive, Openverse, Fontsource, Blender Extensions, the Godot Asset Library, GitHub and several icon and emoji collections.

Every kind has its own subfolders, such as vehicles, furniture or figures for 3D models. The sorting runs automatically on titles and tags, so now and then something lands in the wrong folder.

## Which licences are taken in

Only licences that allow use, changes and passing on, in commercial projects too:

- public domain: CC0, Public Domain Mark and works whose protection has expired
- Creative Commons BY and BY-SA
- open software licences such as MIT, Apache 2.0, BSD, MPL and GPL
- the SIL Open Font License for fonts

Works marked NC (non-commercial) or ND (no derivatives) are left out, as is anything whose licence the source does not state clearly. Fundus takes the licence as the source names it.

## How you find something

- Folders by kind and subfolder
- Search across title, tags, creator, source and format
- Filters by licence (no attribution, with attribution, share alike), format and source
- Sort order "Recommended": first the ratings the source sites show themselves, then popularity such as downloads or GitHub stars
- Ratings appear as stars from 0 to 5; hovering shows which site they come from
- Grid or list view, plus a button for a random entry

## Preview and download

For every entry with a picture, Fundus keeps a small preview, 320 pixels wide. That way the catalogue shows something without asking other servers.

Large previews, audio samples, font samples and 3D views come straight from the source. The page asks first, because the source's server learns your IP address. You can agree once or always.

You turn 3D models in the browser before downloading them, including models from Gazebo Fuel and STL files from Wikimedia Commons. When a download consists of several files, such as a model with textures, your browser fetches them one by one from the source and packs them into a ZIP file on your device.

## Attribution

Every card has a ready attribution text with title, creator, original page and licence to copy. For public domain works it says that no attribution is needed.

## For AI assistants

There is an MCP endpoint at https://fundus.fynn.land/mcp. With it, an AI assistant can search the catalogue, look at previews, read the details with the licence and fetch the download links from the source. The answers are kept short so that a search costs few tokens.

## Something is wrong

If a licence is wrong, a link is broken or a work does not belong there, report the entry with the "Eintrag melden" link on its card. A link check also hides entries whose files could not be reached twice in a row.

This description refers to version 0.1.0.
