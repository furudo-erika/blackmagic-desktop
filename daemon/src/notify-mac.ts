// Native macOS notification helper. Standalone so the run-completion
// path in index.ts can fire a desktop ping without pulling in the full
// `notify` tool (which also fans out to Slack / Feishu / etc and needs
// a tool ctx). Skills can still call the rich `notify` tool explicitly;
// this is the floor — every run finishes with at least one OS-level
// ping so the user knows their agent looped through.
import { spawn } from 'node:child_process';

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
