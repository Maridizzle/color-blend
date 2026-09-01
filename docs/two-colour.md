# Two colours: the research, and what it changed

Two-tone boards shipped twice and were rejected twice as too hard to play. The
third attempt was preceded by research into colour theory *and* into how games
in this genre actually build their puzzles, and the second half turned out to
matter more than the first.

## What the first two attempts got wrong

Both put two hues on the **same axis as the lightness**. A board ran indigo at
the dark end to gold at the light end, and the player had to reconcile two cues
into one ordering. The two hardest judgements on the board — which indigo is the
last indigo, which gold is the first gold — landed side by side, exactly where
the hue cue says least.

The fixes attempted were a smooth hue sweep, then a hue step with the chroma
faded to a tint at the seam. Both made the boundary *look* right. Neither made
it easier, because both answered the question rather than removing it.

## Four findings

**1. The genre gives hue its own axis.** I Love Hue is a 2D grid: its later
levels lock only the four corner tiles and have the player interpolate the plane
between them, so colour varies across both axes. This project had removed
exactly that structure early on, reasoning that "nobody infers a 2D arrangement
from a dozen swatches" — true about tile count, and it threw away the genre's
answer to how a second hue fits in. Blendoku's rule is a relative of the same
idea: each tile must share part of its composition with its neighbours, which is
a local constraint rather than one global sort.

**2. A hue-ordering task holds lightness and chroma fixed.** The
Farnsworth–Munsell 100 hue test — the clinical version of this exact puzzle —
uses caps at constant Munsell Value 5 and Chroma 5, varying only hue. It also
sets the difficulty scale: its caps sit about 4.2° apart, and observers with
normal colour vision score 0–128 errors on it, **not zero**. Fine hue ordering is
genuinely hard, so a game's steps have to be several times that spacing.

**3. Lightness is uniformly discriminable around the wheel; hue is not.**
Lightness tolerance shows no significant correlation with hue angle, while hue
and chroma tolerances depend strongly on it. Hue discrimination is sharpest near
yellow-orange and dullest near blue-indigo.

**4. Oklab does not model the Helmholtz–Kohlrausch effect.** Saturated colours
look lighter than they measure, by an amount that peaks near blue and vanishes
near yellow. Taken with (3), the blue↔gold ramp that shipped twice was doubly
the worst available pairing: the dark end got close to the maximum
perceived-lightness boost and the light end almost none, so the board's apparent
order was not its actual order. It also explains why **one** colour works so
well — a constant hue at constant chroma shifts every tile by the same amount,
and a constant offset cannot change an ordering.

## The design

A two-colour board is a **separable plane**: lightness down one axis at constant
hue, hue across the other at constant lightness and chroma. See
`buildPlaneField` in `src/puzzle/field.ts` and `planHuePlane` in
`src/color/tones.ts`.

Every cell has one home, read off two independent readings, so "which indigo is
last" stops being a question. The Helmholtz–Kohlrausch distortion becomes
harmless rather than compensated for: hue is constant down a column, so the
boost is a constant offset that cannot reorder anything, and across a row the
task is to order hues, where a lightness shift is not what is being judged. The
one comparison it would corrupt — diagonal, changing both at once — is one the
grid never asks for. A row is then exactly the Farnsworth–Munsell construction.

What it costs, and what follows:

- **Rectangular grids only.** A leaf or a ring has no rows to read, so the hard
  tier lost its silhouettes. Easy and medium keep theirs.
- **Four locked corners**, which run opposite to the rule that harder means
  fewer starters. On a plane four corners are not a generous hint, they are the
  definition of one: they fix the ends of both axes.
- **Four hue columns, eight lightness rows.** Columns decide how much arc the
  board spans, and at five the arc ran to 175° — near-complementary, and the
  solved board went gold, rose, violet, blue, which is four colours by anyone's
  count. Four columns spans 70–140°, a journey between two.
- **A brief look at the solved board before it scrambles** (`preview` in
  `src/game/session.ts`). Lifted from I Love Hue, which does it every level. A
  one-colour board's target can be inferred from the rule alone; a plane's
  cannot, so this turns the puzzle into putting back what you just saw.

## Three things the implementation corrected

Worth recording, because all three were assumptions that held right up until
they were measured.

**"Space hue by ΔE rather than by degrees" is a distinction without a
difference.** At constant lightness and chroma the Oklab hue circle is an actual
circle, so the distance between two hues is the chord `2·C·sin(Δh/2)` — a
function of the step alone, not of where on the wheel it sits. Measured
identical (0.04515 for a 20° step) at six points around the wheel. The real
levers are the *width* of the arc, and widening it where human discrimination is
worse — the board's hue stays put, because it is assigned per category to keep
boards distinct and moving it would undo that.

**Chroma was not flat, and flatness is the point.** `fitToGamut` clips each cell
separately by lightness and hue, which is precisely the Helmholtz–Kohlrausch
wobble the design exists to avoid. Arc and chroma are now chosen *together*:
scan candidate arcs, take the largest chroma the whole grid can hold, keep the
narrowest arc that reaches the target step. The plane's lightness range also
narrowed to 0.44–0.78, trading range the lightness axis has spare for chroma the
hue axis needs — at the full 0.30–0.84 the gamut pinches at both ends and leaves
about 0.05 chroma, too little for the hue axis to clear the legibility floor.

**Half the boards had their axes swapped.** Four of the eight symmetries
transpose, which gave eight hue columns instead of four — the whole arc spent
again, and the board back to a rainbow. Hue is now pinned to the axis with fewer
positions; flips and rotation still vary freely, only the roles are fixed.

## Where it landed

All twelve two-colour boards: a true grid of 4 hues × 8 lightnesses with every
pair appearing exactly once, one chroma across the whole plane, and both axes at
0.048–0.061 ΔE a step against a legibility floor of 0.04 — roughly seven times
the Farnsworth–Munsell cap spacing. Tolerance sits at 0.022, below both, so
neither axis is decorative.

`DIFFICULTY_TUNING.toneCount.hard` back to `1` reverts the whole thing and
restores the hard tier's silhouettes.

## Sources

Game construction:

- [I Love Hue — corner-anchored 2D grids](https://malvasiabianca.org/archives/2020/03/i-love-hue/)
- [I Love Hue — fixed tiles and the mechanic](https://minireview.io/puzzle/i-love-hue)
- [Blendoku — the shared-composition rule](https://www.gamezebo.com/reviews/blendoku-2-review-a-perfect-hue/)

Colour science:

- [Farnsworth–Munsell 100 hue test — constant value and chroma](https://www.sciencedirect.com/topics/medicine-and-dentistry/farnsworth-munsell-100-hue-test)
- [FM-100 norms for normal observers](https://pubmed.ncbi.nlm.nih.gov/12446376/)
- [Melgosa et al., sensitivity in chroma, hue and lightness](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.5080200404)
- [Hue discrimination in normal colour vision](https://www.researchgate.net/publication/231076330_Hue-discrimination_in_normal_colour-vision)
- [The Helmholtz–Kohlrausch effect on display-based colours](https://onlinelibrary.wiley.com/doi/10.1002/col.22839)
- [Nayatani, simple estimation methods for the H–K effect](https://onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1520-6378(199712)22:6%3C385::AID-COL6%3E3.0.CO;2-R)
- [Fairchild, image colour-appearance through extension of CIELAB](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.5080180308)

The **exact coefficients** of the Fairchild–Pirrotta and Nayatani H–K models
could not be retrieved from this environment. Nothing here depends on them: the
design avoids the effect structurally rather than correcting for it. Anyone
adding a correction should fit the constant against the papers rather than
trusting a remembered number.
