'use client';

/**
 * /company — editable org chart for the Black Magic AI company.
 *
 * This intentionally merges the old Company team grid and Chart page into one
 * surface. Agents still live in `agents/*.md`; the editable fields are the
 * frontmatter values Black Magic already uses: `name`, `team`, `face_seed`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Building2,
  Check,
  ChevronRight,
  GripVertical,
  Maximize2,
  Minus,
  Network,
  Plus,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmployeeFace } from '../../components/employee-face';

type Employee = {
  slug: string;
  path: string;
  name: string;
  role: string;
  team: string;
  faceSeed: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

const TEAM_BLURBS: Record<string, string> = {
  GTM: 'Pipeline, outbound, research, brand.',
  Engineering: 'Code review, on-call triage, deploys, release notes.',
  'Customer Success': 'Onboarding, support inbox, churn rescue, health scoring.',
  Customer: 'Onboarding, support inbox, churn rescue, health scoring.',
  Finance: 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  'Finance & Ops': 'Bookkeeping, AR chasing, expense review, runway forecasting.',
  People: 'Sourcing, screening, interview scheduling, onboarding kits.',
  Legal: 'Contract review, NDA turnaround, vendor risk, compliance flags.',
  Product: 'User research, spec drafting, release narratives.',
};

function blurbFor(team: string): string {
  return TEAM_BLURBS[team] ?? 'Custom team — define what this group owns.';
}

function roleFromName(name: string): string {
  return name.replace(/\s*Agent$/i, '').trim() || name;
}

function sortTeams(a: string, b: string): number {
  if (a === 'GTM') return -1;
  if (b === 'GTM') return 1;
  return a.localeCompare(b);
}

export default function CompanyPage() {
  const qc = useQueryClient();
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [dropTeam, setDropTeam] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const employeesQ = useQuery({
    queryKey: ['company-employees'],
    queryFn: loadEmployees,
  });

  const employees = employeesQ.data ?? [];
  const teams = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const employee of employees) {
      const list = map.get(employee.team) ?? [];
      list.push(employee);
      map.set(employee.team, list);
    }
    return Array.from(map.entries())
      .map(([team, members]) => [team, members.sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort(([a], [b]) => sortTeams(a, b));
  }, [employees]);

  const selected = selectedSlug ? employees.find((employee) => employee.slug === selectedSlug) ?? null : null;

  const invalidateOrg = () => {
    qc.invalidateQueries({ queryKey: ['company-employees'] });
    qc.invalidateQueries({ queryKey: ['chart-employees'] });
    qc.invalidateQueries({ queryKey: ['standup-employees'] });
    qc.invalidateQueries({ queryKey: ['sidebar-agents'] });
    qc.invalidateQueries({ queryKey: ['agents-meta'] });
  };

  const updateEmployee = useMutation({
    mutationFn: saveEmployee,
    onSuccess: invalidateOrg,
  });

  const moveEmployee = useMutation({
    mutationFn: async ({ slug, team }: { slug: string; team: string }) => {
      const employee = employees.find((row) => row.slug === slug);
      if (!employee || employee.team === team) return;
      await saveEmployee({ employee, patch: { team } });
    },
    onSuccess: invalidateOrg,
  });

  const totalEmployees = employees.length;

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A] min-h-0 overflow-hidden">
      <header className="shrink-0 border-b border-line dark:border-[#2A241D] px-6 py-4 bg-cream-light dark:bg-[#17140F]">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center shrink-0">
            <Network className="w-4.5 h-4.5 text-flame" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] leading-tight font-semibold tracking-tight text-ink dark:text-[#F5F1EA]">
              Company org chart
            </h1>
            <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-0.5">
              {teams.length} {teams.length === 1 ? 'team' : 'teams'} · {totalEmployees}{' '}
              {totalEmployees === 1 ? 'employee' : 'employees'} · drag employees between teams, click to edit
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.1).toFixed(2))))}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Zoom out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Reset zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.3, Number((value + 0.1).toFixed(2))))}
              className="w-8 h-8 rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] flex items-center justify-center text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
              title="Zoom in"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAddTeamOpen(true)}
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#37322F] text-white text-[12px] font-medium hover:bg-[#2A2520] dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Add team
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden px-6 py-5">
        <div className="h-full max-w-7xl mx-auto grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <section className="min-h-0 overflow-auto bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl">
            {employeesQ.isLoading ? (
              <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">loading the org...</div>
            ) : teams.length === 0 ? (
              <div className="text-[13px] text-muted dark:text-[#8C837C] py-12 text-center">
                No employees yet. Add a team to get started.
              </div>
            ) : (
              <div className="min-w-[920px] p-6" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                <div className="flex justify-center">
                  <div className="rounded-xl border border-flame/30 bg-gradient-to-br from-flame/12 to-flame/[0.04] flex items-center gap-3 px-4 py-2.5 max-w-[300px]">
                    <EmployeeFace seed="ceo" name="CEO" size="md" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate leading-tight">
                        The Company
                      </div>
                      <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate leading-tight mt-0.5">
                        {teams.length} teams · {totalEmployees} employees
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-8 flex items-center justify-center">
                  <div className="w-px h-full bg-line dark:bg-[#2A241D]" />
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(teams.length, 6)}, minmax(150px, 1fr))` }}>
                  {teams.map(([teamName, members]) => (
                    <TeamColumn
                      key={teamName}
                      name={teamName}
                      members={members}
                      activeDrop={dropTeam === teamName}
                      selectedSlug={selectedSlug}
                      onAddEmployee={() => setPendingTeam(teamName)}
                      onSelect={setSelectedSlug}
                      onDragEnter={() => setDropTeam(teamName)}
                      onDragLeave={() => setDropTeam((current) => current === teamName ? null : current)}
                      onDrop={(slug) => {
                        setDropTeam(null);
                        moveEmployee.mutate({ slug, team: teamName });
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>

          <Inspector
            employee={selected}
            teams={teams.map(([team]) => team)}
            saving={updateEmployee.isPending}
            error={updateEmployee.error instanceof Error ? updateEmployee.error.message : null}
            onSave={(patch) => {
              if (!selected) return;
              updateEmployee.mutate({ employee: selected, patch });
            }}
          />
        </div>
      </div>

      {addTeamOpen && (
        <AddTeamModal
          existingTeams={teams.map((entry) => entry[0])}
          onCancel={() => setAddTeamOpen(false)}
          onSuccess={() => {
            setAddTeamOpen(false);
            invalidateOrg();
          }}
        />
      )}

      {pendingTeam !== null && (
        <AddEmployeeModal
          team={pendingTeam}
          onCancel={() => setPendingTeam(null)}
          onSuccess={() => {
            setPendingTeam(null);
            invalidateOrg();
          }}
        />
      )}
    </div>
  );
}

function TeamColumn({
  name,
  members,
  activeDrop,
  selectedSlug,
  onAddEmployee,
  onSelect,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  name: string;
  members: Employee[];
  activeDrop: boolean;
  selectedSlug: string | null;
  onAddEmployee: () => void;
  onSelect: (slug: string) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (slug: string) => void;
}) {
  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        const slug = event.dataTransfer.getData('text/plain');
        if (slug) onDrop(slug);
      }}
      className={
        'rounded-xl border p-3 min-h-[220px] transition-colors ' +
        (activeDrop
          ? 'border-flame/60 bg-flame/[0.06]'
          : 'border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]')
      }
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{name}</div>
          <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C]">{members.length} employees</div>
        </div>
        <button
          type="button"
          onClick={onAddEmployee}
          className="text-[11px] text-muted dark:text-[#8C837C] hover:text-flame inline-flex items-center gap-1 shrink-0"
          title="Add employee to this team"
        >
          <UserPlus className="w-3.5 h-3.5" />
          add
        </button>
      </div>
      <p className="text-[11px] text-muted dark:text-[#8C837C] leading-snug min-h-[34px] mb-3">{blurbFor(name)}</p>
      <div className="space-y-2">
        {members.map((member) => (
          <button
            key={member.slug}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', member.slug);
            }}
            onClick={() => onSelect(member.slug)}
            className={
              'w-full text-left rounded-lg border px-2.5 py-2 flex items-center gap-2 transition-colors ' +
              (selectedSlug === member.slug
                ? 'border-flame/50 bg-white dark:bg-[#1F1B15]'
                : 'border-transparent bg-white/70 dark:bg-[#1F1B15]/70 hover:border-flame/30')
            }
          >
            <GripVertical className="w-3.5 h-3.5 text-muted/60 dark:text-[#6B625C] shrink-0" />
            <EmployeeFace seed={member.faceSeed} name={member.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-ink dark:text-[#E6E0D8] truncate">{member.name}</div>
              <div className="text-[10px] font-mono text-muted dark:text-[#8C837C] truncate">{member.role}</div>
            </div>
            <ChevronRight className="w-3 h-3 text-muted/60 dark:text-[#6B625C]" />
          </button>
        ))}
      </div>
    </section>
  );
}

function Inspector({
  employee,
  teams,
  saving,
  error,
  onSave,
}: {
  employee: Employee | null;
  teams: string[];
  saving: boolean;
  error: string | null;
  onSave: (patch: Partial<Pick<Employee, 'name' | 'team' | 'faceSeed'>>) => void;
}) {
  const [draft, setDraft] = useState({ name: '', team: '', faceSeed: '' });
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);

  if (employee && employee.slug !== loadedSlug) {
    setLoadedSlug(employee.slug);
    setDraft({ name: employee.name, team: employee.team, faceSeed: employee.faceSeed });
  }

  if (!employee) {
    return (
      <aside className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5">
        <div className="w-10 h-10 rounded-lg bg-flame/10 border border-flame/20 flex items-center justify-center mb-3">
          <Bot className="w-4 h-4 text-flame" />
        </div>
        <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA]">Select an employee</div>
        <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mt-1">
          Click a card to edit its name, team, and avatar seed. Drag cards between teams to update the org.
        </p>
      </aside>
    );
  }

  const dirty = draft.name !== employee.name || draft.team !== employee.team || draft.faceSeed !== employee.faceSeed;

  return (
    <aside className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl p-5 overflow-y-auto">
      <div className="flex items-center gap-3 mb-5">
        <EmployeeFace seed={draft.faceSeed || employee.faceSeed} name={draft.name || employee.name} size="lg" ring />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink dark:text-[#F5F1EA] truncate">{employee.name}</div>
          <div className="text-[10.5px] font-mono text-muted dark:text-[#8C837C] truncate">{employee.path}</div>
        </div>
      </div>

      <Field label="Name">
        <input
          value={draft.name}
          onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      <Field label="Team">
        <input
          value={draft.team}
          list="blackmagic-teams"
          onChange={(event) => setDraft((value) => ({ ...value, team: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        <datalist id="blackmagic-teams">
          {teams.map((team) => <option key={team} value={team} />)}
        </datalist>
      </Field>
      <Field label="Avatar seed">
        <input
          value={draft.faceSeed}
          onChange={(event) => setDraft((value) => ({ ...value, faceSeed: event.target.value }))}
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        <div className="mt-1 text-[11px] text-muted dark:text-[#8C837C]">
          Changing this changes the generated face. Keep it stable once users recognize the employee.
        </div>
      </Field>

      {error && <div className="mb-3 text-[11px] text-flame">{error}</div>}

      <button
        type="button"
        disabled={!dirty || saving || !draft.name.trim() || !draft.team.trim()}
        onClick={() => onSave({
          name: draft.name.trim(),
          team: draft.team.trim(),
          faceSeed: draft.faceSeed.trim() || employee.slug,
        })}
        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium bg-[#37322F] text-white hover:bg-[#2A2520] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#F5F1EA] dark:text-[#17140F] dark:hover:bg-white"
      >
        <Check className="w-3.5 h-3.5" />
        {saving ? 'Saving...' : dirty ? 'Save employee' : 'Saved'}
      </button>

      <Link
        href={`/agents?slug=${encodeURIComponent(employee.slug)}`}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-medium border border-line dark:border-[#2A241D] text-muted hover:text-ink dark:hover:text-[#F5F1EA]"
      >
        Open cockpit
      </Link>
    </aside>
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
  const lower = new Set(existingTeams.map((team) => team.toLowerCase()));
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
        A team is stored as the `team:` value in each employee's agent file.
      </p>
      <Field label="Team name">
        <input
          autoFocus
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="e.g. Engineering, Customer Success, Finance"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
        {dup && <div className="mt-1 text-[11px] text-flame">That team already exists.</div>}
      </Field>
      <Field label="First employee">
        <input
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          placeholder="e.g. Code Reviewer"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      {create.error && <div className="mb-3 text-[11px] text-flame">{(create.error as Error).message}</div>}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Creating...' : 'Create team'}
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
  return (
    <Modal title={`Hire into ${team}`} onClose={onCancel}>
      <p className="text-[12px] text-muted dark:text-[#8C837C] leading-snug mb-4">
        This writes a new editable agent markdown file.
      </p>
      <Field label="Employee role / name">
        <input
          autoFocus
          value={employeeName}
          onChange={(event) => setEmployeeName(event.target.value)}
          placeholder="e.g. Bug Triage, Onboarding Specialist"
          className="w-full px-3 py-2 text-[13px] rounded-md border border-line dark:border-[#2A241D] bg-white dark:bg-[#17140F] text-ink dark:text-[#F5F1EA] focus:outline-none focus:border-flame"
        />
      </Field>
      {create.error && <div className="mb-3 text-[11px] text-flame">{(create.error as Error).message}</div>}
      <ModalActions
        onCancel={onCancel}
        onConfirm={() => create.mutate()}
        confirmLabel={create.isPending ? 'Hiring...' : 'Hire'}
        confirmDisabled={employeeName.trim().length === 0 || create.isPending}
      />
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[440px] max-w-[94vw] bg-cream-light dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
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

async function loadEmployees(): Promise<Employee[]> {
  const tree = await api.contextTree();
  const files = tree.tree.filter(
    (file) => file.type === 'file' && file.path.startsWith('agents/') && file.path.endsWith('.md'),
  );
  const rows = await Promise.all(files.map(async (file) => {
    const record = await api.readFile(file.path);
    const fm = (record.frontmatter ?? {}) as Record<string, unknown>;
    const slug = file.path.replace(/^agents\//, '').replace(/\.md$/, '');
    const name = String(fm.name ?? slug);
    const team = String(fm.team ?? 'GTM');
    const faceSeed = String(fm.face_seed ?? slug);
    return {
      slug,
      path: file.path,
      name,
      role: roleFromName(name),
      team,
      faceSeed,
      frontmatter: fm,
      body: record.body,
    };
  }));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function saveEmployee({
  employee,
  patch,
}: {
  employee: Employee;
  patch: Partial<Pick<Employee, 'name' | 'team' | 'faceSeed'>>;
}): Promise<void> {
  const frontmatter = {
    ...employee.frontmatter,
    name: patch.name ?? employee.name,
    team: patch.team ?? employee.team,
    face_seed: patch.faceSeed ?? employee.faceSeed,
  };
  await api.writeFile(employee.path, serializeMarkdown(frontmatter, employee.body));
}

function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const lines = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\n+/, '')}`;
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatYamlValue).join(', ')}]`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (/^[A-Za-z0-9_.@/ -]+$/.test(text) && !/^\s|\s$/.test(text)) return text;
  return JSON.stringify(text);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
specific job-to-be-done for this employee: the tools they should reach for,
the files they read, the deliverables they produce.

## Default behavior

- Read the relevant context files first.
- Act with the tools you have; never halt for permission.
- End every run with a 3-5 bullet summary.
`;
  await api.writeFile(path, body);
}
