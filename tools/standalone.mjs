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

let css = readFileSync(join(DIST, cssRef[1]), 'utf8');
let js = readFileSync(join(DIST, jsRef[1]), 'utf8');

// Material textures are public assets in a normal build. Inline them into the
// CSS here so the standalone page keeps the same engraved surfaces offline.
const textureDir = join(DIST, 'textures');
const textureNames = existsSync(textureDir) ? readdirSync(textureDir) : [];
for (const name of textureNames) {
  const base64 = readFileSync(join(textureDir, name)).toString('base64');
  const data = `data:image/webp;base64,${base64}`;
  for (const ref of [`../textures/${name}`, `./textures/${name}`, `/textures/${name}`]) {
    css = css.split(ref).join(data);
  }
}

// Fontsource emits local font files next to the built stylesheet. Preserve the
// promise that this output is truly one file by folding those references into
// the CSS as well.
const assetDir = join(DIST, 'assets');
const fontNames = readdirSync(assetDir).filter((name) => /\.woff2?$/.test(name));
for (const name of fontNames) {
  const base64 = readFileSync(join(assetDir, name)).toString('base64');
  const mime = name.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
  const data = `data:${mime};base64,${base64}`;
  for (const ref of [`./${name}`, `../assets/${name}`, `/assets/${name}`]) {
    css = css.split(ref).join(data);
  }
}

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
