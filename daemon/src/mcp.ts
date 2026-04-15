// Minimal MCP (Model Context Protocol) stdio client.
//
// Reads ~/BlackMagic/.bm/mcp.json, spawns each declared server as a child
// process, performs the JSON-RPC 2.0 handshake over stdin/stdout, discovers
// tools via `tools/list`, and exposes them to the daemon's tool registry
// namespaced as `<server>.<rawTool>`.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getVaultRoot } from './paths.js';
import type { ToolDef } from './tools.js';

interface McpServerSpec {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  servers?: Record<string, McpServerSpec>;
}

interface RawTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export async function loadMcpConfig(): Promise<McpConfig> {
  const p = path.join(getVaultRoot(), '.bm', 'mcp.json');
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as McpConfig;
  } catch {
    return { servers: {} };
  }
}

type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
};

export class McpClient {
  readonly name: string;
  readonly spec: McpServerSpec;
  private proc?: ChildProcessWithoutNullStreams;
  private buf = '';
  private nextId = 1;
  private pending = new Map<number, Pending>();
  tools: RawTool[] = [];
  started = false;

  constructor(name: string, spec: McpServerSpec) {
    this.name = name;
    this.spec = spec;
  }

  async start(timeoutMs = 20_000): Promise<void> {
    const env = { ...process.env, ...(this.spec.env ?? {}) };
    const proc = spawn(this.spec.command, this.spec.args ?? [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;

    proc.stdout.setEncoding('utf-8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding('utf-8');
    proc.stderr.on('data', (chunk: string) => {
      // Forward to our stderr with prefix but don't crash the daemon on noisy servers.
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) console.error(`[mcp:${this.name}] ${line}`);
      }
    });
    proc.on('exit', (code, signal) => {
      for (const [, p] of this.pending) {
        p.reject(new Error(`mcp server ${this.name} exited (code=${code} signal=${signal})`));
      }
      this.pending.clear();
      this.started = false;
    });
    proc.on('error', (err) => {
      console.error(`[mcp:${this.name}] spawn error:`, err);
    });

    // Handshake. Use a timeout so one bad server can't hang startup.
    const run = async () => {
      const init = await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'blackmagic-desktop', version: '0.1.0' },
      });
      void init; // server caps not used here
      this.notify('notifications/initialized', {});
      const listed = await this.request('tools/list', {});
      const tools = Array.isArray(listed?.tools) ? (listed.tools as RawTool[]) : [];
      this.tools = tools;
      this.started = true;
    };

    await Promise.race([
      run(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`mcp ${this.name} handshake timed out`)), timeoutMs),
      ),
    ]);
  }

  private onStdout(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) !== -1) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        console.error(`[mcp:${this.name}] non-JSON line: ${line.slice(0, 200)}`);
        continue;
      }
      // Response (has id + result/error). Notifications have no id and are ignored.
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error?.message ?? 'mcp error'));
        else p.resolve(msg.result);
      }
    }
  }

  private send(obj: Record<string, unknown>) {
    if (!this.proc || this.proc.killed || !this.proc.stdin.writable) {
      throw new Error(`mcp server ${this.name} not running`);
    }
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params: unknown) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  async callTool(rawName: string, args: Record<string, unknown>): Promise<any> {
    const result = await this.request('tools/call', { name: rawName, arguments: args });
    return result;
  }

  stop() {
    if (this.proc && !this.proc.killed) {
      try {
        this.proc.kill('SIGTERM');
      } catch {}
    }
    this.started = false;
  }
}

class McpRegistryImpl {
  private clients = new Map<string, McpClient>();
  private toolDefs: ToolDef[] = [];

  async start(): Promise<void> {
    const cfg = await loadMcpConfig();
    const servers = cfg.servers ?? {};
    this.clients.clear();
    this.toolDefs = [];
    for (const [name, spec] of Object.entries(servers)) {
      const client = new McpClient(name, spec);
      try {
        await client.start();
        this.clients.set(name, client);
        for (const t of client.tools) {
          const prefixed = `${name}.${t.name}`;
          const def: ToolDef = {
            name: prefixed,
            description: t.description ? `[${name}] ${t.description}` : `MCP tool ${prefixed}`,
            parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
            handler: async (args: any) => client.callTool(t.name, args ?? {}),
          };
          this.toolDefs.push(def);
        }
        console.log(`[mcp] started ${name} (${client.tools.length} tools)`);
      } catch (err) {
        console.error(
          `[mcp] failed to start ${name}:`,
          err instanceof Error ? err.message : String(err),
        );
        client.stop();
      }
    }
  }

  stop(): void {
    for (const c of this.clients.values()) c.stop();
    this.clients.clear();
    this.toolDefs = [];
  }

  tools(): ToolDef[] {
    return this.toolDefs.slice();
  }

  getClient(name: string): McpClient | undefined {
    return this.clients.get(name);
  }

  hasTool(prefixed: string): boolean {
    return this.toolDefs.some((t) => t.name === prefixed);
  }

  async callPrefixed(prefixed: string, args: Record<string, unknown>): Promise<any> {
    const idx = prefixed.indexOf('.');
    if (idx < 0) throw new Error(`not an MCP tool name: ${prefixed}`);
    const server = prefixed.slice(0, idx);
    const raw = prefixed.slice(idx + 1);
    const client = this.clients.get(server);
    if (!client || !client.started) throw new Error(`mcp server not running: ${server}`);
    return client.callTool(raw, args);
  }
}

export const McpRegistry = new McpRegistryImpl();

// Back-compat for /api/tools consumers.
export async function mcpServerList() {
  const cfg = await loadMcpConfig();
  return Object.entries(cfg.servers ?? {}).map(([name, spec]) => {
    const client = McpRegistry.getClient(name);
    return {
      name,
      command: spec.command,
      args: spec.args ?? [],
      envKeys: Object.keys(spec.env ?? {}),
      started: Boolean(client?.started),
      tools: client?.tools.map((t) => t.name) ?? [],
    };
  });
}
