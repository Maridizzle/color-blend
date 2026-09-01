# Research note: what it would take to do two colours correctly

Two-tone and three-tone boards shipped twice and were rejected twice as too hard
to play. The reasoning behind them was sound, so before trying a third time it is
worth being precise about *why* they were hard. There turn out to be two
separate causes, one perceptual and one structural, and only the second was
visible from the code.

## 1. Oklab does not model the Helmholtz–Kohlrausch effect

The whole engine assumes Oklab's `L` is perceived lightness. It is not, quite.

The **Helmholtz–Kohlrausch effect** is that a colour looks *brighter* as it gets
more saturated, even when its measured luminance is unchanged. Comparing a
chromatic patch against a neutral one of equal luminance, the chromatic one
reads as lighter. Oklab — like CIELAB, and like every space this project uses —
does not account for it.

Two properties of the effect matter here:

- **It depends on hue.** Practical models express the correction as a sine
  function anchored at yellow: something of the form `|sin((h − 90°) / 2)|`,
  which is **zero around yellow (90°) and maximal around blue (270°)**. Yellows
  get almost no boost; blues and violets get the most.
- **It depends on lightness**, shrinking as the colour gets lighter.

### Why that is exactly the wrong thing for a blue-to-gold board

The two-tone boards ran indigo (~279°) at the dark end to gold (~69°) at the
light end. On the H-K curve those two sit at opposite extremes: the indigo end
gets close to the maximum perceived-lightness boost from its chroma, and the
gold end gets close to none.

So the board's *apparent* lightness order was not its actual lightness order.
The dark end was pushed up, compressing exactly the region a player has to
discriminate. Sorting felt wrong because, perceptually, it **was** wrong — the
tiles were correctly ordered in a space that does not describe what the eye
does.

The second attempt made this worse without meaning to. Fading chroma to a tint
at the family seam and back to full inside each block varied chroma by about
three times across the ramp — and since the H-K boost scales with chroma, that
fade was also an invisible, non-monotonic wobble in perceived lightness laid on
top of a ramp whose whole premise is that lightness rises monotonically.

**This also explains why one colour works so well.** With a single hue and a
near-constant chroma, the H-K boost is roughly the same for every tile on the
board. A constant offset does not change an ordering. The one-colour board is
not merely simpler — its lightness ordering is actually *true*.

## 2. A family boundary puts the two hardest decisions side by side

Independent of any colour science. Splitting a ramp into two blocks means the
ordering inside each block still has to be worked out, and the two most
difficult judgements on the board — which indigo is the last indigo, which gold
is the first gold — end up adjacent, at the point where the hue cue says least.
Extra families make the *ends* unmistakable while making the *middle* worse, and
the middle is where the work is.

## What a correct two-colour mode would do

Three rules, in order of importance:

1. **Hold chroma constant along the entire ramp.** Any variation in chroma is a
   variation in perceived lightness in disguise. This rules out the seam fade
   and the end falloff; the gamut fit has to be handled by choosing a lightness
   window and hue pair that fit, not by tapering chroma.

2. **Choose hue pairs with matching H-K weight.** Because the correction is
   `|sin((h − 90°)/2)|`, two hues placed symmetrically about the yellow–blue
   axis carry the *same* boost — `h` and `180° − h`. Orange at 30° and green at
   150° both sit at 0.5. Such a pair shifts perceived lightness by the same
   amount at both ends, so the offset cancels out of the ordering exactly as it
   does for a single hue. Yellow-and-blue, at 90° and 270°, is the worst
   available pair and is precisely what the shipped boards used.

3. **If a pair cannot be balanced, compensate the lightness instead.** Subtract
   the estimated H-K contribution from each stop's `L` so that *perceived*
   lightness, not Oklab lightness, is what rises monotonically along the ramp.
   This is the general fix and the more invasive one, since it means the sort
   axis stops being a straight line in Oklab.

And one rule from the structural half:

4. **Put the family boundary where the lightness step is largest, not
   smallest.** The current design does the opposite — it hides the seam at the
   chroma minimum, which is also where the two families are most confusable.

## Status

Not implemented. `DIFFICULTY_TUNING.toneCount` is 1 everywhere, and the
multi-family machinery in `src/color/tones.ts` is intact and still tested, so
raising it is one constant — but doing so without the rules above reproduces a
board that has already been rejected twice.

## Caveats on the sourcing

The qualitative findings here — that Oklab omits the effect, that chroma adds to
perceived lightness, that the correction is a hue-dependent sine anchored at
yellow, and that the effect diminishes with lightness — are well established and
consistent across the sources below. The **exact coefficients** of the
Fairchild–Pirrotta and Nayatani models could not be retrieved from this
environment, so rule 3 above specifies the shape of the compensation but not its
magnitude. Anyone implementing it should fit the constant against the original
papers, or against direct comparison on a display, rather than trusting a
remembered number.

Sources:

- [Helmholtz–Kohlrausch effect (Wikipedia)](https://en.wikipedia.org/wiki/Helmholtz%E2%80%93Kohlrausch_effect)
- [Nayatani, *Simple estimation methods for the Helmholtz–Kohlrausch effect*, Color Research & Application 22(6), 1997](https://onlinelibrary.wiley.com/doi/abs/10.1002/(SICI)1520-6378(199712)22:6%3C385::AID-COL6%3E3.0.CO;2-R)
- [Fairchild, *Image color-appearance specification through extension of CIELAB*, Color Research & Application 18(3), 1993](https://onlinelibrary.wiley.com/doi/abs/10.1002/col.5080180308)
- [High et al., *The Helmholtz-Kohlrausch effect on display-based light colors and simulated substrate colors*, Color Research & Application, 2023](https://onlinelibrary.wiley.com/doi/10.1002/col.22839)
- [Seong et al., *The CIECAM16-Based Lightness Model Incorporating the Helmholtz–Kohlrausch Effect*, Color Research & Application, 2025](https://onlinelibrary.wiley.com/doi/full/10.1002/col.22984)
- [*Determining the color appearance of Helmholtz-Kohlrausch effect for self-emissive displays*, Journal of Information Display, 2022](https://www.tandfonline.com/doi/full/10.1080/15980316.2022.2077849)
- [Pierre, *Color saturation control for the 21st century*](https://eng.aurelienpierre.com/2022/02/color-saturation-control-for-the-21th-century/)
