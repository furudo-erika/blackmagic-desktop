'use client';

/**
 * /org — vault structure as an expandable tree.
 *
 * paperclip's OrgChart shows agent reporting lines; our equivalent is the
 * shape of the vault itself. Every top-level directory becomes a root node
 * with file counts; children are directories and .md files.
 *
 * Keeps the "everything is a file" story obvious and gives a compact
 * overview of the knowledge-base shape a chat-only UI can't.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Network,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  PageShell,
  PageHeader,
  EmptyState,
} from '../../components/ui/primitives';

/* ---------- tree model ---------- */

type TNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TNode[];
};

const ROOT_ORDER = [
  'us',
  'companies',
  'contacts',
  'deals',
  'drafts',
  'sequences',
  'triggers',
  'playbooks',
  'runs',
  'signals',
  'agents',
  'memory',
  'knowledge',
];

const ROOT_COLOR: Record<string, string> = {
  us: '#B06AB3',
  companies: '#E8523A',
  contacts: '#D4A65A',
  deals: '#7E8C67',
  drafts: '#8899BB',
  sequences: '#66A8A8',
  triggers: '#C97660',
  playbooks: '#66A8A8',
  runs: '#605A57',
  signals: '#9A8C6E',
  agents: '#B06AB3',
  memory: '#9A8C6E',
  knowledge: '#9A8C6E',
};

const ROOT_BLURB: Record<string, string> = {
  us: 'Who we are. Identity, ICP, tone.',
  companies: 'Accounts we know about.',
  contacts: 'People inside those accounts.',
  deals: 'Pipeline. open · closed-won · closed-lost.',
  drafts: 'Outbox — messages awaiting approval.',
  sequences: 'Multi-touch drips.',
  triggers: 'Cron + webhook entry points.',
  playbooks: 'Reusable agent recipes.',
  runs: 'Agent invocation logs.',
  signals: 'Passive intake: mentions, competitors, news.',
  agents: 'Role definitions for the LLM.',
  memory: 'Long-term notes.',
  knowledge: 'Reference material.',
};

function buildTree(paths: string[]): TNode[] {
  const roots = new Map<string, TNode>();
  for (const p of paths) {
    const parts = p.split('/').filter((s) => s.length > 0);
    if (parts.length === 0) continue;
    let level: TNode[] = [];
    let prefix = '';
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i] as string;
      prefix = prefix ? `${prefix}/${name}` : name;
      const isLeaf = i === parts.length - 1;
      if (i === 0) {
        let root = roots.get(name);
        if (!root) {
          root = { name, path: prefix, isDir: !isLeaf, children: [] };
          roots.set(name, root);
        }
        if (isLeaf) root.isDir = false;
        level = root.children;
        continue;
      }
      let node = level.find((c) => c.name === name);
      if (!node) {
        node = { name, path: prefix, isDir: !isLeaf, children: [] };
        level.push(node);
      } else if (!isLeaf) {
        node.isDir = true;
      }
      level = node.children;
    }
  }
  // Sort: dirs before files, alpha within
  function sortRec(list: TNode[]) {
    list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of list) if (n.children.length) sortRec(n.children);
  }
  const rootList = [...roots.values()];
  sortRec(rootList);
  // Apply ROOT_ORDER, append leftovers
  const ordered = [
    ...ROOT_ORDER.filter((k) => roots.has(k)).map((k) => roots.get(k)!),
    ...rootList.filter((n) => !ROOT_ORDER.includes(n.name)),
  ];
  return ordered;
}

function countLeaves(node: TNode): number {
  if (!node.isDir) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

/* ---------- Node component ---------- */

function TreeNode({
  node,
  depth,
  expanded,
  setExpanded,
}: {
  node: TNode;
  depth: number;
  expanded: Set<string>;
  setExpanded: (fn: (prev: Set<string>) => Set<string>) => void;
}) {
  const isOpen = expanded.has(node.path);
  const isRoot = depth === 0;
  const color = isRoot ? ROOT_COLOR[node.name] ?? '#605A57' : undefined;
  const leafCount = node.isDir ? countLeaves(node) : 0;

  function toggle() {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  }

  const rowPad = { paddingLeft: `${depth * 18}px` };

  if (!node.isDir) {
    // leaf file
    return (
      <Link
        href={`/vault?path=${encodeURIComponent(node.path)}`}
        className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-cream-light dark:hover:bg-[#17140F] text-ink/90 dark:text-[#E6E0D8]/90 transition-colors"
        style={rowPad}
      >
        <FileText className="w-3.5 h-3.5 text-muted dark:text-[#8C837C] shrink-0" />
        <span className="font-mono truncate">{node.name}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={
          'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors ' +
          (isRoot ? '' : 'text-[12px]')
        }
        style={rowPad}
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-muted dark:text-[#8C837C] shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted dark:text-[#8C837C] shrink-0" />
        )}
        {color ? (
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : isOpen ? (
          <FolderOpen className="w-3.5 h-3.5 text-muted dark:text-[#8C837C] shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-muted dark:text-[#8C837C] shrink-0" />
        )}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className={isRoot ? 'text-[13px] font-semibold text-ink dark:text-[#F5F1EA] font-mono' : 'font-mono'}>
            {node.name}
          </span>
          <span className="text-[10px] font-mono text-muted dark:text-[#8C837C]">
            {leafCount} {leafCount === 1 ? 'file' : 'files'}
          </span>
          {isRoot && ROOT_BLURB[node.name] && (
            <span className="hidden md:inline text-[11px] text-muted dark:text-[#8C837C] truncate">
              · {ROOT_BLURB[node.name]}
            </span>
          )}
        </div>
      </button>
      {isOpen && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */

export default function OrgPage() {
  const tree = useQuery({ queryKey: ['vault-tree'], queryFn: api.vaultTree, staleTime: 30_000 });

  // Expand top-level roots by default.
  const defaultExpanded = useMemo(() => {
    const s = new Set<string>();
    for (const k of ROOT_ORDER) s.add(k);
    return s;
  }, []);
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  const roots = useMemo(() => {
    const paths = tree.data?.tree.map((f) => f.path) ?? [];
    return buildTree(paths);
  }, [tree.data]);

  const totals = useMemo(() => {
    let files = 0;
    let dirs = 0;
    for (const r of roots) {
      files += countLeaves(r);
      dirs += 1;
    }
    return { files, dirs };
  }, [roots]);

  return (
    <PageShell>
      <PageHeader
        title="Org tree"
        subtitle="The shape of your vault. Everything the agent reads, writes, or indexes lives under one of these folders."
        icon={Network}
        trailing={
          <span className="text-[11px] font-mono text-muted dark:text-[#8C837C]">
            {totals.files} files · {roots.length} roots
          </span>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {tree.isLoading && (
            <div className="text-sm text-muted dark:text-[#8C837C]">loading…</div>
          )}
          {tree.error && (
            <div className="text-sm text-flame">{(tree.error as Error).message}</div>
          )}
          {!tree.isLoading && roots.length === 0 && (
            <EmptyState
              icon={Network}
              title="Empty vault."
              hint="Ask the chat to do something — companies, contacts, and deals will show up here as the agent writes them."
            />
          )}
          {roots.length > 0 && (
            <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl overflow-hidden divide-y divide-line dark:divide-[#2A241D]">
              {roots.map((n) => (
                <TreeNode
                  key={n.path}
                  node={n}
                  depth={0}
                  expanded={expanded}
                  setExpanded={setExpanded}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
