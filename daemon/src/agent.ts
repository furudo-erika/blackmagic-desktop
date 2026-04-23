import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { BUILTIN_TOOLS, toolsAsOpenAI, toolsByName, type ToolDef, type ToolCtx } from './tools.js';
import { getVaultRoot, type Config } from './paths.js';
import { summarizeRunPreview } from './run-preview.js';

// Price table — must match doc/BILLING.md
const PRICE: Record<string, { in: number; out: number }> = {
  'gpt-5.3-codex': { in: 2.5, out: 7.5 },
  'gpt-5.3-codex-spark': { in: 2.5, out: 7.5 },
  'gpt-5.2-codex': { in: 2.5, out: 7.5 },
  'gpt-5.1-codex': { in: 1.25, out: 5.0 },
  'gpt-5.1-codex-max': { in: 1.25, out: 5.0 },
  'gpt-5.1-codex-mini': { in: 0.15, out: 0.63 },
  'gpt-5-codex': { in: 1.25, out: 5.0 },
  'gpt-5-codex-mini': { in: 0.15, out: 0.63 },
};

export interface AgentSpec {
  name: string;
  model: string;
  tools: string[];
  temperature: number;
  systemBody: string;
  maxTurns?: number;
}

export async function loadAgent(name: string): Promise<AgentSpec> {
  const p = path.join(getVaultRoot(), 'agents', `${name}.md`);
  const raw = await fs.readFile(p, 'utf-8');
  const m = matter(raw);
  const fm = m.data as any;
  return {
    name,
    model: fm.model ?? 'gpt-5.3-codex',
    tools: Array.isArray(fm.tools) ? fm.tools : [],
    temperature: typeof fm.temperature === 'number' ? fm.temperature : 0.2,
    systemBody: m.content.trim(),
    maxTurns: typeof fm.max_turns === 'number' ? fm.max_turns : undefined,
  };
}

// Universal output-channel protocol, injected into every agent's system
// prompt. The chat surface is what the user actually sees — the vault
// filesystem is the side-effect, not the output. Agents have historically
// ended runs with "wrote to signals/X.md" and left the user to go find
// the file. This block forces the inverse: render the full deliverable
// inline in the chat reply; file paths are a footer, not the main event.
const OUTPUT_PROTOCOL = `## Output protocol (non-negotiable)

The chat surface is the primary output channel — the vault filesystem
is a side-effect. When your work produces a deliverable (signal,
draft, report, brief, digest, classification table, asset bundle,
etc.):

1. **Your final reply in chat MUST render the full deliverable
   inline as markdown** — headers, tables, bullet lists, image
   links, draft bodies. The user reads the chat, not the
   filesystem.
2. For tables: produce real markdown tables (\`| col | col |\`),
   not prose descriptions of tables.
3. For images / video / audio the agent generated: include the
   signed URL inline so the chat surface's markdown renderer can
   display / link to it.
4. File paths go at the *end* of the reply, under a short
   \`_Saved to:_\` footer. They are never the reply body.
5. Never end a run with just "Done." or "See file X." or "Wrote
   to signals/Y.md". If you only have a path to offer, you haven't
   finished the job — inline the content first.

If the deliverable is too long for a single chat message, lead with
a tight TL;DR (3–5 bullets), then the full rendered body, then the
file-path footer.`;

export async function loadClaudeMd(): Promise<string> {
  try {
    return await fs.readFile(path.join(getVaultRoot(), 'CLAUDE.md'), 'utf-8');
  } catch {
    return '';
  }
}

export interface RunEvent {
  // `reasoning` carries the model's own thinking summary between tool calls
  // so the UI can show the user WHY the next tool is being called, not just
  // WHICH tool. Without it, long autonomous runs look like an opaque parade
  // of tool names.
  type: 'text' | 'tool_call' | 'tool_result' | 'reasoning' | 'done' | 'error';
  data: any;
}

export interface RunResult {
  runId: string;
  runDir: string;
  final: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  turns: number;
  toolCalls: number;
}

function priceCents(model: string, tokIn: number, tokOut: number): number {
  const p = PRICE[model] ?? PRICE['gpt-5.3-codex']!;
  return Math.ceil(((tokIn * p.in) + (tokOut * p.out)) / 1_000_000 * 100);
}

export interface RunOptions {
  agent: string;
  task: string;
  /** Optional prior conversation (user + assistant turns). Prepended before `task`. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  threadId?: string;
  /** Vault path of the entity this run was scoped to (companies/X.md, etc).
   *  Stamped into meta.json so the UI can filter live-card + history per
   *  entity in the Multica-style detail page. */
  entityRef?: string;
  config: Config;
  onEvent?: (ev: RunEvent) => void;
  maxTurns?: number;
}

/**
 * Core agent loop. Calls zenn Responses API, dispatches tool calls locally,
 * loops until the model returns a final assistant message with no further
 * function calls, or max_turns is hit.
 *
 * We use the non-streaming Responses API in V1 for simplicity. Streaming
 * per-token deltas can be layered on top of the WS later without changing
 * the tool-dispatch logic.
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { agent, task, config } = opts;
  const onEvent = opts.onEvent ?? (() => {});

  if (!config.zenn_api_key) throw new Error('ZENN_API_KEY not set');

  const spec = await loadAgent(agent);
  // Precedence: explicit RunOptions.maxTurns > agent frontmatter max_turns >
  // global default 50. Autonomous agents like geo-analyst need to run a full
  // multi-step loop (personas + brands + prompts + reports + weekly bundle)
  // in one turn budget — 20 was far too low and led to silent exits at
  // `finalText = ''` after the model was still mid-tool-chain.
  const maxTurns = opts.maxTurns ?? spec.maxTurns ?? 50;
  const claudeMd = await loadClaudeMd();

  const allTools = toolsByName();
  const enabledTools: ToolDef[] = spec.tools
    .map((n) => allTools.get(n))
    .filter((t): t is ToolDef => Boolean(t));

  // Prepare run dir
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${agent}`;
  const runDir = path.join(getVaultRoot(), 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });

  const systemPrompt =
    (claudeMd ? claudeMd.trim() + '\n\n---\n\n' : '') +
    spec.systemBody +
    '\n\n---\n\n' + OUTPUT_PROTOCOL +
    '\n\n---\n\n## Available tools\n' +
    enabledTools.map((t) => `- \`${t.name}\` — ${t.description}`).join('\n');

  await fs.writeFile(
    path.join(runDir, 'prompt.md'),
    `# Run ${runId}\n\n## System\n\n${systemPrompt}\n\n## Task\n\n${task}\n`,
    'utf-8',
  );

  // Responses API: `instructions` is a top-level field (required for codex
  // passthrough on zenn). `input` carries the turn history.
  type InputItem =
    | { type: 'message'; role: 'user' | 'assistant'; content: string }
    | { type: 'function_call'; call_id: string; name: string; arguments: string }
    | { type: 'function_call_output'; call_id: string; output: string };

  const input: InputItem[] = [];
  for (const h of opts.history ?? []) {
    input.push({ type: 'message', role: h.role, content: h.content });
  }
  input.push({ type: 'message', role: 'user', content: task });

  const toolsPayload = toolsAsOpenAI(enabledTools);

  let tokensIn = 0;
  let tokensOut = 0;
  let toolCalls = 0;
  let finalText = '';

  const toolLog: Array<Record<string, unknown>> = [];
  const toolCtx: ToolCtx = { config, runDir };

  for (let turn = 0; turn < maxTurns; turn++) {
    const body: Record<string, unknown> = {
      model: spec.model,
      instructions: systemPrompt,
      input,
      tools: toolsPayload,
      reasoning: { effort: 'medium', summary: 'auto' },
      store: false,
      stream: true,
    };

    const res = await fetch(`${config.zenn_base_url.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.zenn_api_key}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      const err = `zenn ${res.status}: ${text.slice(0, 500)}`;
      onEvent({ type: 'error', data: { message: err } });
      throw new Error(err);
    }

    // Parse SSE. Accumulate output items from `response.output_item.done`
    // events (the final `response.completed` often has `output: []`).
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let data: any = null;
    const accumulatedOutput: any[] = [];
    let rawEventLog: string[] = [];

    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const lines = block.split('\n');
        let event = '';
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7).trim();
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        }
        if (!dataLines.length) continue;
        const payloadStr = dataLines.join('\n');
        rawEventLog.push(`${event}: ${payloadStr.slice(0, 200)}`);

        try {
          const parsed = JSON.parse(payloadStr);
          if (event === 'response.output_item.done') {
            if (parsed.item) accumulatedOutput.push(parsed.item);
          } else if (event === 'response.completed') {
            data = parsed.response ?? parsed;
            if (!data.output || data.output.length === 0) data.output = accumulatedOutput;
            break outer;
          } else if (event === 'response.output_text.delta') {
            if (typeof parsed.delta === 'string') {
              onEvent({ type: 'text', data: { delta: parsed.delta } });
            }
          } else if (
            event === 'response.reasoning_summary_text.delta' ||
            event === 'response.reasoning_summary.delta'
          ) {
            // The reasoning summary is emitted incrementally between tool
            // calls. Surface it so the cockpit can render a live "thinking"
            // block alongside the tool chips.
            if (typeof parsed.delta === 'string') {
              onEvent({ type: 'reasoning', data: { delta: parsed.delta } });
            }
          } else if (event === 'response.error' || event === 'error') {
            const err = `zenn stream error: ${payloadStr.slice(0, 300)}`;
            onEvent({ type: 'error', data: { message: err } });
            throw new Error(err);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('zenn stream error')) throw e;
          // JSON parse failure — ignore, partial data
        }
      }
    }

    if (!data) {
      throw new Error('zenn stream ended without response.completed');
    }
    // Always log SSE event log for debugging
    try {
      await fs.writeFile(path.join(runDir, `turn-${turn}-events.log`), rawEventLog.join('\n'), 'utf-8');
    } catch {}

    // Debug: persist raw response for each turn (helps diagnose new models).
    try {
      await fs.writeFile(
        path.join(runDir, `turn-${turn}-raw.json`),
        JSON.stringify(data, null, 2),
        'utf-8',
      );
    } catch {}

    tokensIn += data?.usage?.input_tokens ?? 0;
    tokensOut += data?.usage?.output_tokens ?? 0;

    const outputItems: any[] = data.output ?? [];
    let sawToolCall = false;
    let assistantText = '';

    for (const item of outputItems) {
      if (item.type === 'message' && item.role === 'assistant') {
        const parts = Array.isArray(item.content) ? item.content : [];
        for (const c of parts) {
          if (c.type === 'output_text' && typeof c.text === 'string') assistantText += c.text;
        }
      } else if (item.type === 'function_call') {
        sawToolCall = true;
        toolCalls++;
        const { call_id, name, arguments: argStr } = item;
        onEvent({ type: 'tool_call', data: { name, arguments: argStr } });
        let parsedArgs: any = {};
        try { parsedArgs = JSON.parse(argStr || '{}'); } catch { parsedArgs = {}; }

        const tool = allTools.get(name);
        let output: unknown;
        try {
          output = tool
            ? await tool.handler(parsedArgs, toolCtx)
            : { error: `unknown tool: ${name}` };
        } catch (err) {
          output = { error: err instanceof Error ? err.message : String(err) };
        }
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        toolLog.push({ turn, name, arguments: parsedArgs, output, ts: new Date().toISOString() });
        onEvent({ type: 'tool_result', data: { name, arguments: argStr, output } });

        // Append the call + its result back to input for next turn
        input.push({ type: 'function_call', call_id, name, arguments: argStr });
        input.push({ type: 'function_call_output', call_id, output: outputStr.slice(0, 50_000) });
      }
    }

    if (assistantText) {
      finalText = assistantText;
      onEvent({ type: 'text', data: { delta: assistantText } });
      if (!sawToolCall) {
        // Also record the assistant message in case the model interleaves
        input.push({ type: 'message', role: 'assistant', content: assistantText });
      }
    }

    if (!sawToolCall) break;
  }

  // Budget exhausted with tools still mid-chain — without this fallback the
  // run would persist `final.md` as an empty string and the UI would render
  // "(empty)" with no hint why. Synthesize a visible closing message so the
  // user knows to re-run and what state they're picking up from.
  if (!finalText) {
    const lastTools = toolLog.slice(-8).map((t) => t.name).join(', ');
    finalText =
      `_Hit the ${maxTurns}-turn budget while still in the tool loop._\n\n` +
      `Completed ${toolLog.length} tool calls across ${maxTurns} turns. Last ` +
      `few: ${lastTools || '(none)'}. Re-run to continue — the agent will ` +
      `pick up from the files it already wrote.\n\n` +
      `If this keeps happening, bump \`max_turns:\` in the agent's ` +
      `frontmatter (\`agents/${agent}.md\`).`;
    onEvent({ type: 'text', data: { delta: finalText } });
  }

  // Persist logs
  await fs.writeFile(path.join(runDir, 'final.md'), finalText + '\n', 'utf-8');
  await fs.writeFile(
    path.join(runDir, 'tool-calls.jsonl'),
    toolLog.map((x) => JSON.stringify(x)).join('\n') + '\n',
    'utf-8',
  );

  const costCents = priceCents(spec.model, tokensIn, tokensOut);
  const preview = summarizeRunPreview(task) ?? summarizeRunPreview(finalText);
  await fs.writeFile(
    path.join(runDir, 'meta.json'),
    JSON.stringify(
      {
        runId,
        agent,
        model: spec.model,
        tokensIn,
        tokensOut,
        costCents,
        toolCalls,
        turns: toolLog.length,
        preview,
        threadId: opts.threadId,
        entity_ref: opts.entityRef,
      },
      null,
      2,
    ),
    'utf-8',
  );

  // NOTE: billing is now handled server-side by /api/agent/responses, which
  // meters tokens from the zenn stream it forwards. We no longer post here
  // to avoid double-charging.

  onEvent({ type: 'done', data: { runId, tokensIn, tokensOut, costCents } });

  return {
    runId,
    runDir,
    final: finalText,
    tokensIn,
    tokensOut,
    costCents,
    turns: toolLog.length,
    toolCalls,
  };
}
