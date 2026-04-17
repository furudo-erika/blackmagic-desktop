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
import {
  listEnrollments,
  readSequence,
  advanceEnrollment,
  type Touch,
} from './sequences.js';
import { runPlaybook } from './playbooks.js';
import { runAgent } from './agent.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TouchExecutionResult {
  ok: boolean;
  kind: 'playbook' | 'agent';
  target: string;
  error?: string;
}

export interface SequenceWalkFailure {
  contactPath: string;
  sequencePath: string;
  step: number;
  day: number;
  kind: TouchExecutionResult['kind'];
  target: string;
  error: string;
}

export interface SequenceWalkResult {
  enrollments: number;
  fired: number;
  failed: number;
  failures: SequenceWalkFailure[];
}

interface SequenceCronDeps {
  listEnrollments: typeof listEnrollments;
  readSequence: typeof readSequence;
  advanceEnrollment: typeof advanceEnrollment;
  runPlaybook: typeof runPlaybook;
  runAgent: typeof runAgent;
  logInfo: typeof console.log;
  logError: typeof console.error;
}

const DEFAULT_DEPS: SequenceCronDeps = {
  listEnrollments,
  readSequence,
  advanceEnrollment,
  runPlaybook,
  runAgent,
  logInfo: console.log,
  logError: console.error,
};

function renderPrompt(prompt: string, vars: Record<string, string>): string {
  return prompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

export async function fireTouch(
  touch: Touch,
  contactPath: string,
  config: Config,
  deps: Pick<SequenceCronDeps, 'runPlaybook' | 'runAgent' | 'logError'> = DEFAULT_DEPS,
): Promise<TouchExecutionResult> {
  const vars = { contact_path: contactPath };
  if (touch.playbook) {
    try {
      await deps.runPlaybook(touch.playbook, { contact_path: contactPath }, config);
      return { ok: true, kind: 'playbook', target: touch.playbook };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      deps.logError(`[sequence-cron] playbook ${touch.playbook} failed for ${contactPath}:`, err);
      return { ok: false, kind: 'playbook', target: touch.playbook, error };
    }
  }
  const task = renderPrompt(
    touch.prompt ?? `Send a ${touch.channel ?? 'email'} touch to {{contact_path}}.`,
    vars,
  );
  try {
    await deps.runAgent({ agent: 'sdr', task, config });
    return { ok: true, kind: 'agent', target: touch.channel ?? 'email' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    deps.logError(`[sequence-cron] agent run failed for ${contactPath}:`, err);
    return { ok: false, kind: 'agent', target: touch.channel ?? 'email', error };
  }
}

export async function walkSequencesOnce(
  config: Config,
  now: Date = new Date(),
  deps: SequenceCronDeps = DEFAULT_DEPS,
): Promise<SequenceWalkResult> {
  const enrollments = await deps.listEnrollments();
  let fired = 0;
  const failures: SequenceWalkFailure[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    const seq = await deps.readSequence(e.sequencePath);
    if (!seq || seq.touches.length === 0) continue;
    const enrolledAt = Date.parse(e.enrolledAt);
    if (!Number.isFinite(enrolledAt)) continue;
    const daysSince = Math.floor((now.getTime() - enrolledAt) / DAY_MS);

    let step = e.step;
    while (step < seq.touches.length && seq.touches[step]!.day <= daysSince) {
      const touch = seq.touches[step]!;
      deps.logInfo(
        `[sequence-cron] firing ${e.sequencePath} step ${step} (day ${touch.day}) for ${e.contactPath}`,
      );
      const result = await fireTouch(touch, e.contactPath, config, deps);
      if (!result.ok) {
        failures.push({
          contactPath: e.contactPath,
          sequencePath: e.sequencePath,
          step,
          day: touch.day,
          kind: result.kind,
          target: result.target,
          error: result.error ?? 'unknown error',
        });
        break;
      }
      fired += 1;
      step += 1;
    }
    if (step !== e.step) {
      const done = step >= seq.touches.length;
      await deps.advanceEnrollment(e.contactPath, step, done ? 'complete' : 'active');
    }
  }
  return { enrollments: enrollments.length, fired, failed: failures.length, failures };
}

let task: cron.ScheduledTask | null = null;

export function startSequenceCron(config: Config) {
  if (task) task.stop();
  const run = () =>
    walkSequencesOnce(config).then(
      (r) =>
        console.log(
          `[sequence-cron] walk complete: ${r.fired} touches fired, ${r.failed} failed over ${r.enrollments} enrollments`,
        ),
      (err) => console.error('[sequence-cron] walk failed:', err),
    );
  // Every 30 minutes — day-0 touches fire promptly after enrollment,
  // and the step bump makes re-runs idempotent.
  task = cron.schedule('*/30 * * * *', run);
  // Fire once on startup so a freshly-started daemon picks up any due touches
  // without waiting up to 30 minutes.
  setTimeout(run, 10_000).unref?.();
  console.log('[sequence-cron] scheduled walk every 30m (plus startup kick)');
}
