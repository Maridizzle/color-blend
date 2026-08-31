import type { ImageData8 } from '../color/image';
import { type Palette, extractPalette } from '../color/palette';
import type { Category, Subject } from './types';
import { parseManifest, slugify, titleFromFilename, type PackSubjectManifest } from './pack';
import { isImageName, mimeFor, readZip } from './zip';

/**
 * Turning a zip into a playable category.
 *
 * One code path serves both the in-game loader and the build-time CLI; the only
 * difference is how bytes become pixels, which is injected. That is what keeps
 * "the pack you tested at build time" and "the pack someone dropped into the
 * game" from quietly diverging.
 *
 * The report is not decoration. Because packs are blind, this report is the
 * only place anyone finds out that three of the forty images were too flat to
 * make a puzzle from.
 */

export type Decoder = (bytes: Uint8Array, mime: string) => Promise<ImageData8>;

export interface SubjectReport {
  subjectId: string;
  title: string;
  file: string;
  verdict: Palette['verdict'];
  issues: string[];
  /** Present when the image was accepted. */
  stats?: {
    anchors: number;
    spread: number;
    lightnessRange: number;
  };
  /** Fallbacks that were taken, e.g. a title guessed from the filename. */
  notes: string[];
}

export interface IngestReport {
  packName: string;
  categoryId: string;
  imagesFound: number;
  accepted: number;
  rejected: number;
  hadManifest: boolean;
  warnings: string[];
  subjects: SubjectReport[];
  skipped: { name: string; reason: string }[];
}

export interface IngestResult {
  category: IngestedCategory | null;
  report: IngestReport;
}

/** Palette anchors, kept alongside each subject so the puzzle need not re-extract. */
export interface IngestedSubject extends Subject {
  palette: Palette;
}

export interface IngestedCategory extends Category {
  subjects: IngestedSubject[];
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

export interface IngestOptions {
  /** Filename of the archive, used to name the category when nothing else does. */
  packName: string;
  decode: Decoder;
}

export async function ingestPack(
  bytes: Uint8Array,
  options: IngestOptions,
): Promise<IngestResult> {
  const { packName, decode } = options;
  const { entries, rejected } = readZip(bytes);

  const manifestEntry = entries.find((e) => e.name.split('/').pop() === 'pack.json');
  const parsed = manifestEntry
    ? parseManifest(new TextDecoder().decode(manifestEntry.bytes))
    : { manifest: null, warnings: [] };
  const manifest = parsed.manifest;
  const warnings = [...parsed.warnings];

  const imageEntries = entries.filter((e) => isImageName(e.name));
  const byName = new Map(imageEntries.map((e) => [e.name, e]));

  const fallbackName = packName.replace(/\.zip$/i, '');
  const categoryId = slugify(
    manifest?.category?.id ?? manifest?.id ?? fallbackName,
  );
  const categoryTitle =
    manifest?.category?.title ?? manifest?.title ?? titleFromFilename(fallbackName);

  // Build the work list: manifest order when there is one, otherwise every
  // image in the archive, so a bare folder of pictures still plays.
  let planned: (PackSubjectManifest & { file: string; notes: string[] })[] = [];

  if (manifest?.subjects && manifest.subjects.length > 0) {
    for (const entry of manifest.subjects) {
      const notes: string[] = [];
      // Manifests are written by hand, so tolerate a leading "./" or a
      // missing "images/" prefix rather than dropping the subject.
      const candidates = [
        entry.image,
        entry.image.replace(/^\.\//, ''),
        `images/${entry.image}`,
      ];
      const file = candidates.find((c) => byName.has(c));
      if (!file) {
        warnings.push(`pack.json refers to "${entry.image}", which is not in the archive.`);
        continue;
      }
      planned.push({ ...entry, file, notes });
    }
    const referenced = new Set(planned.map((p) => p.file));
    const extras = imageEntries.filter((e) => !referenced.has(e.name));
    if (extras.length > 0) {
      warnings.push(
        `${extras.length} image(s) in the archive are not listed in pack.json; including them anyway.`,
      );
      planned.push(
        ...extras.map((e) => ({ image: e.name, file: e.name, notes: ['not listed in pack.json'] })),
      );
    }
  } else {
    if (manifestEntry) warnings.push('pack.json listed no subjects; using every image found.');
    planned = imageEntries.map((e) => ({ image: e.name, file: e.name, notes: [] }));
  }

  const takenIds = new Set<string>();
  const subjects: IngestedSubject[] = [];
  const reports: SubjectReport[] = [];

  for (const item of planned) {
    const entry = byName.get(item.file);
    if (!entry) continue;

    const notes = [...item.notes];
    if (!item.title) notes.push('title guessed from filename');

    const title = item.title ?? titleFromFilename(item.file);
    const id = uniqueId(slugify(item.id ?? title), takenIds);

    // Facts can be inline, or in the manifest's shared map keyed by subject id.
    const facts = item.facts ?? manifest?.facts?.[id] ?? manifest?.facts?.[item.id ?? ''] ?? [];
    if (facts.length === 0) notes.push('no facts; puzzle will have no fact tiles');

    let pixels: ImageData8;
    try {
      pixels = await decode(entry.bytes, mimeFor(entry.name));
    } catch (error) {
      reports.push({
        subjectId: id,
        title,
        file: item.file,
        verdict: 'reject',
        issues: [`could not decode: ${(error as Error).message}`],
        notes,
      });
      continue;
    }

    const palette = extractPalette(pixels);
    const report: SubjectReport = {
      subjectId: id,
      title,
      file: item.file,
      verdict: palette.verdict,
      issues: palette.issues.map((i) => i.message),
      notes,
    };

    if (palette.verdict === 'reject') {
      reports.push(report);
      continue;
    }

    report.stats = {
      anchors: palette.anchors.length,
      spread: palette.spread,
      lightnessRange: palette.lightnessRange,
    };
    reports.push(report);

    subjects.push({
      id,
      title,
      blurb: item.blurb,
      facts,
      attribution: item.attribution ?? manifest?.attribution,
      artwork: { kind: 'bytes', bytes: entry.bytes, mime: mimeFor(entry.name) },
      difficulty: item.difficulty,
      latticeKind: item.latticeKind,
      shape: item.shape,
      anchors: palette.anchors,
      palette,
    });
  }

  const category: IngestedCategory | null =
    subjects.length > 0
      ? {
          id: categoryId,
          title: categoryTitle,
          blurb: manifest?.category?.blurb ?? manifest?.blurb,
          subjects,
          fromPack: true,
        }
      : null;

  return {
    category,
    report: {
      packName,
      categoryId,
      imagesFound: imageEntries.length,
      accepted: subjects.length,
      rejected: reports.length - subjects.length,
      hadManifest: manifest !== null,
      warnings,
      subjects: reports,
      skipped: rejected,
    },
  };
}

/** Human-readable summary, used by both the CLI and the in-game loader. */
export function formatReport(report: IngestReport): string {
  const lines: string[] = [];
  lines.push(`Pack: ${report.packName}`);
  lines.push(`Category: ${report.categoryId}`);
  lines.push(
    `Images: ${report.imagesFound} found, ${report.accepted} playable, ${report.rejected} rejected`,
  );
  lines.push(`Manifest: ${report.hadManifest ? 'pack.json found' : 'none (used fallbacks)'}`);

  for (const warning of report.warnings) lines.push(`  ! ${warning}`);

  for (const subject of report.subjects) {
    const mark = subject.verdict === 'ok' ? 'ok  ' : subject.verdict === 'warn' ? 'warn' : 'FAIL';
    const detail = subject.stats
      ? `spread ${subject.stats.spread.toFixed(2)}, ${subject.stats.anchors} anchors`
      : '';
    lines.push(`  [${mark}] ${subject.title} (${subject.file}) ${detail}`.trimEnd());
    for (const issue of subject.issues) lines.push(`         - ${issue}`);
    for (const note of subject.notes) lines.push(`         . ${note}`);
  }

  for (const skip of report.skipped) lines.push(`  skipped ${skip.name}: ${skip.reason}`);

  return lines.join('\n');
}
