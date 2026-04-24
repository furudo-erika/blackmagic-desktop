'use client';

/**
 * EntityDetail — Multica-style right-rail + activity-feed layout for any
 * context entity (company / contact / deal). Props receive the entity's
 * context path + prebuilt header content; this component handles:
 *   - Properties right rail (Assignee only for V1 — Status/Priority pickers
 *     are shaped as TODO placeholders until those fields exist)
 *   - AgentLiveCard for the entity's currently-running agent runs
 *   - TaskRunHistory of past runs scoped to this entity
 *   - Activity feed (comments + assign events + run events)
 *   - Comment composer with @-mention → agent trigger
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Bot,
  ChevronDown,
  MessageSquare,
  UserCheck,
  Play,
  Loader2,
  Check,
  AlertCircle,
  ChevronRight,
  X,
} from 'lucide-react';
import { api, type EntityActivityEntry, type EntityAssignee } from '../lib/api';

type Member = { id: string; name: string };

// V1: members come from a stubbed list (just "You" for single-user). Later
// this will read from context `team/*.md` files or an auth layer.
const MEMBERS: Member[] = [{ id: 'me', name: 'You' }];

export function EntityDetail({
  entityPath,
  title,
  subtitle,
  breadcrumbs,
  headerRight,
  children,
}: {
  entityPath: string;
  title: React.ReactNode;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 px-6 py-6 max-w-[1280px] mx-auto">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="text-[12px] text-muted dark:text-[#8C837C] mb-3 flex items-center gap-1.5">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {b.href ? (
                  <Link href={b.href} className="hover:text-ink dark:hover:text-[#F5F1EA] transition-colors">{b.label}</Link>
                ) : (
                  <span>{b.label}</span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 opacity-40" />}
              </span>
            ))}
          </nav>
        )}
        <header className="mb-5">
          <h1 className="text-[22px] font-semibold text-ink dark:text-[#F5F1EA] leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted dark:text-[#8C837C] mt-1 leading-snug">{subtitle}</p>}
        </header>

        <AgentLiveCard entityPath={entityPath} />
        {children}
        <div className="mt-6">
          <ActivityFeed entityPath={entityPath} />
        </div>
        <div className="mt-6">
          <TaskRunHistory entityPath={entityPath} />
        </div>
      </div>

      <aside className="min-w-0">
        <PropertiesRail entityPath={entityPath} trailing={headerRight} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Properties right rail — Assignee picker with MEMBERS / AGENTS split.
// ---------------------------------------------------------------------------
function PropertiesRail({ entityPath, trailing }: { entityPath: string; trailing?: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-4 sticky top-4">
      <header className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3">
        <ChevronDown className="w-3 h-3" />
        <span>Properties</span>
      </header>
      <div className="space-y-3">
        <PropRow label="Assignee">
          <AssigneePicker entityPath={entityPath} />
        </PropRow>
        {trailing}
      </div>
    </section>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
      <span className="text-[11px] text-muted dark:text-[#8C837C]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssigneePicker — MEMBERS / AGENTS split dropdown. Matches Multica's
// picker shape (sections + searchable rows). Setting an agent triggers
// an immediate run scoped to this entity.
// ---------------------------------------------------------------------------
function AssigneePicker({ entityPath }: { entityPath: string }) {
  const qc = useQueryClient();
  const assignee = useQuery({
    queryKey: ['entity-assignee', entityPath],
    queryFn: () => api.entityAssignee(entityPath),
  });
  const agents = useQuery({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const tree = await api.contextTree();
      const files = tree.tree.filter((f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'));
      const rows = await Promise.all(files.map(async (f) => {
        const r = await api.readFile(f.path);
        const fm = r.frontmatter ?? {};
        const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
        const name = typeof fm.name === 'string' ? fm.name : slug;
        return { slug, name };
      }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const setMut = useMutation({
    mutationFn: (a: EntityAssignee) => api.entitySetAssignee({ path: entityPath, assignee: a }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-assignee', entityPath] });
      qc.invalidateQueries({ queryKey: ['entity-activity', entityPath] });
      qc.invalidateQueries({ queryKey: ['entity-runs', entityPath] });
      setOpen(false);
      setQuery('');
    },
  });

  const current = assignee.data?.assignee ?? { type: null, id: null };
  const q = query.trim().toLowerCase();
  const filteredMembers = MEMBERS.filter((m) => !q || m.name.toLowerCase().includes(q));
  const filteredAgents = (agents.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] hover:bg-cream dark:hover:bg-[#0F0D0A] transition-colors"
      >
        {current.type === 'agent' ? <Bot className="w-3.5 h-3.5 text-flame" /> : current.type === 'member' ? <UserCheck className="w-3.5 h-3.5 text-ink dark:text-[#E6E0D8]" /> : <span className="w-3.5 h-3.5 rounded-full border border-dashed border-muted dark:border-[#6B625C]" />}
        <span className={current.id ? 'text-ink dark:text-[#E6E0D8]' : 'text-muted dark:text-[#8C837C]'}>
          {current.name ?? current.id ?? 'Unassigned'}
        </span>
        <ChevronDown className="w-3 h-3 text-muted/60 dark:text-[#6B625C] ml-auto" />
      </button>
      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1.5 border-b border-line dark:border-[#2A241D]">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Assign to…"
              className="w-full bg-transparent text-[12px] text-ink dark:text-[#E6E0D8] focus:outline-none"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            <PickerRow
              icon={<X className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />}
              label="Unassigned"
              onClick={() => setMut.mutate({ type: null, id: null })}
              selected={!current.id}
            />
            {filteredMembers.length > 0 && (
              <>
                <PickerSection label="Members" />
                {filteredMembers.map((m) => (
                  <PickerRow
                    key={`m-${m.id}`}
                    icon={<span className="w-4 h-4 rounded-full bg-ink/10 dark:bg-[#3A322A] text-[9px] font-semibold text-ink dark:text-[#F5F1EA] flex items-center justify-center uppercase">{m.name[0]}</span>}
                    label={m.name}
                    onClick={() => setMut.mutate({ type: 'member', id: m.id, name: m.name })}
                    selected={current.type === 'member' && current.id === m.id}
                  />
                ))}
              </>
            )}
            {filteredAgents.length > 0 && (
              <>
                <PickerSection label="Agents" />
                {filteredAgents.map((a) => (
                  <PickerRow
                    key={`a-${a.slug}`}
                    icon={<Bot className="w-3.5 h-3.5 text-flame" />}
                    label={a.name}
                    sublabel={a.slug}
                    onClick={() => setMut.mutate({ type: 'agent', id: a.slug, name: a.name })}
                    selected={current.type === 'agent' && current.id === a.slug}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PickerSection({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#6B625C]">
      {label}
    </div>
  );
}

function PickerRow({
  icon,
  label,
  sublabel,
  onClick,
  selected,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ' +
        (selected ? 'bg-flame/10 text-ink dark:text-[#F5F1EA]' : 'text-ink dark:text-[#E6E0D8] hover:bg-cream dark:hover:bg-[#0F0D0A]')
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {sublabel && <span className="ml-auto truncate text-[10px] font-mono text-muted dark:text-[#8C837C]">{sublabel}</span>}
      {selected && <Check className="w-3 h-3 text-flame ml-auto" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// AgentLiveCard — running agent runs scoped to this entity.
// ---------------------------------------------------------------------------
function AgentLiveCard({ entityPath }: { entityPath: string }) {
  const runs = useQuery({
    queryKey: ['entity-runs', entityPath],
    queryFn: () => api.entityRuns(entityPath),
    refetchInterval: 3_000,
  });
  // A run is "live" if the listed metadata indicates it's still going.
  // The daemon writes meta.json at run completion; absence of `done` in
  // /api/entity/runs means the meta isn't finalized yet.
  // entityRuns reads from meta.json so items here are always complete —
  // for live feedback we fall back to listRuns() which carries `done`.
  const globalRuns = useQuery({
    queryKey: ['runs'],
    queryFn: api.listRuns,
    refetchInterval: 3_000,
  });

  const entityRunIds = new Set((runs.data?.runs ?? []).map((r) => r.runId));
  const liveForEntity = (globalRuns.data?.runs ?? []).filter((r) => entityRunIds.has(r.runId) && !r.done);

  if (liveForEntity.length === 0) return null;

  return (
    <div className="space-y-2 mb-5">
      {liveForEntity.map((r) => (
        <div key={r.runId} className="bg-white dark:bg-[#1F1B15] border border-flame/40 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-flame animate-spin" />
            <span className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA]">
              {r.agent}
            </span>
            <span className="text-[11px] text-muted dark:text-[#8C837C]">
              is working…
            </span>
            <Link
              href={`/runs/${encodeURIComponent(r.runId)}`}
              className="ml-auto text-[11px] text-flame hover:underline"
            >
              Open run →
            </Link>
          </div>
          <div className="mt-1.5 text-[11px] font-mono text-muted dark:text-[#8C837C] flex gap-3">
            <span>turns: {r.turns ?? 0}</span>
            <span>tools: {r.toolCalls ?? 0}</span>
            <span>in: {r.tokensIn ?? 0}</span>
            <span>out: {r.tokensOut ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskRunHistory — past runs for this entity, collapsible.
// ---------------------------------------------------------------------------
function TaskRunHistory({ entityPath }: { entityPath: string }) {
  const runs = useQuery({
    queryKey: ['entity-runs', entityPath],
    queryFn: () => api.entityRuns(entityPath),
    refetchInterval: 10_000,
  });
  const [open, setOpen] = useState(false);

  const list = runs.data?.runs ?? [];
  if (list.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] mb-2"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Run history · {list.length}
      </button>
      {open && (
        <div className="border border-line dark:border-[#2A241D] rounded-lg overflow-hidden">
          {list.map((r, i) => (
            <Link
              key={r.runId}
              href={`/runs/${encodeURIComponent(r.runId)}`}
              className={
                'block px-3 py-2 text-[12px] flex items-center gap-2 ' +
                (i > 0 ? 'border-t border-line dark:border-[#2A241D] ' : '') +
                'hover:bg-cream dark:hover:bg-[#0F0D0A] transition-colors'
              }
            >
              <Check className="w-3.5 h-3.5 text-[#7E8C67] shrink-0" />
              <span className="font-semibold text-ink dark:text-[#F5F1EA]">{r.agent}</span>
              <span className="text-muted dark:text-[#8C837C] truncate flex-1">{r.preview ?? '—'}</span>
              <span className="text-[10px] font-mono text-muted dark:text-[#6B625C] shrink-0">
                {r.toolCalls ?? 0} tools · ${((r.costCents ?? 0) / 100).toFixed(2)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeed — comments + assign events + run events. Supports threading
// (comments with parent_id appear nested under their parent).
// ---------------------------------------------------------------------------
function ActivityFeed({ entityPath }: { entityPath: string }) {
  const qc = useQueryClient();
  const activity = useQuery({
    queryKey: ['entity-activity', entityPath],
    queryFn: () => api.entityActivity(entityPath),
    refetchInterval: 5_000,
  });
  const [replyingTo, setReplyingTo] = useState<string | undefined>(undefined);
  const [body, setBody] = useState('');
  const commentMut = useMutation({
    mutationFn: () => api.entityComment({ path: entityPath, body, parent_id: replyingTo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entity-activity', entityPath] });
      qc.invalidateQueries({ queryKey: ['entity-runs', entityPath] });
      setBody('');
      setReplyingTo(undefined);
    },
  });

  const { roots, repliesByParent } = useMemo(() => {
    const list = activity.data?.entries ?? [];
    const rootsList: EntityActivityEntry[] = [];
    const map = new Map<string, EntityActivityEntry[]>();
    for (const e of list) {
      if (e.parent_id) {
        const arr = map.get(e.parent_id) ?? [];
        arr.push(e);
        map.set(e.parent_id, arr);
      } else {
        rootsList.push(e);
      }
    }
    return { roots: rootsList, repliesByParent: map };
  }, [activity.data]);

  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-3 flex items-center gap-2">
        <span>Activity</span>
      </h2>
      {roots.length === 0 && <div className="text-[12px] text-muted dark:text-[#8C837C]">Nothing yet.</div>}
      <div className="space-y-3">
        {roots.map((e) => (
          <ActivityRow
            key={e.id}
            entry={e}
            replies={repliesByParent.get(e.id) ?? []}
            onReply={(id) => setReplyingTo(id)}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-line dark:border-[#2A241D] pt-3">
        {replyingTo && (
          <div className="text-[11px] text-muted dark:text-[#8C837C] mb-2 flex items-center gap-2">
            Replying · <button className="underline" onClick={() => setReplyingTo(undefined)}>cancel</button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a comment. @agent-slug to loop an agent in."
          rows={3}
          className="w-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg px-3 py-2 text-[13px] text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame resize-none"
        />
        <div className="flex items-center gap-2 mt-2 justify-end">
          <button
            onClick={() => commentMut.mutate()}
            disabled={!body.trim() || commentMut.isPending}
            className="h-8 px-3 rounded-md bg-flame text-white text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {commentMut.isPending ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ActivityRow({
  entry,
  replies,
  onReply,
}: {
  entry: EntityActivityEntry;
  replies: EntityActivityEntry[];
  onReply: (id: string) => void;
}) {
  const isAgent = entry.author.type === 'agent';
  const isSystem = entry.author.type === 'system';
  const when = new Date(entry.ts);
  const relTime = formatRelative(when);
  const icon = isAgent ? <Bot className="w-4 h-4 text-flame" /> : isSystem ? <Sparkle /> : <Initials name={entry.author.name ?? entry.author.id} />;

  // Non-comment entries get inline compact rendering.
  if (entry.kind !== 'comment') {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted dark:text-[#8C837C]">
        {icon}
        <span className="font-medium text-ink dark:text-[#E6E0D8]">{entry.author.name ?? entry.author.id}</span>
        <span className="truncate">{entry.content}</span>
        <span className="ml-auto shrink-0 text-[11px] font-mono">{relTime}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 pt-0.5">{icon}</div>
        <div className="min-w-0 flex-1 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl px-3.5 py-2.5">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA]">
              {entry.author.name ?? entry.author.id}
            </span>
            <span className="text-[11px] text-muted dark:text-[#8C837C]">{relTime}</span>
            <button
              onClick={() => onReply(entry.id)}
              className="ml-auto text-[11px] text-muted dark:text-[#8C837C] hover:text-flame"
            >
              Reply
            </button>
          </div>
          <CommentBody body={entry.content ?? ''} />
          {entry.mentions && entry.mentions.length > 0 && (
            <div className="mt-1.5 text-[10px] font-mono text-muted dark:text-[#8C837C]">
              @ {entry.mentions.join(' @')}
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="pl-10 mt-2 space-y-2">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-2.5">
              <div className="shrink-0 pt-0.5">
                {r.author.type === 'agent' ? <Bot className="w-3.5 h-3.5 text-flame" /> : <Initials name={r.author.name ?? r.author.id} small />}
              </div>
              <div className="min-w-0 flex-1 bg-cream/60 dark:bg-[#0F0D0A]/60 border border-line/50 dark:border-[#2A241D]/50 rounded-lg px-3 py-2">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-ink dark:text-[#F5F1EA]">
                    {r.author.name ?? r.author.id}
                  </span>
                  <span className="text-[10.5px] text-muted dark:text-[#8C837C]">{formatRelative(new Date(r.ts))}</span>
                </div>
                <CommentBody body={r.content ?? ''} small />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sparkle() {
  return <span className="w-4 h-4 rounded-full bg-muted/30 dark:bg-[#8C837C]/30 text-[10px] text-muted dark:text-[#6B625C] flex items-center justify-center">·</span>;
}

function Initials({ name, small }: { name: string; small?: boolean }) {
  const letters = (name || '?').split(/\s+/).map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
  return (
    <span
      className={
        'rounded-full bg-ink/10 dark:bg-[#3A322A] text-ink dark:text-[#F5F1EA] font-semibold flex items-center justify-center ' +
        (small ? 'w-3.5 h-3.5 text-[8px]' : 'w-4 h-4 text-[9px]')
      }
    >
      {letters}
    </span>
  );
}

function CommentBody({ body, small }: { body: string; small?: boolean }) {
  // Highlight @mentions inline.
  const parts = body.split(/(@[a-z0-9-]+)/gi);
  return (
    <div className={'whitespace-pre-wrap leading-snug ' + (small ? 'text-[12px]' : 'text-[13px]') + ' text-ink dark:text-[#E6E0D8]'}>
      {parts.map((p, i) =>
        p.startsWith('@')
          ? <span key={i} className="text-flame font-medium">{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </div>
  );
}

function formatRelative(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toISOString().slice(0, 10);
}
