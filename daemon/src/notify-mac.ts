// Native macOS notification helper. Standalone so the run-completion
// path in index.ts can fire a desktop ping without pulling in the full
// `notify` tool (which also fans out to Slack / Feishu / etc and needs
// a tool ctx). Skills can still call the rich `notify` tool explicitly;
// this is the floor — every run finishes with at least one OS-level
// ping so the user knows their agent looped through.
import { spawn } from 'node:child_process';
import type { Config } from './paths.js';

export type NotificationEvent =
  | 'agent_started'
  | 'agent_completed'
  | 'trigger_fired'
  | 'trigger_completed';

export type NotificationSettings = {
  enabled: boolean;
  events: Record<NotificationEvent, boolean>;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  events: {
    agent_started: true,
    agent_completed: true,
    trigger_fired: true,
    trigger_completed: true,
  },
};

export function notificationSettings(config: Config): NotificationSettings {
  return {
    enabled: config.notifications_enabled !== false,
    events: {
      agent_started: config.notify_agent_started !== false,
      agent_completed: config.notify_agent_completed !== false,
      trigger_fired: config.notify_trigger_fired !== false,
      trigger_completed: config.notify_trigger_completed !== false,
    },
  };
}

export function shouldNotify(config: Config, event: NotificationEvent): boolean {
  const settings = notificationSettings(config);
  return settings.enabled && settings.events[event] !== false;
}

export function notifyMac(subject: string, body: string, opts: { silent?: boolean } = {}) {
  if (process.platform !== 'darwin') return;
  try {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const oneLine = body.replace(/\n+/g, ' · ').slice(0, 280);
    const soundClause = opts.silent ? '' : ' sound name "Ping"';
    const script = `display notification "${esc(oneLine)}" with title "${esc(subject.slice(0, 80))}"${soundClause}`;
    const proc = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    proc.on('error', () => {});
  } catch {}
}

export function notifyEvent(
  config: Config,
  event: NotificationEvent,
  subject: string,
  body: string,
  opts: { silent?: boolean } = {},
) {
  if (!shouldNotify(config, event)) return;
  notifyMac(subject, body, opts);
}

// Pull report-style paths out of an assistant final message so the
// run-complete notification + the renderer's action chips can both
// surface them. Matches anything under signals/ drafts/ vault/
// reports/ that ends in .md, plus bare .md basenames in those dirs.
export function extractReportPaths(text: string): string[] {
  if (!text) return [];
  const paths = new Set<string>();
  const re = /(?<![a-zA-Z0-9_/-])((?:signals|drafts|vault|reports)\/[A-Za-z0-9_./-]+?\.(?:md|pdf|json|csv|txt))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) paths.add(m[1]);
  }
  return Array.from(paths).slice(0, 5);
}
