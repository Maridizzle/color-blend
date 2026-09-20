import type { Category } from '../content/types';
import type { Progress } from './persistence';

/**
 * Core samples: the one ability in the game, and it is earned, not given.
 *
 * A core is what a geologist drills to read a column of the record in the
 * right order without digging the whole site up. Here it is exactly that: spend
 * one, tap a column, and the column's true order shows for a moment beside the
 * tiles. It is a spatial hint rather than a single swap, and it costs
 * something, which is what the ordinary Hint does not.
 *
 * Earned by placing tiles. Every so many tiles that land correctly bank one
 * core, counted across the whole game and kept between sessions, so a patient
 * player arrives at a hard board with a few in hand. A tile counts once per
 * play of a board: lifting a correct tile and putting it back is not a new
 * placement, and neither is undo followed by redo.
 *
 * Where they can be used is the collection's business. The Record is where the
 * ability belongs -- the reading of strata is its whole subject -- so it is the
 * only place a core can be drilled, until every folio of The Record is solved.
 * After that the ability is the player's and works on every board in the game.
 */

/** Tiles placed correctly per core earned. */
export const PLACEMENTS_PER_CORE = 20;

/** Cores earned and not yet drilled. */
export function coresBanked(progress: Pick<Progress, 'placements' | 'coresSpent'>): number {
  return Math.max(0, Math.floor(progress.placements / PLACEMENTS_PER_CORE) - progress.coresSpent);
}

/** Placements still needed before the next core is banked. */
export function placementsToNextCore(progress: Pick<Progress, 'placements'>): number {
  const into = progress.placements % PLACEMENTS_PER_CORE;
  return into === 0 ? PLACEMENTS_PER_CORE : PLACEMENTS_PER_CORE - into;
}

/**
 * Whether cores can be drilled on this collection's boards.
 *
 * True on any collection that carries the ability itself, and everywhere once
 * every collection that carries it is whole. A game with no such collection
 * has no cores at all: the ability arrives with The Record, not before.
 */
export function coresAllowedIn(
  category: Pick<Category, 'id' | 'twists'>,
  all: readonly Pick<Category, 'id' | 'subjects' | 'twists'>[],
  progress: Pick<Progress, 'solved'>,
): boolean {
  if (category.twists?.cores) return true;
  const carriers = all.filter((c) => c.twists?.cores && c.subjects.length > 0);
  if (carriers.length === 0) return false;
  return carriers.every((c) => c.subjects.every((s) => Boolean(progress.solved[s.id])));
}
