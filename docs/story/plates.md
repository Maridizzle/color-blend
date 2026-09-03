# The collection plates

Each archive's gallery uncovers one large image, a share per puzzle solved.

**All six are installed**, in `public/artwork/plates/`, and wired to their
categories in `src/content/sampler/index.ts`. Below are the prompts that made
them and what to hold a future one to. `tools/shoot-plates.mjs` renders every
gallery fully solved so a new plate can be checked for misregistration before it
ships:

```
npx vite --port 5175 &
URL=http://127.0.0.1:5175 node tools/shoot-plates.mjs
```

To replace one, or add a plate for a new archive, drop the file at
`public/artwork/plates/<id>.jpg` and add `mosaic` to that category in
`src/content/sampler/index.ts`:

```ts
mosaic: { kind: 'url', url: './artwork/plates/cosmos.jpg' },
```

Nothing else changes. Until a plate exists the gallery composes the mosaic from
the collection's own puzzle artworks, which is what every loaded pack gets.

## What the cut demands

The grid comes from `mosaicPlan()` — enough cells for one per puzzle, squared off.

| archive | puzzles | grid | aspect | cut lines |
|---|---|---|---|---|
| The Cosmos | 11 | 4 × 3 = 12 | **4:3 landscape** | vertical at 25 / 50 / 75%, horizontal at 33 / 66% |
| Our Place In It | 9 | 3 × 3 = 9 | **1:1 square** | 33 / 66% both axes |
| Patterns in Nature | 7 | 3 × 3 = 9 | **1:1 square** | 33 / 66% both axes |
| Small Company | 6 | 3 × 2 = 6 | **3:2 landscape** | vertical at 33 / 66%, horizontal at 50% |
| The Rare Hour | 5 | 3 × 2 = 6 | **3:2 landscape** | vertical at 33 / 66%, horizontal at 50% |
| The Elements | 7 | 3 × 3 = 9 | **1:1 square** | 33 / 66% both axes |

Every shipped archive now has a plate. A pack loaded from a zip composes its
mosaic from its own puzzle artworks instead, which needs nothing authored.

Three rules follow from that, and they matter more than prettiness:

1. **Detail to all four edges.** A subject floating in empty ground means most
   pieces are blank, and a blank piece is an unrewarding thing to have earned.
2. **Nothing irreplaceable on a cut line**, especially the centre of a square
   plate — the middle cell is one of nine, not the payoff.
3. **No lettering at all.** It comes out as gibberish and breaks across a cut.

Dark ground throughout, so the plate sits inside the reliquary rather than
glowing out of it.

---

## Plate I · The Cosmos — 4:3 landscape

> A medieval illuminated astronomical plate painted on dark aged vellum, in the
> style of a Book of Hours page crossed with an alchemical treatise. The entire
> surface is worked edge to edge with no empty ground anywhere: dozens of small
> gold-ruled roundels and cartouches of differing sizes, packed and overlapping
> across the whole frame, each holding a different celestial subject — a spiral
> galaxy seen face on, a ringed planet, a comet with a divided tail, a banded gas
> giant, a cluster of stars, a nebula in filaments, a crescent moon, an orbital
> diagram of concentric circles, a sun in beaten gold leaf. Between and behind
> the roundels the vellum is filled with fine ink hatching, scattered
> constellation points joined by hairline gold rules, and drifting dust.
> Palette: deep near-black indigo and warm charcoal grounds, tarnished gold leaf,
> oxblood red, midnight violet, small accents of verdigris. Candlelit and muted,
> gold slightly worn away in places, vellum stained and foxed with age. Flat
> medieval perspective, no photographic depth of field, everything in focus and
> equally detailed at every point in the frame. No text, no letters, no numerals,
> no words, no signature, no border frame around the outside edge.

**Landscape 4:3.** Choose on: nothing large centred, density unbroken across the
whole frame, and no single roundel spanning more than about a quarter of the
width — a big object would be split across two cells and read as damage.

---

## Plate II · Our Place In It — 1:1 square

> A medieval illuminated cosmographic plate on dark aged vellum, in the manner of
> a Renaissance armillary chart drawn by a monastic illuminator. At the centre a
> gilded orb of a blue-green world with ink-drawn continents, small enough to
> occupy only the middle fifth of the frame, ringed by concentric orbital circles
> ruled in gold. The entire surrounding field is worked just as densely as the
> centre, right to all four edges: the moon rendered in a row of phases, an
> armillary sphere, a sextant and dividers, banks of stylised cloud, waves in the
> medieval scallop convention, mountain ranges in fine ink hatching, a sun in
> beaten gold leaf at one corner and a crescent moon at another, small birds, a
> sailing ship, scattered stars joined by hairline gold rules.
> Palette: deep near-black indigo ground, tarnished gold leaf, sea green, oxblood
> red, midnight violet. Candlelit and muted, gold worn, vellum stained and foxed.
> Flat medieval perspective, everything equally detailed and in focus across the
> whole frame, no vignetting, no empty background anywhere. No text, no letters,
> no numerals, no words, no signature, no border frame around the outside edge.

**Square 1:1.** Choose on: the central world small enough to sit inside the
middle cell without touching the 33% cut lines, and the eight surrounding
regions each carrying something worth uncovering on its own.

---

## Plate III · Patterns in Nature — 1:1 square

> A medieval illuminated naturalist's plate on dark aged vellum, in the manner of
> a cabinet of curiosities catalogued by a monastic illuminator. The entire
> square is packed edge to edge with specimens of deliberately uneven size and
> irregular placement, overlapping and interlocking with no gaps and no grid:
> a coiled ammonite in cross-section, a nautilus shell, a sunflower seed head
> with its double spiral, an unfurling fern crozier, a peacock feather eye, a
> snail shell, ripples spreading on water, a whirlpool, a pine cone, a dragonfly
> wing, a droplet with its crown of splash, a spider's orb web. Each specimen is
> outlined in fine ink with a thin gold rule; the vellum between them is filled
> with hairline hatching and small scattered seeds and leaves so no bare ground
> shows.
> Palette: deep near-black ground, tarnished gold leaf, peacock blue-green,
> amber, oxblood red, with faint iridescent glazes over the gold on the feather
> and the shell. Candlelit and muted, gold worn, vellum stained and foxed. Flat
> medieval perspective, everything equally detailed and in focus across the whole
> frame. No text, no letters, no numerals, no words, no signature, no border
> frame around the outside edge.

**Square 1:1.** Choose on: specimens *not* falling into a neat 3 × 3 arrangement —
uneven sizes and offset placement mean each uncovered piece shows parts of
several things and the whole only resolves at the end, which is the point.

---

## Plate IV · Small Company — 3:2 landscape

> A medieval illuminated naturalist's plate on dark aged vellum, in the manner
> of a monastic herbal crossed with a bestiary, in wide landscape format. The
> whole surface is the floor of a forest seen from directly above, worked edge
> to edge with no empty ground anywhere: a rotting log with a bright yellow
> slime mould spreading over it in branching veins, a fat striped caterpillar
> eating along the edge of a leaf, a garden snail with a banded shell and both
> horns out on a wet leaf, a blue morpho butterfly with its wings open, a single
> red poppy with a bee at it, and everywhere between them the litter itself —
> woodlice, tiny springtails, white threads of fungus, acorns, beetles, moss,
> curled leaves — all drawn small and precise. Creatures of deliberately uneven
> size, none larger than about a fifth of the picture's height, scattered
> without any grid, and the middle band of the picture is leaf litter and small
> things rather than any one creature. Each specimen outlined in fine ink with a
> thin gold rule.
> Palette: deep near-black ground, tarnished gold leaf, moss green, amber,
> oxblood red for the poppy, one shock of morpho blue. Candlelit and muted, gold
> worn, vellum stained and foxed. Flat medieval perspective, everything equally
> detailed and in focus at every point in the frame, no vignetting, no depth of
> field. No text, no letters, no numerals, no words, no signature, no border
> frame around the outside edge.

**Landscape 3:2.** The cut is vertical at 33 / 66% and horizontal at 50%, and
the horizontal one runs the whole width. Choose on: nothing you would mind
halving — the butterfly, the poppy, the snail — sitting across the middle of the
picture; the litter band belongs there. No painted frame.

---

## Plate V · The Rare Hour — 3:2 landscape

> A medieval illuminated plate of wonders on dark aged vellum, in the manner of
> a Book of Hours night page crossed with a mariner's chart, in wide landscape
> format. Things that happen rarely, gathered into one night scene and worked
> edge to edge with no empty ground anywhere: along the bottom a dark sea with a
> breaking wave whose whole edge glows pale blue-green, and glowing footprints
> on the wet sand; on the sea floor at one lower corner the skeleton of a whale
> with small creatures, worms and crabs living on the bones; in the upper sky a
> total eclipse of the sun, a black disc ringed by a white-gold corona with
> streamers, drawn small, no wider than a hand's breadth of the frame; the band
> of the Milky Way arching across the whole width of the sky in dense fine stars
> and gold dust; on a dark hill a few small robed figures looking up, one
> holding a red lantern; and at the far edge a town below the hill with its
> windows lit yellow and the sky over it washed pale and starless. Between
> everything, fine ink hatching, scattered stars joined by hairline gold rules,
> and clouds in the medieval scallop convention.
> Palette: deep near-black indigo ground, tarnished gold leaf, midnight violet,
> a cold blue-green for the burning sea, oxblood red for the lantern, small
> accents of verdigris. Candlelit and muted, gold worn, vellum stained and
> foxed. Flat medieval perspective, everything equally detailed and in focus
> across the whole frame, no vignetting, no photographic depth of field. No
> text, no letters, no numerals, no words, no signature, no border frame around
> the outside edge.

**Landscape 3:2.** Same cut as Plate IV. Choose on: the eclipse clear of the
horizontal centre and of both vertical thirds, and the wave along the bottom
edge rather than across the middle. The Milky Way spanning the width is right —
it is meant to be cut, so every upper piece carries some of it. No painted
frame.

---

## Plate VI · The Elements — 1:1 square

> A medieval illuminated alchemist's plate on dark aged vellum, in the manner of
> an alchemical treatise catalogued by a monastic illuminator. The entire square
> is packed edge to edge with the apparatus and stuff of an alchemist's bench,
> at deliberately uneven sizes and irregular placement, overlapping and
> interlocking with no gaps and no grid: an open hand holding a bright bead of
> quicksilver, a round flask of dark red liquid giving off orange fumes, a flask
> of black crystals with violet vapour rising from it, a rough green stone of
> malachite cut to show its concentric bands, a six-armed silver crystal like a
> frost star, a many-rayed silver star on a button of metal, a cut diamond, and
> a red flower, with between them retorts, crucibles, a small furnace with a
> flame, bellows, a mortar and pestle, scales, glass bottles, scattered crystals
> and coals, so that no bare ground shows. Nothing large in the exact centre of
> the square — the centre holds only small bottles and coals. Each object
> outlined in fine ink with a thin gold rule.
> Palette: deep near-black ground, tarnished gold leaf, oxblood red, violet,
> malachite green, cold silver greys for the metals, amber flame. Candlelit and
> muted, gold worn, vellum stained and foxed. Flat medieval perspective,
> everything equally detailed and in focus across the whole frame, no
> vignetting, no depth of field. No text, no letters, no numerals, no words, no
> signature, no border frame around the outside edge.

**Square 1:1.** Choose on: the same test as Patterns — objects *not* falling one
per cell into a 3 × 3 arrangement, so each piece shows parts of several things.
The centre cell is one of nine, not the payoff, so nothing important in it.
Alchemical plates in particular love to draw themselves a frame, and a frame
lands inside the outer cells once cut; reject any candidate that has one.


## What shipped, and why

- **The Cosmos** — the candidate with no painted border and no dominant centred
  object: a Milky Way band running corner to corner, planets and constellations
  spread to every edge. Generated 3:2, so it is centre-cropped to 683×512 to
  match the 4:3 grid rather than being stretched to fit it. The rejected three
  all carried a painted frame, which lands *inside* the outer cells once cut and
  reads as an arbitrary line through the picture.
- **Our Place In It** — chosen over a version with a tidier centred globe,
  because a globe that fits the middle cell exactly makes that one cell the whole
  payoff and the other eight decoration. This one's globe spans the centre cuts,
  so the surrounding pieces carry parts of it, and every edge cell has mountains,
  waves, a ship, a sun or a moon of its own.
- **Patterns in Nature** — the only candidate with no frame at all, the widest
  colour range, and specimens at genuinely uneven sizes rather than in a grid.
  That last part matters: had the specimens landed one per cell, each piece would
  be a complete object and the mosaic would never resolve into anything.
- **Small Company** — every candidate came back square, so all three of the
  later plates are cut from squares. This one is the dark, evenly spread litter:
  snail, caterpillar, morpho and poppies each inside a cell, with the horizontal
  cut running through leaves and woodlice, which is what the prompt asked for.
  Cut to 3:2 with the window sat a little below centre so the butterfly keeps
  its top and the lower poppy keeps most of its petals; a hair trimmed off every
  side to lose the vellum edge. The runner-up had a thin gold frame, a large
  round leaf dead centre, and its grub below the crop.
- **The Rare Hour** — the frameless one with the Milky Way arching over a town
  with its windows lit, which is the chapter's last line as a picture, and the
  eclipse sitting inside the right-hand column. Cut to 3:2 with the window high
  enough to keep the eclipse whole, at the cost of the beach along the bottom.
  It carries a faint vertical crease down the middle column, which reads as
  vellum. Rejected: one with two suns and a painted frame, and the best-drawn
  candidate of the lot, which sat inside an ornate border that no crop could
  remove without losing the eclipse.
- **The Elements** — the alchemist's bench with the hand, the violet vapour and
  the silver stars, all at uneven sizes and nothing important in the centre
  cell. It came with a cream vellum border around a dark field, so it is cropped
  to the field: the crop finds the edge by walking outward from the centre
  until the columns turn light, which ignores the black beyond the torn edge.
  The alternative was a uniform grid of jars with one large flask dead centre,
  safe to cut and dull to uncover.
