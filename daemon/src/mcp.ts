// Minimal MCP client stub. Reads ~/BlackMagic/.bm/mcp.json and surfaces
// declared servers to /api/tools. Full stdio MCP protocol handling comes in
// a subsequent milestone — for V1 this is metadata-only.

import fs from 'node:fs/promises';
import path from 'node:path';
import { VAULT_ROOT } from './paths.js';

interface McpConfig {
  servers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

export async function loadMcpConfig(): Promise<McpConfig> {
  const p = path.join(VAULT_ROOT, '.bm', 'mcp.json');
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as McpConfig;
  } catch {
    return { servers: {} };
  }
}

export async function mcpServerList() {
  const cfg = await loadMcpConfig();
  return Object.entries(cfg.servers ?? {}).map(([name, spec]) => ({
    name,
    command: spec.command,
    args: spec.args ?? [],
    envKeys: Object.keys(spec.env ?? {}),
  }));
}
