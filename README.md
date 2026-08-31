# Color Blend

An art-reveal game played through color-sorting puzzles.

Each puzzle takes an artwork, pulls its key shades out, and builds a board of
large tiles — squares, hexagons, triangles, diamonds, or a carved silhouette —
filled with a gradient made from that artwork's own palette. The tiles are
shuffled. You sort them darkest to lightest, holding the ordering even as the
hue shifts from one color into another, with one to three starter tiles locked
in place to orient you. Solving reflows the board into the artwork it came from.

Categories are subject-based — the periodic table, the world's biomes — and
certain tiles, unmarked, pop an educational fact when they land correctly. Facts
you find are collected in a journal.

## Running it

```sh
npm install
npm run dev       # play at localhost:5173
npm test          # unit tests
npm run build     # production build into dist/
```

It is a PWA: installable to a phone home screen, and playable offline once
loaded. `base` is relative, so `dist/` works from any subpath (GitHub Pages, a
Capacitor wrapper) with no rebuild.

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

**Interpolation is bilinear, not inverse-distance.** IDW is not linearly
precise: even between two anchors it produces an S-curve that piles most tiles
near the two endpoint colors and leaves the middle sparse — the wrong shade
distribution for a sorting puzzle. Bilinear over four corner colors, with the
darkest and lightest diagonally opposed, spreads the shades evenly and
guarantees a legible dark-to-light axis.

**Tile count is solved for, not authored.** Difficulty is expressed as a target
*perceptual step* between adjacent tiles, and the board size is derived from the
palette to hit it. A washed-out image automatically gets fewer, larger tiles; a
vivid one gets more. See `src/puzzle/difficulty.ts`.

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
  content/  pack schema, zip reading, ingest, baked packs, sampler artworks
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
npm test                       # 71 unit tests: color math, lattices, generation,
                               # hints, zip safety, ingest fallbacks
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

## Current limits

- The four sampler artworks are **drawn in code**, so they read as stylized
  illustration rather than photography. They exist to make the game playable and
  the reveal verifiable before real packs land, and are deletable in one commit
  (`src/content/sampler/`).
- The difficulty constants in `src/puzzle/difficulty.ts` are reasoned starting
  points, not measured against a real photo corpus. The ingest report exists to
  make bad outcomes visible; expect one tuning pass once real packs arrive.
- Packs loaded in-game live in memory for the session only. Reloading returns to
  the shipped content.
