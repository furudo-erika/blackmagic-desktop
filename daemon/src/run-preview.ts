const RUN_PREVIEW_MAX = 140;

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '');
}

export function summarizeRunPreview(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const normalized = stripMarkdown(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  if (normalized.length <= RUN_PREVIEW_MAX) return normalized;
  const clipped = normalized.slice(0, RUN_PREVIEW_MAX - 1).trimEnd();
  return `${clipped}…`;
}

export function extractPreviewFromPromptMarkdown(prompt: string | undefined | null): string | undefined {
  if (!prompt) return undefined;
  const taskMatch = prompt.match(/(?:^|\n)## Task\s*\n+([\s\S]+)/m);
  if (taskMatch?.[1]) return summarizeRunPreview(taskMatch[1]);
  return summarizeRunPreview(prompt);
}

export function extractTaskFromPromptMarkdown(prompt: string | undefined | null): string | undefined {
  if (!prompt) return undefined;
  const taskMatch = prompt.match(/(?:^|\n)## Task\s*\n+([\s\S]+)/m);
  const task = (taskMatch?.[1] ?? prompt).trim();
  return task || undefined;
}

export function extractPreviewFromFinalMarkdown(finalMd: string | undefined | null): string | undefined {
  if (!finalMd) return undefined;
  const firstMeaningfulLine = finalMd
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return summarizeRunPreview(firstMeaningfulLine ?? finalMd);
}

export function extractPreviewFromStdoutLog(stdout: string | undefined | null): string | undefined {
  if (!stdout) return undefined;
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
      };
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        const preview = summarizeRunPreview(event.item.text);
        if (preview) return preview;
      }
    } catch {
      // Old or malformed lines are ignored; we fall back below.
    }
  }
  return summarizeRunPreview(stdout);
}

export function deriveRunPreview(opts: {
  prompt?: string | null;
  metaPreview?: string | null;
  final?: string | null;
  stdout?: string | null;
  agent?: string | null;
  runId?: string | null;
}): string {
  return (
    extractPreviewFromPromptMarkdown(opts.prompt) ??
    summarizeRunPreview(opts.metaPreview) ??
    extractPreviewFromFinalMarkdown(opts.final) ??
    extractPreviewFromStdoutLog(opts.stdout) ??
    summarizeRunPreview(opts.agent) ??
    summarizeRunPreview(opts.runId) ??
    'run'
  );
}
