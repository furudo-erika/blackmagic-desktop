// Projects registry. Lives at <homeVault>/.bm/projects.json. Lists all known
// project vaults and which one is currently active.
//
// The "home vault" is always the default ~/BlackMagic folder — it holds the
// registry even when the active vault points elsewhere. This keeps the
// registry location stable across switches.

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { homeVault, setVaultRoot, getVaultRoot } from './paths.js';

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface ProjectsRegistry {
  active: string;
  projects: Project[];
}

function registryPath(): string {
  return path.join(homeVault(), '.bm', 'projects.json');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'project';
}

async function readRegistry(): Promise<ProjectsRegistry | null> {
  try {
    const raw = await fs.readFile(registryPath(), 'utf-8');
    const j = JSON.parse(raw) as ProjectsRegistry;
    if (!j.projects || !Array.isArray(j.projects)) return null;
    return j;
  } catch {
    return null;
  }
}

async function writeRegistry(reg: ProjectsRegistry): Promise<void> {
  const p = registryPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(reg, null, 2) + '\n', 'utf-8');
}

// Called once at daemon startup. Reads (or seeds) the registry and sets the
// active vault root. Returns the current registry.
export async function initProjectsRegistry(): Promise<ProjectsRegistry> {
  let reg = await readRegistry();
  const defaultPath = homeVault();

  if (!reg || reg.projects.length === 0) {
    const defaultProject: Project = {
      id: 'default',
      name: 'Default',
      path: defaultPath,
    };
    reg = { active: defaultProject.id, projects: [defaultProject] };
    await writeRegistry(reg);
  }

  // Ensure the active project still exists in the list; if not, fall back.
  let active: Project | undefined = reg.projects.find((p) => p.id === reg!.active);
  if (!active) {
    active = reg.projects[0];
    if (!active) throw new Error('no projects in registry');
    reg.active = active.id;
    await writeRegistry(reg);
  }

  setVaultRoot(active.path);
  return reg;
}

export async function getRegistry(): Promise<ProjectsRegistry> {
  const reg = await readRegistry();
  if (reg) return reg;
  return initProjectsRegistry();
}

// Add a project. If `inputPath` has no `/`, it's treated as a simple slug and
// a new folder is created at ~/BlackMagic-<slug>. Otherwise `inputPath` is
// used as-is (absolute path expected). Returns the new registry.
export async function addProject(name: string, inputPath?: string): Promise<{ reg: ProjectsRegistry; project: Project }> {
  const reg = await getRegistry();
  const id = uniqueId(reg, slugify(name));

  let projectPath: string;
  if (!inputPath || !inputPath.includes('/')) {
    const slug = slugify(inputPath || name);
    projectPath = path.join(os.homedir(), `BlackMagic-${slug}`);
  } else {
    projectPath = inputPath;
  }

  // Ensure the folder exists.
  await fs.mkdir(projectPath, { recursive: true });

  const project: Project = { id, name, path: projectPath };
  reg.projects.push(project);
  await writeRegistry(reg);
  return { reg, project };
}

function uniqueId(reg: ProjectsRegistry, base: string): string {
  let id = base;
  let n = 2;
  while (reg.projects.some((p) => p.id === id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

// Set a project active. Mutates the live VAULT_ROOT so subsequent requests
// hit the new vault. Returns the registry.
export async function activateProject(id: string): Promise<ProjectsRegistry> {
  const reg = await getRegistry();
  const match = reg.projects.find((p) => p.id === id);
  if (!match) throw new Error(`unknown project: ${id}`);
  reg.active = id;
  await writeRegistry(reg);
  setVaultRoot(match.path);
  return reg;
}

// Remove a project from the registry. NEVER deletes the folder on disk.
// Refuses to remove the active project (client must activate another first).
export async function deleteProject(id: string): Promise<ProjectsRegistry> {
  const reg = await getRegistry();
  if (reg.active === id) {
    throw new Error('cannot delete the active project — switch to another first');
  }
  const before = reg.projects.length;
  reg.projects = reg.projects.filter((p) => p.id !== id);
  if (reg.projects.length === before) {
    throw new Error(`unknown project: ${id}`);
  }
  await writeRegistry(reg);
  return reg;
}

// Quick utility so callers can surface the active project without re-reading
// the registry.
export function activeVaultPath(): string {
  return getVaultRoot();
}

// Sync check (used in rare places where we don't want await).
export function registryExistsSync(): boolean {
  try {
    return fsSync.existsSync(registryPath());
  } catch {
    return false;
  }
}
