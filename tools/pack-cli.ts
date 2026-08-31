/**
 * Build-time pack ingest.
 *
 *   npm run pack -- path/to/pack.zip [--out public/packs] [--check]
 *
 * Runs the exact same ingest the in-game loader runs, so a pack that passes
 * here plays there. The point is the report: packs arrive blind, and this is
 * where anyone finds out that six of the forty images cannot make a puzzle
 * before those six ship to players.
 *
 * `--check` validates and reports without writing anything.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import type { ImageData8 } from '../src/color/image';
import { formatReport, ingestPack, type IngestedSubject } from '../src/content/ingest';
import { ARTWORK_SIZE } from '../src/content/artwork';

/**
 * Decode to the same centered square the browser produces, so the palette
 * measured at build time is the palette the player actually sees.
 */
async function decode(bytes: Uint8Array, _mime: string): Promise<ImageData8> {
  const image = sharp(Buffer.from(bytes), { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const side = Math.min(meta.width ?? 0, meta.height ?? 0);
  if (side <= 0) throw new Error('image has no dimensions');

  const { data, info } = await image
    .extract({
      left: Math.floor(((meta.width ?? 0) - side) / 2),
      top: Math.floor(((meta.height ?? 0) - side) / 2),
      width: side,
      height: side,
    })
    .resize(ARTWORK_SIZE, ARTWORK_SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  };
}

function parseArgs(argv: string[]) {
  const files: string[] = [];
  let out = 'public/packs';
  let check = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--out') out = (argv[++i] as string) ?? out;
    else if (arg === '--check') check = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`);
    else files.push(arg);
  }
  return { files, out, check };
}

async function main(): Promise<number> {
  const { files, out, check } = parseArgs(process.argv.slice(2));

  if (files.length === 0) {
    console.error('usage: npm run pack -- <pack.zip> [more.zip ...] [--out DIR] [--check]');
    return 1;
  }

  let anyRejected = false;
  const index: { id: string; title: string; file: string; subjects: number }[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file));
    const { category, report } = await ingestPack(bytes, {
      packName: basename(file),
      decode,
    });

    console.log(formatReport(report));
    console.log('');
    if (report.rejected > 0) anyRejected = true;

    if (!category) {
      console.error(`Nothing playable in ${file}.`);
      continue;
    }
    if (check) continue;

    // Bake: metadata and precomputed anchors as JSON, images copied alongside.
    const packDir = join(out, category.id);
    await rm(packDir, { recursive: true, force: true });
    await mkdir(packDir, { recursive: true });

    const subjects = [];
    for (const subject of category.subjects as IngestedSubject[]) {
      if (subject.artwork.kind !== 'bytes') continue;
      const imageName = `${subject.id}${extensionFor(subject.artwork.mime)}`;
      await writeFile(join(packDir, imageName), subject.artwork.bytes);

      subjects.push({
        id: subject.id,
        title: subject.title,
        blurb: subject.blurb,
        facts: subject.facts,
        attribution: subject.attribution,
        difficulty: subject.difficulty,
        latticeKind: subject.latticeKind,
        shape: subject.shape,
        image: imageName,
        // Carrying the anchors means play does not redo the clustering, and
        // means the shipped puzzle is byte-for-byte the one that was validated.
        anchors: subject.palette.anchors,
      });
    }

    await writeFile(
      join(packDir, 'pack.json'),
      `${JSON.stringify({ id: category.id, title: category.title, blurb: category.blurb, subjects }, null, 2)}\n`,
    );
    index.push({
      id: category.id,
      title: category.title,
      file: `${category.id}/pack.json`,
      subjects: subjects.length,
    });
    console.log(`Wrote ${subjects.length} puzzle(s) to ${packDir}`);
  }

  if (!check && index.length > 0) {
    await writeFile(join(out, 'index.json'), `${JSON.stringify({ packs: index }, null, 2)}\n`);
    console.log(`Wrote ${join(out, 'index.json')}`);
  }

  // Non-zero on any rejection so a CI step can refuse to ship a broken pack.
  return anyRejected ? 2 : 0;
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/avif': '.avif',
  };
  return map[mime] ?? '.bin';
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
