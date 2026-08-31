import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import type { ImageData8 } from '../src/color/image';
import { readZip, sanitizeEntryName } from '../src/content/zip';
import { PACK_SCHEMA_VERSION, parseManifest, slugify, titleFromFilename } from '../src/content/pack';
import { ingestPack } from '../src/content/ingest';
import { bandedImage, blankImage } from './helpers';

/** Encode a synthetic image as a real PNG, so the decoder is genuinely exercised. */
async function png(image: ImageData8): Promise<Uint8Array> {
  const buffer = await sharp(Buffer.from(image.data.buffer.slice(0)), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

const decode = async (bytes: Uint8Array): Promise<ImageData8> => {
  const { data, info } = await sharp(Buffer.from(bytes))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
};

const VIVID: [number, number, number][] = [
  [16, 24, 62],
  [38, 116, 152],
  [206, 122, 68],
  [242, 230, 196],
];
const FLAT: [number, number, number][] = [
  [128, 128, 128],
  [131, 130, 130],
];

describe('zip safety', () => {
  it('rejects path traversal and absolute paths', () => {
    expect(sanitizeEntryName('../../etc/passwd')).toBeNull();
    expect(sanitizeEntryName('images/../../secret.png')).toBeNull();
    expect(sanitizeEntryName('/etc/passwd')).toBeNull();
    expect(sanitizeEntryName('C:\\windows\\system32')).toBeNull();
    expect(sanitizeEntryName('..')).toBeNull();
  });

  it('normalizes safe paths', () => {
    expect(sanitizeEntryName('images/reef.jpg')).toBe('images/reef.jpg');
    expect(sanitizeEntryName('./images//reef.jpg')).toBe('images/reef.jpg');
    expect(sanitizeEntryName('images\\reef.jpg')).toBe('images/reef.jpg');
  });

  it('keeps images and pack.json, drops everything else', async () => {
    const image = await png(bandedImage(VIVID, 96));
    const zip = zipSync({
      'images/a.png': image,
      'pack.json': new TextEncoder().encode('{}'),
      'notes.txt': new TextEncoder().encode('hello'),
      'evil.sh': new TextEncoder().encode('rm -rf /'),
      '__MACOSX/images/._a.png': new Uint8Array([1, 2, 3]),
      '.DS_Store': new Uint8Array([1]),
    });

    const { entries, rejected } = readZip(zip);
    const names = entries.map((e) => e.name);
    expect(names).toContain('images/a.png');
    expect(names).toContain('pack.json');
    expect(names).not.toContain('notes.txt');
    expect(names).not.toContain('evil.sh');
    // Archiver noise is dropped silently; a real file being refused is reported.
    expect(rejected.map((r) => r.name)).toContain('evil.sh');
    expect(rejected.map((r) => r.name)).not.toContain('.DS_Store');
  });
});

describe('manifest parsing', () => {
  it('reads a well-formed manifest', () => {
    const { manifest, warnings } = parseManifest(
      JSON.stringify({
        schemaVersion: PACK_SCHEMA_VERSION,
        category: { id: 'biomes', title: 'Biomes' },
        subjects: [
          { image: 'a.png', title: 'Kelp Forest', facts: ['Kelp grows fast.'], shape: 'circle' },
        ],
      }),
    );
    expect(warnings).toEqual([]);
    expect(manifest?.category?.id).toBe('biomes');
    expect(manifest?.subjects?.[0]?.title).toBe('Kelp Forest');
    expect(manifest?.subjects?.[0]?.shape).toBe('circle');
  });

  it('degrades to no manifest on malformed JSON rather than failing the pack', () => {
    const { manifest, warnings } = parseManifest('{not json');
    expect(manifest).toBeNull();
    expect(warnings[0]).toMatch(/not valid JSON/);
  });

  it('warns about a newer schema but still reads what it can', () => {
    const { manifest, warnings } = parseManifest(
      JSON.stringify({ schemaVersion: 99, subjects: [{ image: 'a.png', title: 'A' }] }),
    );
    expect(warnings[0]).toMatch(/schema version 99/);
    expect(manifest?.subjects?.[0]?.title).toBe('A');
  });

  it('drops unknown enum values instead of trusting them', () => {
    const { manifest } = parseManifest(
      JSON.stringify({
        subjects: [{ image: 'a.png', difficulty: 'impossible', shape: 'dodecahedron' }],
      }),
    );
    expect(manifest?.subjects?.[0]?.difficulty).toBeUndefined();
    expect(manifest?.subjects?.[0]?.shape).toBeUndefined();
  });

  it('skips subjects with no image and says so', () => {
    const { manifest, warnings } = parseManifest(
      JSON.stringify({ subjects: [{ title: 'No image' }, { image: 'b.png' }] }),
    );
    expect(manifest?.subjects?.length).toBe(1);
    expect(warnings[0]).toMatch(/no "image"/);
  });
});

describe('filename fallbacks', () => {
  it('turns filenames into titles', () => {
    expect(titleFromFilename('images/coral-reef.jpg')).toBe('Coral Reef');
    expect(titleFromFilename('deep_sea_01.png')).toBe('Deep Sea 01');
    expect(titleFromFilename('kelpForest.webp')).toBe('Kelp Forest');
  });

  it('slugifies to safe ids', () => {
    expect(slugify('The World’s Biomes!')).toBe('the-world-s-biomes');
    expect(slugify('Café Noir')).toBe('cafe-noir');
    expect(slugify('///')).toBe('untitled');
  });
});

describe('ingesting a pack', () => {
  it('plays a bare folder of images with no manifest at all', async () => {
    const zip = zipSync({
      'coral-reef.png': await png(bandedImage(VIVID, 96)),
      'kelp_forest.png': await png(bandedImage([VIVID[3]!, VIVID[0]!, VIVID[1]!], 96)),
    });

    const { category, report } = await ingestPack(zip, { packName: 'ocean-life.zip', decode });

    expect(report.hadManifest).toBe(false);
    expect(report.accepted).toBe(2);
    expect(category?.id).toBe('ocean-life');
    expect(category?.title).toBe('Ocean Life');
    expect(category?.subjects.map((s) => s.title)).toEqual(['Coral Reef', 'Kelp Forest']);
    // No facts is a note, not a failure.
    expect(category?.subjects[0]?.facts).toEqual([]);
    expect(report.subjects[0]?.notes).toContain('no facts; puzzle will have no fact tiles');
  });

  it('uses the manifest when there is one', async () => {
    const zip = zipSync({
      'pack.json': new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          category: { id: 'biomes', title: 'The Biomes' },
          subjects: [
            {
              image: 'images/a.png',
              id: 'kelp-forest',
              title: 'Kelp Forest',
              facts: ['Giant kelp can grow 60 cm in a day.'],
              difficulty: 'hard',
            },
          ],
        }),
      ),
      'images/a.png': await png(bandedImage(VIVID, 96)),
    });

    const { category, report } = await ingestPack(zip, { packName: 'whatever.zip', decode });

    expect(report.hadManifest).toBe(true);
    expect(category?.id).toBe('biomes');
    expect(category?.title).toBe('The Biomes');
    expect(category?.subjects[0]?.id).toBe('kelp-forest');
    expect(category?.subjects[0]?.facts).toHaveLength(1);
    expect(category?.subjects[0]?.difficulty).toBe('hard');
  });

  it('includes images the manifest forgot, and says it did', async () => {
    const zip = zipSync({
      'pack.json': new TextEncoder().encode(
        JSON.stringify({ subjects: [{ image: 'a.png', title: 'Listed' }] }),
      ),
      'a.png': await png(bandedImage(VIVID, 96)),
      'b.png': await png(bandedImage([VIVID[0]!, VIVID[2]!, VIVID[3]!], 96)),
    });

    const { category, report } = await ingestPack(zip, { packName: 'p.zip', decode });
    expect(category?.subjects).toHaveLength(2);
    expect(report.warnings.some((w) => /not listed in pack.json/.test(w))).toBe(true);
  });

  it('rejects an unplayable image but keeps the rest of the pack', async () => {
    const zip = zipSync({
      'good.png': await png(bandedImage(VIVID, 96)),
      'flat.png': await png(bandedImage(FLAT, 96)),
      'blank.png': await png(blankImage(96, 96, [90, 90, 90, 255])),
    });

    const { category, report } = await ingestPack(zip, { packName: 'mixed.zip', decode });

    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(2);
    expect(category?.subjects.map((s) => s.title)).toEqual(['Good']);

    // The whole point of the report: the failures are named, with reasons.
    const failed = report.subjects.filter((s) => s.verdict === 'reject');
    expect(failed.map((f) => f.file).sort()).toEqual(['blank.png', 'flat.png']);
    expect(failed.every((f) => f.issues.length > 0)).toBe(true);
  });

  it('returns no category when nothing in the pack is playable', async () => {
    const zip = zipSync({ 'flat.png': await png(bandedImage(FLAT, 96)) });
    const { category, report } = await ingestPack(zip, { packName: 'bad.zip', decode });
    expect(category).toBeNull();
    expect(report.accepted).toBe(0);
  });

  it('gives colliding titles distinct ids', async () => {
    const zip = zipSync({
      'a/reef.png': await png(bandedImage(VIVID, 96)),
      'b/reef.png': await png(bandedImage(VIVID, 96)),
    });
    const { category } = await ingestPack(zip, { packName: 'dupes.zip', decode });
    const ids = category?.subjects.map((s) => s.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the palette forward so play does not recompute it', async () => {
    const zip = zipSync({ 'a.png': await png(bandedImage(VIVID, 96)) });
    const { category } = await ingestPack(zip, { packName: 'p.zip', decode });
    const subject = category?.subjects[0];
    expect(subject?.palette.anchors.length).toBeGreaterThanOrEqual(2);
    expect(subject?.palette.verdict).not.toBe('reject');
  });
});
