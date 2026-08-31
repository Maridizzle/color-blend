/**
 * Bundle the whole game into one self-contained HTML file.
 *
 *   npm run build:standalone            -> color-blend.html
 *   npm run build:standalone -- out.html
 *
 * Styles, code and all four artworks are inlined, so the result needs no
 * server and no network: open it from disk, mail it to someone, or publish it
 * as a single page. Run against a build made with COLOR_BLEND_STANDALONE=1,
 * which compiles out the service worker and the baked-pack loader — a file
 * with no siblings should not go looking for any.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const out = process.argv[2] ?? 'color-blend.html';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build found. Run `npm run build:standalone`, which builds first.');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const cssRef = html.match(/href="[^"]*?(assets\/[^"]+\.css)"/);
const jsRef = html.match(/src="[^"]*?(assets\/[^"]+\.js)"/);
if (!cssRef || !jsRef) {
  console.error('Could not find the built CSS/JS in dist/index.html.');
  process.exit(1);
}

const css = readFileSync(join(DIST, cssRef[1]), 'utf8');
let js = readFileSync(join(DIST, jsRef[1]), 'utf8');

// Swap every artwork reference for the image itself. Loading these through an
// <img> rather than fetch (see src/content/artwork.ts) is what lets a data URL
// work here at all.
const artworkDir = join(DIST, 'artwork');
const names = existsSync(artworkDir) ? readdirSync(artworkDir) : [];
let inlined = 0;
for (const name of names) {
  const ref = `./artwork/${name}`;
  if (!js.includes(ref)) continue;
  const base64 = readFileSync(join(artworkDir, name)).toString('base64');
  js = js.split(ref).join(`data:image/jpeg;base64,${base64}`);
  inlined++;
}
if (js.includes('./artwork/')) {
  console.error('An artwork reference survived inlining; the page would be broken.');
  process.exit(1);
}

// Emit page content only: doctype, head and body come from whatever hosts it.
const page = `<title>Color Blend</title>
<style>
${css}
</style>
<div id="app"></div>
<script type="module">
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;

writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024 / 1024).toFixed(2)} MB  (${inlined} artworks inlined)`);
