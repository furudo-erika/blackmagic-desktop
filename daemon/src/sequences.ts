// Multi-touch outreach sequences.
//
// A sequence is a markdown file in `sequences/` whose frontmatter declares
// an ordered `touches:` array. Each touch has a `day` offset (integer days
// from enrollment), a `channel`, and either a `playbook` reference or a
// free-form `prompt` passed to the sdr agent with `{{contact_path}}`
// substituted.
//
// Per-contact state lives in the contact file's frontmatter:
//   sequence:              sequences/<name>.md
//   sequence_step:         <index of the next touch to send>
//   sequence_enrolled_at:  <iso timestamp>
//   sequence_status:       active | complete | stopped  (default active)
//
// The daily cron walker iterates every contact with an active sequence,
// computes days-since-enroll, fires every touch whose offset has elapsed
// and whose index >= sequence_step, advances sequence_step, and flips to
// `complete` when it runs out of touches.

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { VAULT_ROOT } from './paths.js';
import { writeVaultFile, walkTree } from './vault.js';

export interface Touch {
  day: number;
  channel?: string;
  playbook?: string;
  prompt?: string;
}

export interface Sequence {
  path: string;        // e.g. sequences/cold-outbound-5-touch.md
  name: string;
  description?: string;
  touches: Touch[];
  body: string;
}

function normaliseTouches(raw: unknown): Touch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      day: typeof t?.day === 'number' ? t.day : Number(t?.day ?? 0),
      channel: typeof t?.channel === 'string' ? t.channel : undefined,
      playbook: typeof t?.playbook === 'string' ? t.playbook : undefined,
      prompt: typeof t?.prompt === 'string' ? t.prompt : undefined,
    }))
    .filter((t) => Number.isFinite(t.day))
    .sort((a, b) => a.day - b.day);
}

export async function listSequences(): Promise<Sequence[]> {
  const dir = path.join(VAULT_ROOT, 'sequences');
  try {
    const entries = await fs.readdir(dir);
    const out: Sequence[] = [];
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const raw = await fs.readFile(path.join(dir, f), 'utf-8');
      const m = matter(raw);
      const fm = m.data as any;
      out.push({
        path: `sequences/${f}`,
        name: String(fm.name ?? path.basename(f, '.md')),
        description: fm.description ? String(fm.description) : undefined,
        touches: normaliseTouches(fm.touches),
        body: m.content.trim(),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function readSequence(relPath: string): Promise<Sequence | null> {
  const all = await listSequences();
  return all.find((s) => s.path === relPath) ?? null;
}

export interface Enrollment {
  contactPath: string;
  sequencePath: string;
  step: number;
  enrolledAt: string;
  status: 'active' | 'complete' | 'stopped';
}

export async function listEnrollments(): Promise<Enrollment[]> {
  const tree = await walkTree('.');
  const out: Enrollment[] = [];
  for (const f of tree) {
    if (f.type !== 'file') continue;
    if (!f.path.startsWith('contacts/') || !f.path.endsWith('.md')) continue;
    try {
      const raw = await fs.readFile(path.join(VAULT_ROOT, f.path), 'utf-8');
      const m = matter(raw);
      const fm = m.data as any;
      if (!fm.sequence) continue;
      out.push({
        contactPath: f.path,
        sequencePath: String(fm.sequence),
        step: Number(fm.sequence_step ?? 0),
        enrolledAt: String(fm.sequence_enrolled_at ?? ''),
        status: (fm.sequence_status ?? 'active') as Enrollment['status'],
      });
    } catch {
      // ignore broken frontmatter
    }
  }
  return out;
}

async function patchFrontmatter(relPath: string, patch: Record<string, unknown>) {
  const abs = path.join(VAULT_ROOT, relPath);
  const raw = await fs.readFile(abs, 'utf-8');
  const m = matter(raw);
  const next = matter.stringify(m.content, { ...m.data, ...patch });
  await writeVaultFile(relPath, next);
}

export async function enrollContact(contactPath: string, sequencePath: string) {
  if (!contactPath.startsWith('contacts/') || !contactPath.endsWith('.md')) {
    throw new Error('contactPath must be a contacts/*.md file');
  }
  const seq = await readSequence(sequencePath);
  if (!seq) throw new Error(`sequence not found: ${sequencePath}`);
  await patchFrontmatter(contactPath, {
    sequence: sequencePath,
    sequence_step: 0,
    sequence_enrolled_at: new Date().toISOString(),
    sequence_status: 'active',
  });
  return { ok: true, contactPath, sequencePath, touches: seq.touches.length };
}

export async function stopEnrollment(contactPath: string) {
  await patchFrontmatter(contactPath, { sequence_status: 'stopped' });
  return { ok: true };
}

export async function advanceEnrollment(
  contactPath: string,
  nextStep: number,
  status: Enrollment['status'],
) {
  await patchFrontmatter(contactPath, {
    sequence_step: nextStep,
    sequence_status: status,
  });
}
