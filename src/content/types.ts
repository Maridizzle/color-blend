import type { ImageData8 } from '../color/image';
import type { Oklab } from '../color/oklab';
import type { Difficulty } from '../puzzle/difficulty';
import type { LatticeKind } from '../puzzle/lattice';
import type { ShapeName } from '../puzzle/shapes';

/** Where an artwork's pixels come from. */
export type ArtworkSource =
  /** Drawn by code at load time -- the sampler content. */
  | { kind: 'drawn'; draw: (ctx: CanvasRenderingContext2D, size: number) => void }
  /** Bytes from a content pack, decoded in the browser. */
  | { kind: 'bytes'; bytes: Uint8Array; mime: string }
  /** A file shipped alongside the build, from a pack baked by the CLI. */
  | { kind: 'url'; url: string };

export interface Attribution {
  source?: string;
  creator?: string;
  license?: string;
}

export interface Subject {
  id: string;
  title: string;
  /** Shown under the title on the reveal. */
  blurb?: string;
  /** Educational payload. Each fact is attached to one tile on the board. */
  facts: string[];
  attribution?: Attribution;
  artwork: ArtworkSource;
  /** Overrides for the generated puzzle; otherwise derived from the subject id. */
  difficulty?: Difficulty;
  latticeKind?: LatticeKind;
  shape?: ShapeName;
  /**
   * The colour this board comes out. Assigned across the whole category by
   * `src/content/hues.ts` so that no two boards repeat, rather than each
   * subject taking its artwork's dominant hue and most of them colliding.
   */
  hue?: number;
  /**
   * Gradient anchors, when they were already computed during pack ingest.
   * Present means the shipped puzzle is built from exactly the palette that was
   * validated, and that play does not repeat the clustering work.
   */
  anchors?: readonly Oklab[];
}

export interface Category {
  id: string;
  title: string;
  blurb?: string;
  subjects: Subject[];
  /** True for categories loaded from a zip at runtime rather than shipped. */
  fromPack?: boolean;
  /**
   * One large plate the whole collection uncovers, a share per puzzle.
   *
   * Optional. Without it the gallery composes the mosaic from the members' own
   * artworks -- which is all a pack loaded from a zip can ever have.
   */
  mosaic?: ArtworkSource;
}

/** One puzzle's share of the Archivist's tale. */
export interface TaleEntry {
  subjectId: string;
  /** Two or three sentences on the reveal panel, standing alone. */
  blurb: string;
  /** The chapter's own passage, unlocked in the gallery. Paragraphs. */
  passage: string[];
}

/**
 * A collection's section of the tale. Fiction, kept apart from the facts each
 * subject carries and shown in a different register.
 */
export interface CollectionTale {
  categoryId: string;
  /** Unlocked on arrival. Paragraphs. */
  opening: string[];
  /** One per subject, matched by id. */
  entries: TaleEntry[];
  /** Unlocked when the collection is complete. Paragraphs. */
  closing?: string[];
}

/** A decoded artwork: a drawable for the reveal, and pixels for analysis. */
export interface Artwork {
  canvas: HTMLCanvasElement;
  pixels: ImageData8;
  width: number;
  height: number;
}
