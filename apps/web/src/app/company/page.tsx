'use client';

/**
 * /company — the org chart for your AI-only company.
 *
 * Reads every `agents/*.md` file, groups them by `team:` frontmatter
 * (default GTM), and renders one card per team with the employees'
 * faces, names, and roles. From here the operator can:
 *
 * - Click any employee → /agents?slug=<slug>
 * - Click "Add team" → creates a new agent stub in a new team folder
 * - Click "Add employee" inside a team → creates a stub assigned to that team
 *
 * No real backend changes required: a "team" is just the value of
 * the `team:` frontmatter on agent files, so adding a team is the
 * same operation as adding an employee.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Sparkles,
  UserPlus,
  Users,
  X,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmployeeFace } from '../../components/employee-face';

type Employee = {
  slug: string;
  name: string;
  role: string;
  team: string;
  faceSeed: string;
};

const TEAM_BLURBS: Record<string, string> = {
  GTM: 'Pipeline, outbound, research, brand. Closes revenue without a human in the loop.',
  Engineering: 'Code review, on-call triage, deploys, release notes. Self-merging green builds.',
  'Customer Success': 'Onboarding, support inbox, churn rescue, health scoring.',
  Customer: 'Onboarding, support inbox, churn rescue, health scoring.',
  Finance: 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  'Finance & Ops': 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  People: 'Sourcing, screening, interview scheduling, onboarding kits.',
  Legal: 'Contract review, NDA turnaround, vendor risk, compliance flags.',
  Product: 'User research, spec drafting, release narratives.',
};

function blurbFor(team: string): string {
  return TEAM_BLURBS[team] ?? 'Custom team — define what they own.';
}

function roleFromName(name: string): string {
  return name.replace(/\s*Agent$/i, '').trim() || name;
}

export default function CompanyPage() {
  const qc = useQueryClient();
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<string | null>(null);

  const employeesQ = useQuery({
    queryKey: ['company-employees'],
    queryFn: async (): Promise<Employee[]> => {
      const tree = await api.contextTree();
      const files = tree.tree.filter(
        (f) => f.type === 'file' && f.path.startsWith('agents/') && f.path.endsWith('.md'),
      );
      const rows = await Promise.all(files.map(async (f) => {
        const r = await api.readFile(f.path);
        const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
        const slug = f.path.replace(/^agents\//, '').replace(/\.md$/, '');
        const name = String(fm.name ?? slug);
        const team = String(fm.team ?? 'GTM');
        const faceSeed = String(fm.face_seed ?? slug);
        return {
          slug,
          name,
          role: roleFromName(name),
          team,
          faceSeed,
        };
      }));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const teams = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employeesQ.data ?? []) {
      const list = map.get(e.team) ?? [];
      list.push(e);
      map.set(e.team, list);
    }
    // GTM first; otherwise alpha.
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'GTM') return -1;
      if (b === 'GTM') return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [employeesQ.data]);

  const totalEmployees = (employeesQ.data ?? []).length;

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A] min-h-0 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-5 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center shrink-0">
            <Building2 className="w-4.5 h-4.5 text-flame" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] leading-tight font-semibold tracking-tight text-ink dark:text-[#F5F1EA]">
              Company
            </h1>
            <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-0.5">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'} · {totalEmployees}{' '}
              {totalEmployees === 1 ? 'employee' : 'employees'} · run with zero humans
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddTeamOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#37322F] text-white text-[12px] font-medium hover:bg-[#2A2520] dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Add team
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {employeesQ.isLoading ? (
            <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
              loading the org…
            </div>
          ) : teams.length === 0 ? (
            <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
              No employees yet. Add a team to get started.
            </div>
          ) : (
            <>
              {/* Top: tiny org spine — Company → Teams */}
              <div className="mb-6 flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted dark:text-[#8C837C]">
                <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] text-ink dark:text-[#F5F1EA]">
                  Company
                </span>
                <ChevronRight className="w-3 h-3" />
                <span>{teams.length} teams</span>
                <ChevronRight className="w-3 h-3" />
                <span>{totalEmployees} employees</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map(([teamName, members]) => (
                  <TeamCard
                    key={teamName}
                    name={teamName}
                    members={members}
                    onAddEmployee={() => setPendingTeam(teamName)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {addTeamOpen && (
        <AddTeamModal
          existingTeams={teams.map((t) => t[0])}
          onCancel={() => setAddTeamOpen(false)}
          onSuccess={() => {
            setAddTeamOpen(false);
            qc.invalidateQueries({ queryKey: ['company-employees'] });
            qc.invalidateQueries({ queryKey: ['sidebar-agents'] });
            qc.invalidateQueries({ queryKey: ['agents-meta'] });
          }}
        />
      )}

      {pendingTeam !== null && (
        <AddEmployeeModal
          team={pendingTeam}
          onCancel={() => setPendingTeam(null)}
          onSuccess={() => {
            setPendingTeam(null);
            qc.invalidateQueries({ queryKey: ['company-employees'] });
            qc.invalidateQueries({ queryKey: ['sidebar-agents'] });
            qc.invalidateQueries({ queryKey: ['agents-meta'] });
          }}
        />
      )}
    </div>
  );
}

function TeamCard({
  name,
  members,
  onAddEmployee,
}: {
  name: string;
  members: Employee[];
  onAddEmployee: () => void;
}) {
  return (
    <section className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-flame" />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-ink dark:text-[#F5F1EA] leading-tight">
              {name}
            </div>
            <div className="text-[11px] font-mono text-muted dark:text-[#8C837C] mt-0.5">
              {members.length} {members.length === 1 ? 'employee' : 'employees'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddEmployee}
          className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1"
          title="Add employee to this team"
        >
          <UserPlus className="w-3.5 h-3.5" />
          add
        </button>
      </div>

      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug">
        {blurbFor(name)}
      </p>

      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/agents?slug=${encodeURIComponent(m.slug)}`}
              className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-cream-light dark:hover:bg-[#17140F] transition-colors"
            >
              <EmployeeFace seed={m.faceSeed} name={m.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium text-ink dark:text-[#E6E0D8] truncate">
                  {m.name}
                </div>
                <div className="text-[10.5px] text-muted dark:text-[#8C837C] truncate font-mono">
                  {m.role}
                </div>
              </div>
              <ChevronRight className="w-3 h-3 text-muted/60 dark:text-[#6B625C]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddTeamModal({
  existingTeams,
  onCancel,
  onSuccess,
}: {
  existingTeams: string[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [teamName, setTeamName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const lower = new Set(existingTeams.map((t) => t.toLowerCase()));
  const dup = teamName.trim().length > 0 && lower.has(teamName.trim().toLowerCase());

  const create = useMutation({
    mutationFn: () => createEmployeeStub({
      team: teamName.trim(),
      employeeName: employeeName.trim() || 'New Employee',
    }),
    onSuccess,
  });

  const canSubmit = teamName.trim().length > 0 && !dup && !create.isPending;

  return (
    <Modal title="Add a team" onClose={onCancel}>
      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mb-4">
        Teams are folders of skill files with faces. Pick a name and your
        first employee — you can hire more later from the team card.
      </p>
      <Field label="Team name">
        <input
          autoFocus
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="e.g. Engineering, Customer Success, Finance"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        {dup && (
          <div className="mt-1 text-[11px] text-flame">
            That team already exists. Pick a different name or use "Add employee" on its card.
          </div>
        )}
      </Field>
      <Field label="First employee">
        <input
          value={employeeName}
          onChange={(e) => setEmployeeName(e.target.value)}
          placeholder="e.g. Code Reviewer"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        <div className="mt-1 text-[11px] text-muted dark:text-[#8C837C]">
          We'll seed an editable agent file at{' '}
          <code className="font-mono">agents/{slugify(employeeName || 'new-employee')}.md</code>.
        </div>
      </Field>
      {create.error && (
        <div className="mb-3 text-[11px] text-flame">
          {(create.error as Error).message}
        </div>
      )}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Creating…' : 'Create team'}
        confirmDisabled={!canSubmit}
      />
    </Modal>
  );
}

function AddEmployeeModal({
  team,
  onCancel,
  onSuccess,
}: {
  team: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [employeeName, setEmployeeName] = useState('');
  const create = useMutation({
    mutationFn: () => createEmployeeStub({
      team,
      employeeName: employeeName.trim() || 'New Employee',
    }),
    onSuccess,
  });
  const canSubmit = employeeName.trim().length > 0 && !create.isPending;
  return (
    <Modal title={`Hire into ${team}`} onClose={onCancel}>
      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mb-4">
        We'll write an editable agent stub. Open the file in /context to flesh
        out their tools and skills.
      </p>
      <Field label="Employee role / name">
        <input
          autoFocus
          value={employeeName}
          onChange={(e) => setEmployeeName(e.target.value)}
          placeholder="e.g. Bug Triage, Onboarding Specialist"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      {create.error && (
        <div className="mb-3 text-[11px] text-flame">
          {(create.error as Error).message}
        </div>
      )}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Hiring…' : 'Hire'}
        confirmDisabled={!canSubmit}
      />
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[94vw] bg-cream-light dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-line dark:border-[#2A241D]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-flame" />
            <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA]">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-[12px] text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA]"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-[#37322F] text-white hover:bg-[#2A2520] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'new-employee';
}

async function createEmployeeStub({
  team,
  employeeName,
}: {
  team: string;
  employeeName: string;
}): Promise<void> {
  const slug = slugify(employeeName);
  const path = `agents/${slug}.md`;
  const body = `---
kind: agent
name: ${employeeName}
slug: ${slug}
team: ${team}
icon: Bot
face_seed: ${slug}
model: gpt-5.5
revision: 1
tools:
  - read_file
  - write_file
  - list_dir
  - grep
temperature: 0.3
---

You are ${employeeName} on the ${team} team. Replace this prompt with the
specific job-to-be-done for this employee — the tools they should reach for,
the files they read, the deliverables they produce.

## Default behavior

- Read the relevant context files first.
- Act with the tools you have; never halt for permission.
- End every run with a 3–5 bullet summary.
`;
  await api.writeFile(path, body);
}
