'use client';

/**
 * Unified chat composer used on Home and /chat.
 *
 * The rounded card, textarea, and footer layout match what the user
 * calls "the home design". On top we add:
 *
 *   - `@<query>`   inline popover to loop in another agent (by slug)
 *   - `/<query>`   inline popover for slash commands (/clear, /skills…)
 *   - an agent pill on the left of the footer — click to swap the
 *     agent that will answer. Replaces the old floating Agents grid
 *     that shipped in the empty state of /chat.
 *
 * Caller owns the input value + agent state so the same component
 * can be reused without internal coupling. Home passes no agent state
 * and the pill becomes a "Choose agent" CTA.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, ChevronDown, Check } from 'lucide-react';
import { AgentIcon } from './agent-icon';

export type ComposerAgent = {
  slug: string;
  name: string;
  tagline?: string;
};

export type ComposerSlashCommand = {
  name: string;      // "/clear"
  hint: string;      // short description
  action: string;    // caller-defined key — fired via onSlashCommand
};

type PopoverState =
  | { kind: 'mention'; query: string; anchor: number; index: number }
  | { kind: 'slash';   query: string; anchor: number; index: number }
  | null;

export function Composer({
  value,
  onChange,
  onSubmit,
  agents,
  agentSlug,
  onAgentChange,
  slashCommands = DEFAULT_SLASH,
  onSlashCommand,
  placeholder = 'Ask, plan, automate…  ( @ to loop in another agent · / for commands )',
  disabled = false,
  submitLabel = 'Send',
  showKeyboardHints = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  agents: ComposerAgent[];
  agentSlug?: string;
  onAgentChange?: (slug: string | undefined) => void;
  slashCommands?: ComposerSlashCommand[];
  onSlashCommand?: (action: string) => void;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  showKeyboardHints?: boolean;
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const agentBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 320);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > 320 ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Close the agent menu on outside click.
  useEffect(() => {
    if (!agentMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (!agentBtnRef.current) return;
      const container = agentBtnRef.current.parentElement;
      if (container && !container.contains(e.target as Node)) setAgentMenuOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [agentMenuOpen]);

  function detectPopover(v: string, cursor: number): PopoverState {
    let i = cursor - 1;
    while (i >= 0) {
      const c = v[i]!;
      if (c === '@' || c === '/') {
        if (i === 0 || /\s/.test(v[i - 1]!)) {
          const query = v.slice(i + 1, cursor);
          if (/\s/.test(query)) return null;
          return { kind: c === '@' ? 'mention' : 'slash', query, anchor: i, index: 0 };
        }
        return null;
      }
      if (/\s/.test(c)) return null;
      i--;
    }
    return null;
  }

  const popoverItems: Array<{ label: string; sublabel?: string; insert: string; action?: string }> = useMemo(() => {
    if (!popover) return [];
    if (popover.kind === 'mention') {
      const q = popover.query.toLowerCase();
      return agents
        .filter((a) => !q || a.slug.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((a) => ({ label: a.name, sublabel: a.slug, insert: `@${a.slug}` }));
    }
    const q = popover.query.toLowerCase();
    return slashCommands
      .filter((c) => c.name.slice(1).toLowerCase().includes(q))
      .map((c) => ({ label: c.name, sublabel: c.hint, insert: c.name + ' ', action: c.action }));
  }, [popover, agents, slashCommands]);

  function applyChoice(choice: { insert: string; action?: string }) {
    if (!popover) return;
    if (popover.kind === 'slash' && choice.action) {
      if (choice.action === 'clear' || choice.action === 'skills') {
        onSlashCommand?.(choice.action);
        onChange('');
        setPopover(null);
        return;
      }
    }
    const before = value.slice(0, popover.anchor);
    const after = value.slice(popover.anchor + 1 + popover.query.length);
    const inserted = before + choice.insert + (after.startsWith(' ') ? '' : ' ') + after;
    onChange(inserted);
    setPopover(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = (before + choice.insert + ' ').length;
      el.setSelectionRange(pos, pos);
    });
  }

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
  }

  const currentAgent = agents.find((a) => a.slug === agentSlug) ?? null;

  return (
    <div className="bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-2xl shadow-sm overflow-visible relative">
      {popover && popoverItems.length > 0 && (
        <div className="absolute bottom-full mb-2 left-3 w-80 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg shadow-lg overflow-hidden z-30">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] border-b border-line dark:border-[#2A241D]">
            {popover.kind === 'mention' ? 'Loop in agent' : 'Slash commands'}
          </div>
          <ul className="max-h-[260px] overflow-y-auto py-1">
            {popoverItems.map((it, i) => (
              <li key={it.label}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyChoice(it); }}
                  onMouseEnter={() => setPopover((p) => (p ? { ...p, index: i } : p))}
                  className={
                    'w-full text-left flex items-center gap-2 px-3 py-1.5 text-[12px] ' +
                    (i === popover.index
                      ? 'bg-flame/10 text-ink dark:text-[#F5F1EA]'
                      : 'text-ink dark:text-[#E6E0D8] hover:bg-cream dark:hover:bg-[#0F0D0A]')
                  }
                >
                  <span className="truncate">{it.label}</span>
                  {it.sublabel && (
                    <span className="ml-auto truncate text-[10px] font-mono text-muted dark:text-[#8C837C]">
                      {it.sublabel}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 py-1.5 text-[10px] text-muted dark:text-[#8C837C] border-t border-line dark:border-[#2A241D] font-mono">
            ↑↓ navigate · ↵ select · esc cancel
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const cursor = e.target.selectionStart ?? e.target.value.length;
          const det = detectPopover(e.target.value, cursor);
          setPopover(det);
        }}
        onKeyUp={(e) => {
          const t = e.currentTarget;
          setPopover(detectPopover(t.value, t.selectionStart ?? 0));
        }}
        onClick={(e) => {
          const t = e.currentTarget;
          setPopover(detectPopover(t.value, t.selectionStart ?? 0));
        }}
        onKeyDown={(e) => {
          if (popover && popoverItems.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setPopover((p) => (p ? { ...p, index: (p.index + 1) % popoverItems.length } : p));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setPopover((p) => (p ? { ...p, index: (p.index - 1 + popoverItems.length) % popoverItems.length } : p));
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              applyChoice(popoverItems[popover.index]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setPopover(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && !popover) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className="w-full resize-none bg-transparent border-0 px-5 py-4 text-[15px] text-ink dark:text-[#E6E0D8] placeholder:text-muted/70 dark:placeholder:text-[#6B625C] focus:outline-none"
        style={{ minHeight: 80, maxHeight: 320 }}
      />

      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line dark:border-[#2A241D] bg-cream-light dark:bg-[#17140F]">
        {/* Agent pill (ChatGPT-style integrated picker — replaces the old
            cards grid). Shows the current routing agent with a chevron;
            click to swap. When no agent is picked the message goes
            straight to BlackMagic AI with no agent routing. */}
        <div className="relative">
          <button
            ref={agentBtnRef}
            type="button"
            onClick={() => setAgentMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-md text-[12px] text-ink dark:text-[#E6E0D8] hover:bg-white dark:hover:bg-[#1F1B15] border border-transparent hover:border-line dark:hover:border-[#2A241D]"
            title={currentAgent ? `Routing through ${currentAgent.name} — click to swap` : 'No agent — message goes straight to BlackMagic AI. Click to pick an agent.'}
          >
            {currentAgent ? (
              <AgentIcon slug={currentAgent.slug} name={currentAgent.name} size="sm" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-muted dark:text-[#8C837C]" />
            )}
            <span className="font-medium">
              {currentAgent ? currentAgent.name : 'No agent'}
            </span>
            <ChevronDown className="w-3 h-3 text-muted dark:text-[#8C837C]" />
          </button>
          {agentMenuOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-72 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-lg shadow-lg overflow-hidden z-40">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono text-muted dark:text-[#8C837C] border-b border-line dark:border-[#2A241D]">
                Route this message through
              </div>
              <ul className="max-h-[320px] overflow-y-auto py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => { onAgentChange?.(undefined); setAgentMenuOpen(false); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] text-ink dark:text-[#E6E0D8] hover:bg-cream dark:hover:bg-[#0F0D0A]"
                  >
                    <Bot className="w-4 h-4 text-muted dark:text-[#8C837C]" />
                    <span className="flex-1">Default</span>
                    {!agentSlug && <Check className="w-3.5 h-3.5 text-flame" />}
                  </button>
                </li>
                {agents.map((a) => {
                  const picked = agentSlug === a.slug;
                  return (
                    <li key={a.slug}>
                      <button
                        type="button"
                        onClick={() => { onAgentChange?.(a.slug); setAgentMenuOpen(false); }}
                        className="w-full text-left flex items-start gap-2 px-3 py-2 text-[12px] text-ink dark:text-[#E6E0D8] hover:bg-cream dark:hover:bg-[#0F0D0A]"
                      >
                        <AgentIcon slug={a.slug} name={a.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{a.name}</div>
                          {a.tagline && (
                            <div className="text-[10.5px] text-muted dark:text-[#8C837C] line-clamp-1">{a.tagline}</div>
                          )}
                        </div>
                        {picked && <Check className="w-3.5 h-3.5 text-flame mt-0.5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {showKeyboardHints && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-muted dark:text-[#8C837C]">
              <Kbd>⌘↵</Kbd>
              <span>send</span>
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="inline-flex items-center gap-1.5 bg-flame text-white text-[13px] font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitLabel} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 rounded border border-line dark:border-[#2A241D] bg-white dark:bg-[#1F1B15] px-1 py-0.5 text-[10px] font-mono text-muted dark:text-[#8C837C]">
      {children}
    </kbd>
  );
}

const DEFAULT_SLASH: ComposerSlashCommand[] = [
  { name: '/clear',  hint: 'reset this thread',       action: 'clear' },
  { name: '/agent',  hint: 'switch which agent answers', action: 'agent' },
  { name: '/skills', hint: 'browse the skill catalog', action: 'skills' },
];
