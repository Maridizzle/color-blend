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
}

export interface Settings {
  /** null follows the OS's prefers-reduced-motion setting. */
  reducedMotion: boolean | null;
  lightnessAssist: boolean;
}

const DEFAULT_PROGRESS: Progress = { solved: {}, facts: {} };
const DEFAULT_SETTINGS: Settings = { reducedMotion: null, lightnessAssist: false };

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
  return { solved: progress.solved ?? {}, facts: progress.facts ?? {} };
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
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

export function prefersReducedMotion(settings: Settings): boolean {
  if (settings.reducedMotion !== null) return settings.reducedMotion;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
