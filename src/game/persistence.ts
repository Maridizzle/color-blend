/**
 * Local progress and settings.
 *
 * Every read and write is wrapped: localStorage throws outright in private
 * windows and with site data blocked, and a game that white-screens because a
 * browser declined to remember a setting is worse than one that forgets.
 */

const PROGRESS_KEY = 'colorblend:progress:v1';
const SETTINGS_KEY = 'colorblend:settings:v1';

export interface SolvedRecord {
  moves: number;
  at: number;
}

export interface Progress {
  solved: Record<string, SolvedRecord>;
  /** Unlocked fact indices per subject id. */
  facts: Record<string, number[]>;
  /**
   * Tiles ever placed correctly, across every board, counted once per tile per
   * play. Core samples are earned from it -- see `src/game/cores.ts`.
   */
  placements: number;
  /** Core samples drilled so far, so the bank is placements earned less these. */
  coresSpent: number;
}

export type FontSize = 'default' | 'large' | 'larger';

export interface Settings {
  /** null follows the OS's prefers-reduced-motion setting. */
  reducedMotion: boolean | null;
  lightnessAssist: boolean;
  fontSize: FontSize;
  /**
   * Whether the instructions have been shown once already.
   *
   * Lives in settings rather than progress because it is about this device and
   * this person, not about the game's state: clearing your solved puzzles
   * should not put the tutorial back.
   */
  seenHowToPlay: boolean;
}

const DEFAULT_PROGRESS: Progress = { solved: {}, facts: {}, placements: 0, coresSpent: 0 };
const DEFAULT_SETTINGS: Settings = {
  reducedMotion: null,
  lightnessAssist: false,
  fontSize: 'default',
  seenHowToPlay: false,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full; the session still plays, it just forgets.
  }
}

export function loadProgress(): Progress {
  const progress = read(PROGRESS_KEY, DEFAULT_PROGRESS);
  return {
    solved: progress.solved ?? {},
    facts: progress.facts ?? {},
    // Records written before cores existed carry neither count.
    placements: Number.isFinite(progress.placements) ? Math.max(0, progress.placements) : 0,
    coresSpent: Number.isFinite(progress.coresSpent) ? Math.max(0, progress.coresSpent) : 0,
  };
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

/**
 * Forget every solved puzzle and every fact found.
 *
 * Settings are deliberately untouched: clearing what you have collected should
 * not put the tutorial back or undo an accessibility choice. Removing the key
 * rather than writing an empty record means a reset device is indistinguishable
 * from a new one.
 */
export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Storage unavailable; there was nothing persisted to clear.
  }
}

export function loadSettings(): Settings {
  return read(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function recordSolved(subjectId: string, moves: number): Progress {
  const progress = loadProgress();
  const previous = progress.solved[subjectId];
  // Keep the best run rather than the latest, so replaying can only improve it.
  if (!previous || moves < previous.moves) {
    progress.solved[subjectId] = { moves, at: Date.now() };
    saveProgress(progress);
  }
  return progress;
}

export function recordFact(subjectId: string, factIndex: number): Progress {
  const progress = loadProgress();
  const found = new Set(progress.facts[subjectId] ?? []);
  found.add(factIndex);
  progress.facts[subjectId] = [...found].sort((a, b) => a - b);
  saveProgress(progress);
  return progress;
}

/** Add tiles newly placed correctly to the running count cores are earned from. */
export function recordPlacements(count: number): Progress {
  const progress = loadProgress();
  if (count > 0) {
    progress.placements += count;
    saveProgress(progress);
  }
  return progress;
}

/** Note one core sample drilled. */
export function recordCoreSpent(): Progress {
  const progress = loadProgress();
  progress.coresSpent += 1;
  saveProgress(progress);
  return progress;
}

export function prefersReducedMotion(settings: Settings): boolean {
  if (settings.reducedMotion !== null) return settings.reducedMotion;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function applyFontSize(size: FontSize): void {
  const el = document.documentElement;
  el.removeAttribute('data-font-size');
  if (size !== 'default') el.setAttribute('data-font-size', size);
}
