# Color Blend

An art-reveal game played through color-sorting puzzles.

Each puzzle takes an artwork, pulls its key shades out, and builds a board of
large tiles — squares, hexagons, triangles, diamonds, or a carved silhouette —
running through two or three tone families drawn from that artwork's own
palette. The tiles are shuffled. You sort them darkest to lightest, holding the
ordering across the boundary where one tone gives way to the next, with one to
three starter tiles locked in place to orient you. Solving reflows the board
into the artwork it came from.

The tone families are what make it readable, and they are blocks rather than a
blend: pile the cool ones and the warm ones separately first, then order within
each by lightness.

Categories are subject-based, so playing one walks you through a topic, and
certain tiles, unmarked, pop an educational fact when they land correctly. Facts
you find are collected in a journal.

## Running it

```sh
npm install
npm run dev              # play at localhost:5173
npm test                 # unit tests
npm run build            # production build into dist/
npm run build:standalone # one self-contained color-blend.html
```

It is a PWA: installable to a phone home screen, and playable offline once
loaded. `base` is relative, so `dist/` works from any subpath (GitHub Pages, a
Capacitor wrapper) with no rebuild.

`build:standalone` inlines the styles, the code and all four artworks into a
single HTML file that needs no server and no network — open it straight off
disk, send it to someone, or publish it as one page. That build compiles out
the service worker and the baked-pack loader, since a file with no siblings
should not go looking for any.

## Deploying it

`.github/workflows/deploy.yml` builds the game and publishes it to GitHub Pages
on every push to the default branch, giving it a shareable URL:

```
https://<user>.github.io/color-blend/
```

The build needs no configuration for this — `base` is already relative, so the
output works at a project-site path unchanged.

**One-time setup, in the repository's own settings:**

1. **Settings -> Pages -> Source -> "GitHub Actions".** The workflow tries to
   turn this on by itself, but creating a Pages site needs more permission than
   a workflow token is granted, so the first time is manual.
2. **GitHub Pages requires a public repository on the free plan.** On a paid
   plan a private repository can publish; otherwise change the repository's
   visibility under Settings -> General.

**Then run the workflow again** — from the Actions tab, or by pushing anything.
This step is easy to miss: turning Pages on does not deploy what is already
built. Only a run that happens *after* the setting is on will publish.

Before Pages is enabled the workflow still builds and tests normally and simply
skips the deploy, leaving a "Deploy skipped" panel on the run summary saying so.
The run stays green, because nothing is broken — but green does not mean
published, and that panel is how to tell the difference.

### Sharing it without publishing the repository

`npm run build:standalone` produces a single self-contained `color-blend.html`.
It needs no server and no network, so it can simply be sent to someone, and it
keeps the repository private.

## How the puzzle works

A real image is not a monotonic gradient, so "sort darkest to lightest" and "the
solved board *is* the picture" cannot both be true. The resolution:

- The **board you play** is a gradient field interpolated from the artwork's
  extracted anchor colors. It is always sortable, always solvable, and never
  asks you to distinguish two shades you cannot see apart.
- The **artwork is the reward**. On solve, the tiles morph into a square mosaic
  of the real image, which then crossfades to the image itself. That is also
  what lets a hexagon- or leaf-shaped board resolve into a square picture.

Some details that carry weight:

**Everything is Oklab.** Lightness ordering and "how different do these two
tiles look" both need to mean what a player perceives, and sRGB is badly
non-uniform for both. Clustering, interpolation, distance, and the correctness
tolerance all live in Oklab.

**Correctness matches on color, not tile identity.** Wherever the gradient
produces two tiles within tolerance of each other, those tiles are genuinely
interchangeable and either placement counts.

**The board is re-voiced, not copied.** A board built straight from an
artwork's own shades is usually unplayable, and measuring the shipped four shows
why. Each already carries two opposed hue directions — cool blue-violet in the
shadows, warm gold in the highlights, 156° to 180° apart. Both were invisible,
for two reasons: chroma sat at 0.01–0.15, which reads as grey, and the ends sat
at lightness 0.15 and 0.92, where the sRGB gamut is too narrow to hold any
colour at all. The palette had put its two hue families exactly where they could
not be seen.

So the ramp pulls the lightness range in to 0.30–0.84, giving colour somewhere
to live, and raises chroma to a floor scaled by how vivid the artwork actually
is. On all four shipped subjects that recovers a real two- or three-tone board
with **nothing invented** — the tones were already in the pictures. Invention is
reserved for an artwork with a single hue, and only ever up to two families:
a requested tone count is a ceiling, not a quota. See `src/color/tones.ts`.

**Hue steps between families; it does not sweep between them.** Each family
owns an equal block of the ramp and the hue changes at the boundary. This was a
smooth transition first, and the reason it changed is the clearest lesson in the
project: sweeping 150° between two families means a couple of ramp positions
land mid-arc, and at 12–30 tiles "a couple of positions" is *one tile*. Saturn
came out as nine indigo tiles, one magenta, one red, and nine gold — a correct
sample of a smooth function, and two tiles that looked broken to the person
holding the phone.

The tell was Black Hole, the one board where the arc looked deliberate: its red
is a real third *family*, so it gets ten tiles and reads as a group. A hue that
appears on one tile and nowhere else reads as a mistake however smooth the
function behind it is. Widening the sweep instead would have spent the whole
board on it and turned a two-tone sort into a rainbow — the opposite of making
it obvious which end is which.

A bare step was not enough on its own. Ten near-identical indigos meeting ten
near-identical golds gives the middle of the board nothing to say — you cannot
tell which indigo is the last one, and lightness alone steps about 0.03 a tile
there, near the limit of what anyone can order by eye. So chroma fades toward a
tint at each boundary and swells back to full inside each block. The step then
lands where colour is weakest, and the tiles either side read as a dusty blue
and a soft tan: genuinely in-between, without either taking a hue that belongs
to neither family. It also gives the sort a second cue — the further a tile sits
from the middle, the stronger its colour.

The fade is bounded and never reaches neutral, which is the distinction that
matters: a *controlled* dip at one seam is a diverging scale, while the washed-
out board this whole system replaced was low chroma everywhere. Tests pin down
the seam, the no-orphan-hue property, and that hue changes exactly at the chroma
minimum.

**The field is one-dimensional.** Every cell projects onto a single oriented
axis and takes its colour from that position along the ramp. This replaced a
two-dimensional bilinear blend of four corner colours, which was right when
boards ran to hundreds of tiles and wrong at twelve: nobody infers a 2D
arrangement from a dozen swatches. One axis makes the rule literal — dark at one
end, light at the other, cool at one end and warm at the other. Cells that
project to the same position share a colour, which keeps the interchangeable-
tiles fairness property intact.

**Boards are sized for a person, not for a metric.** Difficulty is an authored
tile count — 12, 20, 30 — and the perceptual step between adjacent tiles is
whatever falls out of it. This started the other way round, with the step as the
target and the count solved for, and that was a mistake worth recording: it
means a vivid image with a wide palette earns *more* tiles, because the
arithmetic says its shades are still far enough apart to tell apart. It produced
a 352-tile board that was technically legible and completely unplayable. The
limit was never whether two shades can be told apart side by side; it is how
many things a person can hold in their head and put in order.

Sizing by count also makes the boards easier to read, not just smaller: the same
palette across fewer tiles puts the shades further apart. The four shipped
puzzles now step by 0.161–0.293 in Oklab, against 0.023–0.057 before.

The old calibration survives as a safety net, which is what it was always good
for: an image whose shades barely separate gets a smaller board, so a blind pack
cannot produce tiles nobody can order. On a decent palette it never triggers.
See `src/puzzle/difficulty.ts` — `tileCount` is the one thing to change if the
game feels too easy or too fiddly.

## Content packs

A pack is a zip of images. It can be loaded two ways, both running the same
ingest code so a pack that passes one plays in the other:

- **In the game** — "Load a pack" on the home screen. Unzipped and analyzed
  entirely in the browser; nothing is uploaded.
- **At build time** — `npm run pack -- some-pack.zip`. Writes playable content
  into `public/packs/` and prints a quality report. `--check` reports without
  writing. Exits non-zero if any image was rejected, so CI can gate on it.

`pack.json` is optional. Without one, every image becomes a subject and titles
come from the filenames.

```json
{
  "schemaVersion": 1,
  "category": { "id": "biomes", "title": "The World's Biomes" },
  "subjects": [
    {
      "image": "images/kelp-forest.jpg",
      "title": "Kelp Forest",
      "difficulty": "medium",
      "shape": "circle",
      "facts": ["Giant kelp can grow 60 cm in a single day."]
    }
  ]
}
```

### The quality gate

Packs are meant to arrive **blind** — nobody eyeballs the images before they
become puzzles. So generation is fully automatic, and it has to fail loudly
rather than shipping a board nobody can sort. Every image is assessed and gets
one of `ok` / `warn` / `reject`, with a reason:

```
Pack: test-pack.zip
Images: 4 found, 2 playable, 2 rejected
  [ok  ] Sunset Over Water (images/sunset.jpg) spread 0.40, 4 anchors
  [warn] Temperate Forest (images/forest.jpg) spread 0.26, 3 anchors
         - Shades span 0.263; the puzzle will be hard to read. Tile count reduced.
  [FAIL] Stone (images/stone.jpg)
         - Fewer than two distinct shades; there is nothing to sort.
```

Every fallback taken — a title guessed from a filename, a subject with no facts,
an image the manifest forgot — is reported rather than silently assumed.

Packs are treated as untrusted, since they are meant to be passed around: entry
paths are sanitized against traversal, sizes are capped against decompression
bombs, and only image extensions are decoded.

## Layout

```
src/
  color/    Oklab conversions, k-means palette extraction, quality gate, gamut fitting
  puzzle/   lattices and shape masks, gradient field, difficulty calibration,
            generator, correctness and hints
  content/  pack schema, zip reading, ingest, baked packs, shipped artwork
  render/   canvas board, ID-buffer hit testing, reveal morph
  game/     session (state, input, animation loop), persistence, library
  ui/       screens
tools/      pack-cli.ts (build-time ingest), verify.mjs (browser check)
tests/      vitest
```

The engine speaks plain `{ width, height, data: Uint8ClampedArray }` — no DOM,
no Node APIs — so the browser and the CLI share identical code and it is
testable against synthetic pixel buffers.

## Verifying

```sh
npm test                       # 96 unit tests: color math, tone ramps, lattices,
                               # board shape, generation, hints, zip safety,
                               # ingest fallbacks
npm run dev &                  # then, against a running server:
npm run verify                 # drives a real browser through a whole playthrough
```

`npm run verify` uses no test hooks: it clicks into a puzzle, taps two tiles to
check swapping, undoes, then presses Hint until the board solves, and screenshots
the board, the reveal, and the journal into `screenshots/`. Pass
`--url http://localhost:4173` to check a production build.

## Accessibility

This is a color game, so it gets real attention. The task is *ordering by
lightness*, and lightness ordering survives color-vision deficiency — so
**Lightness assist** in Settings draws a bar on each tile showing how light it
is, making the board playable without relying on hue at all. Arrow keys move a
cursor between neighboring tiles on any lattice, Enter picks up and places. The
reveal honors `prefers-reduced-motion`.

## Shipped content

One category, **The Cosmos**, with four subjects: Spiral Galaxy, Saturn,
Supernova Remnant, Black Hole. The artwork lives in `public/artwork/` and is
referenced by URL, so it goes through exactly the same palette extraction a
loaded pack does, with no special case for being built in.

The four run easy to hard — 12, 19, 21 and 30 tiles — and the progression
happens to teach the mechanic well: the galaxy is a dozen tiles in two blocks,
so it is close to a pure lightness sort, while the black hole spans three
families 280° apart and asks you to hold the ordering across two seams.

## Current limits

- Whether 12 / 20 / 30 are the *right* counts is a judgement about how it feels
  to play, which no test settles. They come from what a person said they could
  actually sort. Changing them is one constant. (A masked silhouette lands near
  rather than on its count — a 20-tile circle of hexagons carves to 19.)
- Palette extraction takes the artwork as it finds it, and it only ever chooses
  *which* hues a board uses — how vivid they end up is the ramp's decision, not
  the image's. A picture with one real hue therefore yields a two-block board
  with one invented partner, which is honest but less interesting than one whose
  own palette supplies both.
- A fact card is a fixed panel over the board. Only one shows at a time now,
  but on a twelve-tile board at phone width it still covers a row while it is up.
- Packs loaded in-game live in memory for the session only. Reloading returns to
  the shipped content.
