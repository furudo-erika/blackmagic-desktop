// Daily walker for multi-touch sequences.
//
// Once a day, for every contact with `sequence_status: active`, we compute
// the number of whole days since `sequence_enrolled_at`. Every touch whose
// `day` offset has elapsed and whose index is >= the contact's current
// `sequence_step` is fired — the touch either runs a named playbook (with
// `contact_path` as input) or hands a substituted prompt to the `sdr`
// agent. Either path surfaces as a draft in `drafts/` via the existing
// draft pipeline (the agents are already trained to call draft_create).
//
// After firing, we bump `sequence_step` past the last-fired touch. If
// there are no touches left, `sequence_status` flips to `complete`.

import cron from 'node-cron';
import type { Config } from './paths.js';
import { listEnrollments, readSequence, advanceEnrollment, type Touch } from './sequences.js';
import { runPlaybook } from './playbooks.js';
import { runAgent } from './agent.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function renderPrompt(prompt: string, vars: Record<string, string>): string {
  return prompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

async function fireTouch(touch: Touch, contactPath: string, config: Config) {
  const vars = { contact_path: contactPath };
  if (touch.playbook) {
    try {
      await runPlaybook(touch.playbook, { contact_path: contactPath }, config);
    } catch (err) {
      console.error(`[sequence-cron] playbook ${touch.playbook} failed for ${contactPath}:`, err);
    }
    return;
  }
  const task = renderPrompt(
    touch.prompt ?? `Send a ${touch.channel ?? 'email'} touch to {{contact_path}}.`,
    vars,
  );
  try {
    await runAgent({ agent: 'sdr', task, config });
  } catch (err) {
    console.error(`[sequence-cron] agent run failed for ${contactPath}:`, err);
  }
}

export async function walkSequencesOnce(config: Config, now: Date = new Date()) {
  const enrollments = await listEnrollments();
  let fired = 0;
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const seq = await readSequence(e.sequencePath);
    if (!seq || seq.touches.length === 0) continue;
    const enrolledAt = Date.parse(e.enrolledAt);
    if (!Number.isFinite(enrolledAt)) continue;
    const daysSince = Math.floor((now.getTime() - enrolledAt) / DAY_MS);

    let step = e.step;
    while (step < seq.touches.length && seq.touches[step]!.day <= daysSince) {
      const touch = seq.touches[step]!;
      console.log(
        `[sequence-cron] firing ${e.sequencePath} step ${step} (day ${touch.day}) for ${e.contactPath}`,
      );
      await fireTouch(touch, e.contactPath, config);
      fired += 1;
      step += 1;
    }
    if (step !== e.step) {
      const done = step >= seq.touches.length;
      await advanceEnrollment(e.contactPath, step, done ? 'complete' : 'active');
    }
  }
  return { enrollments: enrollments.length, fired };
}

let task: cron.ScheduledTask | null = null;

export function startSequenceCron(config: Config) {
  if (task) task.stop();
  // 09:05 every day — after the daily trigger window, before business hours
  // in most timezones. Keep this lightweight; it's a walk, not a spray.
  task = cron.schedule('5 9 * * *', () => {
    walkSequencesOnce(config).then(
      (r) => console.log(`[sequence-cron] walk complete: ${r.fired} touches fired over ${r.enrollments} enrollments`),
      (err) => console.error('[sequence-cron] walk failed:', err),
    );
  });
  console.log('[sequence-cron] scheduled daily walk @ 09:05');
}
