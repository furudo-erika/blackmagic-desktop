// Obsidian-style wikilink helpers.
//
// [[path/to/note]]            -> markdown link with display = last segment
// [[path/to/note|Alt text]]   -> markdown link with display = "Alt text"
//
// Targets are resolved against the vault root. Unknown targets are preserved
// as-is so the user can still see what was meant.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const WIKILINK_RE = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/g;

function normalizeTarget(target: string): string {
  // Strip leading ./ and trailing .md for resolution purposes.
  let t = target.trim().replace(/^\.\//, '');
  if (!t.endsWith('.md')) t = t + '.md';
  return t;
}

/** Convert wikilinks into regular markdown links relative to the vault root.
 *  Unresolved targets (no file on disk) are kept as `[[target]]` literal. */
export function resolveWikilinks(content: string, vaultRoot: string): string {
  return content.replace(WIKILINK_RE, (whole, target: string, alt?: string) => {
    const rel = normalizeTarget(target);
    const abs = path.resolve(vaultRoot, rel);
    const inVault = abs.startsWith(path.resolve(vaultRoot));
    if (!inVault) return whole;
    let exists = false;
    try { exists = fs.statSync(abs).isFile(); } catch {}
    const display = (alt ?? path.basename(target).replace(/\.md$/, '')).trim();
    if (!exists) return whole;
    return `[${display}](/vault?path=${encodeURIComponent(rel)})`;
  });
}

/** Return raw wikilink targets (without .md) present in the content. */
export function extractBacklinks(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(WIKILINK_RE)) {
    const target = (m[1] ?? '').trim().replace(/^\.\//, '').replace(/\.md$/, '');
    if (target) out.push(target);
  }
  return out;
}

/** Scan the vault and return paths of md files containing a wikilink to
 *  `targetPath` (which may or may not include .md). */
export async function findBacklinks(vaultRoot: string, targetPath: string): Promise<string[]> {
  const bare = targetPath.replace(/\.md$/, '');
  const withExt = bare + '.md';
  const basename = path.basename(bare);
  const hits: string[] = [];

  async function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(abs); continue; }
      if (!e.isFile() || !/\.md$/i.test(e.name)) continue;
      const rel = path.relative(vaultRoot, abs);
      if (rel === withExt) continue; // skip self
      let text = '';
      try { text = await fsp.readFile(abs, 'utf-8'); } catch { continue; }
      const targets = extractBacklinks(text);
      for (const t of targets) {
        if (t === bare || t === withExt || path.basename(t) === basename) {
          hits.push(rel);
          break;
        }
      }
    }
  }

  await walk(vaultRoot);
  return hits.sort();
}
