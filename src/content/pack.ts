import type { Difficulty } from '../puzzle/difficulty';
import type { LatticeKind } from '../puzzle/lattice';
import { SHAPE_NAMES, type ShapeName } from '../puzzle/shapes';
import type { Attribution } from './types';

/**
 * The content pack manifest, and what to do without one.
 *
 * `pack.json` is optional on purpose. Packs arrive blind, sometimes as nothing
 * but a folder of images, and a pack that cannot be played until someone writes
 * metadata for it is a pack that never gets played. So everything here has a
 * defensible fallback, and every fallback taken gets reported rather than
 * silently assumed.
 */

export const PACK_SCHEMA_VERSION = 1;

export interface PackSubjectManifest {
  id?: string;
  title?: string;
  blurb?: string;
  /** Path to the image inside the zip. */
  image: string;
  facts?: string[];
  attribution?: Attribution;
  difficulty?: Difficulty;
  latticeKind?: LatticeKind;
  shape?: ShapeName;
}

export interface PackManifest {
  schemaVersion?: number;
  id?: string;
  title?: string;
  blurb?: string;
  category?: { id?: string; title?: string; blurb?: string };
  subjects?: PackSubjectManifest[];
  /** Facts keyed by subject id, as an alternative to inlining them per subject. */
  facts?: Record<string, string[]>;
  attribution?: Attribution;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const LATTICE_KINDS: LatticeKind[] = ['square', 'hex', 'triangle', 'diamond'];

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'untitled'
  );
}

/** "deep-sea_01.jpg" -> "Deep Sea 01". Best effort, and only ever a fallback. */
export function titleFromFilename(path: string): string {
  const base = path.split('/').pop() ?? path;
  const withoutExtension = base.replace(/\.[^.]+$/, '');
  const words = withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Untitled';
  return words
    .map((w) => (w.length <= 2 && /^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const facts = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return facts.length > 0 ? facts : undefined;
}

function asAttribution(value: unknown): Attribution | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const pick = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : undefined);
  const attribution: Attribution = {
    source: pick('source'),
    creator: pick('creator'),
    license: pick('license'),
  };
  return attribution.source || attribution.creator || attribution.license ? attribution : undefined;
}

export interface ManifestParse {
  manifest: PackManifest | null;
  /** Problems worth telling the author about; never fatal on their own. */
  warnings: string[];
}

/**
 * Parse `pack.json` defensively. A manifest that is malformed, or written
 * against a newer schema, degrades to "no manifest" plus a warning rather than
 * failing the whole pack.
 */
export function parseManifest(text: string): ManifestParse {
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { manifest: null, warnings: ['pack.json is not valid JSON; ignoring it.'] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { manifest: null, warnings: ['pack.json is not a JSON object; ignoring it.'] };
  }

  const source = raw as Record<string, unknown>;
  const version = typeof source.schemaVersion === 'number' ? source.schemaVersion : undefined;
  if (version !== undefined && version > PACK_SCHEMA_VERSION) {
    warnings.push(
      `pack.json declares schema version ${version}; this build understands ${PACK_SCHEMA_VERSION}. Reading what it can.`,
    );
  }

  const categoryRaw = (source.category ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  const subjects: PackSubjectManifest[] = [];
  if (Array.isArray(source.subjects)) {
    for (const [index, entry] of source.subjects.entries()) {
      if (!entry || typeof entry !== 'object') {
        warnings.push(`subjects[${index}] is not an object; skipped.`);
        continue;
      }
      const s = entry as Record<string, unknown>;
      const image = str(s.image);
      if (!image) {
        warnings.push(`subjects[${index}] has no "image"; skipped.`);
        continue;
      }
      const difficulty = str(s.difficulty);
      const latticeKind = str(s.latticeKind);
      const shape = str(s.shape);

      subjects.push({
        id: str(s.id),
        title: str(s.title),
        blurb: str(s.blurb),
        image,
        facts: asStringArray(s.facts),
        attribution: asAttribution(s.attribution),
        difficulty: DIFFICULTIES.includes(difficulty as Difficulty)
          ? (difficulty as Difficulty)
          : undefined,
        latticeKind: LATTICE_KINDS.includes(latticeKind as LatticeKind)
          ? (latticeKind as LatticeKind)
          : undefined,
        shape: SHAPE_NAMES.includes(shape as ShapeName) ? (shape as ShapeName) : undefined,
      });
    }
  }

  const factsBySubject: Record<string, string[]> = {};
  if (source.facts && typeof source.facts === 'object' && !Array.isArray(source.facts)) {
    for (const [key, value] of Object.entries(source.facts as Record<string, unknown>)) {
      const facts = asStringArray(value);
      if (facts) factsBySubject[key] = facts;
    }
  }

  return {
    manifest: {
      schemaVersion: version,
      id: str(source.id),
      title: str(source.title),
      blurb: str(source.blurb),
      category: {
        id: str(categoryRaw.id),
        title: str(categoryRaw.title),
        blurb: str(categoryRaw.blurb),
      },
      subjects,
      facts: factsBySubject,
      attribution: asAttribution(source.attribution),
    },
    warnings,
  };
}
