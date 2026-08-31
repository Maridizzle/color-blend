import type { Oklab } from '../color/oklab';
import type { Difficulty } from '../puzzle/difficulty';
import type { LatticeKind } from '../puzzle/lattice';
import type { ShapeName } from '../puzzle/shapes';
import type { Category, Subject } from './types';

/**
 * Packs baked at build time by `npm run pack`.
 *
 * These have already been through ingest -- quality gated, anchors computed --
 * so loading one is just reading metadata; the images stream in as each puzzle
 * is opened. Absence is normal: a build with no baked packs simply has none,
 * and the game falls back to its shipped sampler content.
 */

const PACKS_ROOT = './packs';

interface BakedSubject {
  id: string;
  title: string;
  blurb?: string;
  facts?: string[];
  attribution?: { source?: string; creator?: string; license?: string };
  difficulty?: Difficulty;
  latticeKind?: LatticeKind;
  shape?: ShapeName;
  image: string;
  anchors?: Oklab[];
}

interface BakedPack {
  id: string;
  title: string;
  blurb?: string;
  subjects: BakedSubject[];
}

interface PackIndex {
  packs: { id: string; title: string; file: string; subjects: number }[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function loadBakedPacks(): Promise<Category[]> {
  const index = await fetchJson<PackIndex>(`${PACKS_ROOT}/index.json`);
  if (!index?.packs?.length) return [];

  const categories: Category[] = [];

  for (const entry of index.packs) {
    const pack = await fetchJson<BakedPack>(`${PACKS_ROOT}/${entry.file}`);
    if (!pack?.subjects?.length) continue;

    // Images live next to the pack.json that names them.
    const dir = `${PACKS_ROOT}/${entry.file.replace(/[^/]*$/, '')}`;

    const subjects: Subject[] = pack.subjects.map((s) => ({
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      facts: s.facts ?? [],
      attribution: s.attribution,
      artwork: { kind: 'url', url: `${dir}${s.image}` },
      difficulty: s.difficulty,
      latticeKind: s.latticeKind,
      shape: s.shape,
      anchors: s.anchors && s.anchors.length >= 2 ? s.anchors : undefined,
    }));

    categories.push({
      id: pack.id,
      title: pack.title,
      blurb: pack.blurb,
      subjects,
      fromPack: true,
    });
  }

  return categories;
}
