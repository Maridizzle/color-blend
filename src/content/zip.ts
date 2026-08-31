import { unzipSync } from 'fflate';

/**
 * Zip reading, treating every pack as untrusted.
 *
 * Packs are meant to be handed around, so a pack may well come from someone
 * other than the person opening it. Nothing here can reach the filesystem --
 * entries are only ever held in memory and matched against an extension
 * allowlist -- but path and size checks still matter: a traversal-shaped name
 * must never survive into a key that later gets treated as a path, and a
 * decompression bomb should be refused rather than taking the tab down.
 */

export const ZIP_LIMITS = {
  maxEntries: 400,
  /** Per-entry uncompressed size. */
  maxEntryBytes: 32 * 1024 * 1024,
  /** Total uncompressed size across the pack. */
  maxTotalBytes: 256 * 1024 * 1024,
} as const;

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'];

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

export interface ZipEntry {
  /** Sanitized, forward-slashed path relative to the archive root. */
  name: string;
  bytes: Uint8Array;
}

export interface ZipReadResult {
  entries: ZipEntry[];
  /** Entries refused, with why -- surfaced in the ingest report rather than hidden. */
  rejected: { name: string; reason: string }[];
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

export function mimeFor(name: string): string {
  return MIME_BY_EXTENSION[extensionOf(name)] ?? 'application/octet-stream';
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

/**
 * Normalize an archive path, or return null if it is unsafe.
 * Rejects absolute paths, drive letters, and any `..` segment.
 */
export function sanitizeEntryName(raw: string): string | null {
  const name = raw.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null;

  const parts: string[] = [];
  for (const segment of name.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') return null;
    parts.push(segment);
  }
  return parts.length > 0 ? parts.join('/') : null;
}

/** True for the junk directories archivers leave behind. */
function isNoise(name: string): boolean {
  return (
    name.startsWith('__MACOSX/') ||
    name.split('/').some((s) => s === '.DS_Store' || s === 'Thumbs.db') ||
    name.split('/').pop()?.startsWith('._') === true
  );
}

export function readZip(bytes: Uint8Array): ZipReadResult {
  const rejected: { name: string; reason: string }[] = [];
  let declaredTotal = 0;
  let accepted = 0;

  const raw = unzipSync(bytes, {
    // Runs before decompression, so an oversized entry is refused on its header
    // rather than after it has already been expanded into memory.
    filter: (file) => {
      if (file.name.endsWith('/')) return false;
      const safe = sanitizeEntryName(file.name);
      if (!safe) {
        rejected.push({ name: file.name, reason: 'unsafe path' });
        return false;
      }
      if (isNoise(safe)) return false;
      if (!isImageName(safe) && safe.split('/').pop() !== 'pack.json') {
        rejected.push({ name: safe, reason: 'not an image or pack.json' });
        return false;
      }
      if (accepted >= ZIP_LIMITS.maxEntries) {
        rejected.push({ name: safe, reason: 'archive has too many entries' });
        return false;
      }
      if (file.originalSize !== undefined && file.originalSize > ZIP_LIMITS.maxEntryBytes) {
        rejected.push({ name: safe, reason: 'entry too large' });
        return false;
      }
      declaredTotal += file.originalSize ?? 0;
      if (declaredTotal > ZIP_LIMITS.maxTotalBytes) {
        rejected.push({ name: safe, reason: 'archive too large' });
        return false;
      }
      accepted++;
      return true;
    },
  });

  const entries: ZipEntry[] = [];
  let actualTotal = 0;
  for (const [rawName, data] of Object.entries(raw)) {
    const name = sanitizeEntryName(rawName);
    if (!name) continue;
    // Headers are attacker-controlled, so re-check the sizes we actually got.
    if (data.length > ZIP_LIMITS.maxEntryBytes) {
      rejected.push({ name, reason: 'entry too large' });
      continue;
    }
    actualTotal += data.length;
    if (actualTotal > ZIP_LIMITS.maxTotalBytes) {
      rejected.push({ name, reason: 'archive too large' });
      break;
    }
    entries.push({ name, bytes: data });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { entries, rejected };
}
