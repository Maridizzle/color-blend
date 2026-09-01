# Color Blend

An art-reveal game played through color-sorting puzzles.

Each puzzle takes an artwork, pulls its key shades out, and builds a board of
large tiles — squares, hexagons, triangles, diamonds, or a carved silhouette —
running through a single colour drawn from that artwork's own palette. The tiles
are shuffled. You sort them darkest to lightest, with one to three starter tiles
locked in place to orient you. Solving reflows the board into the artwork it
came from.

One colour is what makes it playable: every tile is one question, *is this
lighter or darker than that one*, with nothing else to work out first.

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

`build:standalone` inlines the styles, the code and every artwork into a single
HTML file that needs no server and no network — open it straight off disk, send
it to someone, or publish it as one page. With twenty images that file is large
(the artwork is around 4 MB before base64), so it is a way to hand the whole
game to one person, not a way to serve it. That build compiles out
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
is. Each board then takes the most chromatic hue its own artwork offers, with
**nothing invented** — a hue is fabricated only for an artwork that has none at
all. The four shipped subjects come out bronze, amber, terracotta and crimson,
so they stay distinct from each other without anyone choosing that. See
`src/color/tones.ts`.

**One hue on easy and medium; two on hard.** Two and three tone families
shipped twice and were rejected twice as too hard, and the reason turned out to
be structural rather than a matter of tuning: both attempts put two hues on the
*same axis as the lightness*, so the two competed for one ordering and the
board's two hardest judgements — which indigo is the last indigo, which gold is
the first gold — landed side by side, exactly where the hue cue says least.

The fix is to give hue an axis of its own. A hard board is a **separable
plane**: lightness down one axis at constant hue, hue across the other at
constant lightness and chroma, four locked corners, on a plain rectangular grid.
Every cell then has one home, read off two independent readings.

This is what the genre does. I Love Hue's later levels lock only the four
corners and have you interpolate the plane between them; a row of that plane is
exactly the Farnsworth–Munsell 100 hue test's construction, caps at fixed value
and chroma. It also disposes of the Helmholtz–Kohlrausch problem rather than
correcting for it — saturated colours look lighter than Oklab says, by an amount
peaking at blue and vanishing at yellow, so a ramp that changes hue *while*
changing lightness has its apparent order pulled off its real one. Down a column
hue is constant, so the distortion is an offset that cannot reorder anything.

Two-colour boards also open with a brief look at the solved plane before it
scrambles, lifted from the same place. A one-colour board's target follows from
the rule; a plane's does not.

`docs/two-colour.md` has the research, the sources, and three assumptions the
implementation had to correct along the way — including that "space hue by ΔE
rather than by degrees" is a distinction without a difference, since at fixed
lightness and chroma the Oklab hue circle is a circle and the step is the chord
`2·C·sin(Δh/2)` wherever on the wheel it sits.

The cost is that the hard tier is rectangles, so it loses its silhouettes.
`DIFFICULTY_TUNING.toneCount.hard` back to `1` reverts all of it.

**No two boards in a category are the same colour.** Hue is assigned across a
category rather than per subject, because per subject it collapses: most of the
shipped images have a dominant hue between 43° and 87°, since lit dust and
starlight are warm. Played end to end that is one puzzle wearing many titles.

So `src/content/hues.ts` lays out *n* evenly spaced slots around the wheel and
hands them out so each artwork gets the slot closest to a colour it actually
contains. Even spacing is what guarantees no repeats; the matching is what keeps
the choice tied to the pictures rather than being a palette someone picked. Each
artwork nominates *every* chromatic cluster it has, not just its strongest,
which is the part that makes it worth doing — an image that is mostly gold but
holds a real blue can take a blue slot cheaply and leave the gold to an image
with nothing else. The ones that barely move are the ones with a genuine claim.

Assigned **per category**, not once across everything. Twenty-seven subjects on
one wheel sit 13° apart, which is not a difference anyone can see; per category
they get 33°, 40° and 51°. The trade is that a hue can recur between categories
— never within a list you are looking at, which is the only place it would read
as a repeat. A pack loaded from a zip runs the same assignment during ingest.

The search is greedy plus pairwise repair rather than exhaustive, so its quality
is a claim rather than an assertion: there is a test that checks it matches a
brute-force optimum on every category small enough to enumerate.

**A one-colour field is one-dimensional.** Every cell projects onto a single
oriented axis and takes its colour from that position along the ramp. This replaced a
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
puzzles now step by 0.104–0.138 in Oklab, against 0.023–0.057 before.

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
  content/  pack schema, zip reading, ingest, per-category hue assignment,
            baked packs, shipped artwork
  render/   canvas board, ID-buffer hit testing, reveal morph
  game/     session (state, input, animation loop), persistence, library
  ui/       screens
tools/      pack-cli.ts (build-time ingest), verify.mjs (browser check)
tests/      vitest
docs/       two-colour.md — the colour and game-design research behind the
            two-colour boards, and what it corrected
```

The engine speaks plain `{ width, height, data: Uint8ClampedArray }` — no DOM,
no Node APIs — so the browser and the CLI share identical code and it is
testable against synthetic pixel buffers.

## Verifying

```sh
npm test                       # 124 unit tests: color math, tone ramps, the
                               # two-colour plane, lattices, board shape, hue
                               # assignment, content and board variety,
                               # generation, hints, zip safety, ingest
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

Twenty-seven artworks across three categories. The images live in `public/artwork/` and
are referenced by URL, so they go through exactly the same palette extraction a
loaded pack does, with no special case for being built in.

- **The Cosmos** (11) — galaxies, Saturn, the Crab Nebula, an accretion disc, a
  black hole. Astronomical objects, carrying astronomy.
- **Our Place In It** (9) — figures under strange skies, machines, ruins. These
  are human-scale scenes, and a fact about spiral arms would be pasted on, so
  the category is about scale, deep time and what we are made of instead. The
  split is about the facts, not the pictures.
- **Patterns in Nature** (7) — a soap film, an ammonite, phyllotaxis, a falling
  drop. Spirals, ripples, and colour made from structure rather than pigment,
  which is an unusually good fit for a colour game: several of these are about
  how physics makes colour with no pigment involved at all.

Each category ramps easy to hard across its own length, and boards are assigned
by position rather than by a hash of the subject id — a hash gives each board
stability and says nothing about its neighbours, so across twenty subjects it
collides and the same handful of boards keep coming back. Walking the lattice
and shape lists with a coprime stride guarantees the set is varied, which is the
property that actually matters once a category is longer than a few puzzles.

Silhouettes carry their own minimum tile count rather than all waiting on one
threshold: a twelve-tile circle is obviously a circle, and a twelve-tile star is
a smudge. They also carry the lattices they read on, which is a table of
observations rather than a rule — a crescent cut from triangles came out as a
zigzag, a leaf cut from squares as a ragged staircase. Both were the right tile
count and the right aspect, and both looked like a board with bits missing.

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
- Thirty tiles in one hue is the finest judgement the game asks for, at 0.019
  Oklab between neighbours. It is above the legibility floor and inside the
  correctness tolerance, so no placement is unfair, but it is the first board to
  shrink if the hard tier still feels too hard.
- Packs loaded in-game live in memory for the session only. Reloading returns to
  the shipped content.
