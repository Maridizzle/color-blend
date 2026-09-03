# The collection plates

Each archive's gallery uncovers one large image, a share per puzzle solved. These
are the generation prompts for the three shipped archives, written for **Flux**.

Drop the chosen file at `public/artwork/plates/<id>.jpg` and add `mosaic` to that
category in `src/content/sampler/index.ts`:

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
