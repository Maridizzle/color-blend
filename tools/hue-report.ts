/**
 * Prints the hues assignDistinctHues gives a set of artworks.
 *
 * The shipped content records its hues rather than recomputing them at play
 * time, so this is how a new archive's values are worked out before they are
 * pasted into the sampler: the same routine ingest runs for a loaded pack, on
 * the same palettes.
 *
 *   npx tsx tools/hue-report.ts <id> <artwork-name>...
 */
import sharp from 'sharp';
import { assignDistinctHues, type HueCandidate } from '../src/content/hues';
import { extractPalette } from '../src/color/palette';
import { oklabToOklch } from '../src/color/oklab';

async function main(): Promise<void> {
  const [id, ...names] = process.argv.slice(2);
  if (!id || names.length === 0) {
    console.error('usage: npx tsx tools/hue-report.ts <id> <artwork-name>...');
    process.exit(1);
  }

  const claims: HueCandidate[][] = [];
  for (const name of names) {
    const { data, info } = await sharp(`public/artwork/${name}.jpg`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const palette = extractPalette({
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    });
    claims.push(
      (palette.anchors ?? []).map((anchor) => {
        const { h, C } = oklabToOklch(anchor);
        return { hue: h, chroma: C };
      }),
    );
  }

  const hues = assignDistinctHues(claims);
  console.log(id);
  names.forEach((name, i) => console.log(`  hue: ${String(Math.round(hues[i]!)).padStart(3)},  // ${name}`));
}

void main();
