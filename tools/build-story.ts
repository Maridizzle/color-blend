/**
 * Builds src/content/story.ts from docs/story/the-archivist.md.
 *
 * The document is the source; this only turns it into typed data. Nothing here
 * knows how many chapters or collections there are, or what any of them are
 * called -- adding either is a matter of writing prose and re-running this.
 *
 * What it refuses to build:
 *   - a collection id that no shipped category has (a typo, silently shipped,
 *     would be a story nobody can ever reach)
 *   - a scene count that disagrees with the collection's puzzle count
 *   - a scene whose heading names a different picture than the puzzle it lands on
 *   - a scene under ninety words, which reads as an offcut on the reveal panel
 *
 *   npx tsx tools/build-story.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SAMPLER_CATEGORIES } from '../src/content/sampler';

const SOURCE = 'docs/story/the-archivist.md';
const TARGET = 'src/content/story.ts';
/** Below this a scene is a fragment, not a scene. */
const MIN_SCENE_WORDS = 90;

interface Scene {
  title: string;
  paragraphs: string[];
}
interface Collection {
  categoryId: string;
  opening: string[];
  scenes: Scene[];
}
interface Chapter {
  number: number;
  title: string;
  collections: Collection[];
  closing: string[];
}

const lines = readFileSync(SOURCE, 'utf8').split('\n');

/** Consecutive '>' lines from `start` (after any blanks), as paragraphs. */
function quote(start: number): { paragraphs: string[]; next: number } {
  let i = start;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  const raw: string[] = [];
  while (i < lines.length && lines[i]!.startsWith('>')) {
    const line = lines[i]!;
    raw.push(line === '>' ? '' : line.replace(/^>\s?/, ''));
    i++;
  }
  const paragraphs = raw
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return { paragraphs, next: i };
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const chapters: Chapter[] = [];
let chapter: Chapter | null = null;
let collection: Collection | null = null;

for (let i = 0; i < lines.length; ) {
  const line = lines[i]!;

  const head = /^# Chapter ([A-Za-z]+|\d+) · (.+)$/.exec(line);
  if (head) {
    const raw = head[1]!.toLowerCase();
    chapter = {
      number: WORDS[raw] ?? (Number(raw) || chapters.length + 1),
      title: head[2]!.trim(),
      collections: [],
      closing: [],
    };
    chapters.push(chapter);
    collection = null;
    i++;
    continue;
  }

  // Everything below only means something inside a chapter, which keeps the
  // document's own preamble from being read as content.
  if (!chapter) {
    i++;
    continue;
  }

  const coll = /^## Collection · ([a-z0-9-]+)\s*$/.exec(line);
  if (coll) {
    collection = { categoryId: coll[1]!, opening: [], scenes: [] };
    chapter.collections.push(collection);
    i++;
    continue;
  }

  if (/^## Closing\s*$/.test(line)) {
    const q = quote(i + 1);
    // The "End of Chapter" line is presentation, not story.
    chapter.closing = q.paragraphs.filter((p) => !/^\*End of Chapter/i.test(p));
    i = q.next;
    continue;
  }

  if (!collection) {
    i++;
    continue;
  }

  if (/^### Opening\s*$/.test(line)) {
    const q = quote(i + 1);
    collection.opening = q.paragraphs;
    i = q.next;
    continue;
  }

  const sceneHead = /^### \d+ · (.+?)\s*$/.exec(line);
  if (sceneHead) {
    const q = quote(i + 1);
    collection.scenes.push({ title: sceneHead[1]!, paragraphs: q.paragraphs });
    i = q.next;
    continue;
  }

  i++;
}

// ---------------------------------------------------------------- validation

const problems: string[] = [];
const notes: string[] = [];
const seen = new Set<string>();
/**
 * Apostrophes normalised: the document is typed by hand and a straight quote is
 * not a different picture.
 */
const plain = (s: string) => s.replace(/[’‘]/g, "'").trim();

for (const c of chapters) {
  if (c.closing.length === 0) notes.push(`chapter ${c.number} has no closing yet`);
  for (const col of c.collections) {
    if (seen.has(col.categoryId)) problems.push(`'${col.categoryId}' appears twice`);
    seen.add(col.categoryId);

    const category = SAMPLER_CATEGORIES.find((s) => s.id === col.categoryId);
    if (!category) {
      problems.push(`'${col.categoryId}' is not a shipped collection`);
      continue;
    }
    if (col.opening.length === 0) problems.push(`${col.categoryId}: no opening`);
    if (col.scenes.length !== category.subjects.length) {
      problems.push(
        `${col.categoryId}: ${col.scenes.length} scenes for ${category.subjects.length} puzzles`,
      );
    }
    col.scenes.forEach((s, j) => {
      const subject = category.subjects[j];
      if (!subject) return;
      if (plain(s.title) !== plain(subject.title)) {
        problems.push(
          `${col.categoryId}[${j}]: scene says '${s.title}', puzzle is '${subject.title}'`,
        );
      }
      const words = s.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
      if (words < MIN_SCENE_WORDS) {
        problems.push(`${col.categoryId}[${j}] ${s.title}: ${words} words, needs ${MIN_SCENE_WORDS}`);
      }
    });
  }
}
// Not a failure: a collection can ship and be written for later.
for (const category of SAMPLER_CATEGORIES) {
  if (!seen.has(category.id)) notes.push(`'${category.id}' has no scenes written yet`);
}

if (problems.length) {
  console.error('the story does not match the game:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// -------------------------------------------------------------------- output

const q = (s: string) => JSON.stringify(s);
const arr = (items: readonly string[], indent: string) =>
  items.length === 0 ? '[]' : `[\n${items.map((s) => `${indent}  ${q(s)},`).join('\n')}\n${indent}]`;

let out = `// GENERATED by tools/build-story.ts from ${SOURCE}.
// Edit the document, not this file; then run: npx tsx tools/build-story.ts
//
// The Archivist's tale. This is fiction, kept apart from the science facts each
// subject carries and shown in a different register.
import type { Chapter, CollectionTale } from './types';

export const CHAPTERS: Chapter[] = [
`;
for (const c of chapters) {
  out += `  {\n    number: ${c.number},\n    title: ${q(c.title)},\n`;
  out += `    collectionIds: ${arr(
    c.collections.map((col) => col.categoryId),
    '    ',
  )},\n`;
  out += `    closing: ${arr(c.closing, '    ')},\n  },\n`;
}
out += `];

export const TALES: CollectionTale[] = [
`;
for (const c of chapters) {
  for (const col of c.collections) {
    const category = SAMPLER_CATEGORIES.find((s) => s.id === col.categoryId)!;
    out += `  {\n    categoryId: ${q(col.categoryId)},\n    chapterNumber: ${c.number},\n`;
    out += `    opening: ${arr(col.opening, '    ')},\n    entries: [\n`;
    col.scenes.forEach((s, j) => {
      out += `      {\n        subjectId: ${q(category.subjects[j]!.id)},\n        passage: ${arr(
        s.paragraphs,
        '        ',
      )},\n      },\n`;
    });
    out += `    ],\n  },\n`;
  }
}
out += `];

export function taleFor(categoryId: string): CollectionTale | undefined {
  return TALES.find((t) => t.categoryId === categoryId);
}

/** The chapter a collection belongs to, if its story has been written. */
export function chapterFor(categoryId: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.collectionIds.includes(categoryId));
}
`;
writeFileSync(TARGET, out);

const scenes = chapters.reduce(
  (n, c) => n + c.collections.reduce((m, col) => m + col.scenes.length, 0),
  0,
);
console.log(
  `wrote ${TARGET}: ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}, ` +
    `${seen.size} collections, ${scenes} scenes`,
);
for (const note of notes) console.log(`  note: ${note}`);
