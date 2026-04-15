'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MessageSquare, Network, FolderTree, Building2, Users, Briefcase, Bot, BookOpen, Zap, Send, History, Plug, Settings as SettingsIcon, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';

const PRIMARY = [
  { href: '/', label: 'Chat', icon: MessageSquare },
  { href: '/ontology', label: 'Ontology', icon: Network },
  { href: '/vault', label: 'Vault', icon: FolderTree },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/playbooks', label: 'Playbooks', icon: BookOpen },
  { href: '/triggers', label: 'Triggers', icon: Zap },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/runs', label: 'Runs', icon: History },
  { href: '/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname() || '/';
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('bm-theme');
    const initial = stored === 'dark' || (stored == null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(initial);
    document.documentElement.classList.toggle('dark', initial);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bm-theme', next ? 'dark' : 'light');
  }

  return (
    <aside className="w-[220px] shrink-0 bg-cream-light dark:bg-[#17140F] border-r border-line dark:border-[#2A241D] flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2">
        <span className="inline-block w-5 h-5 rounded-full bg-flame" />
        <span className="font-semibold tracking-tight text-[15px] text-ink dark:text-[#F5F1EA]">Black Magic</span>
      </div>
      <nav className="flex-1 px-3 overflow-y-auto">
        {PRIMARY.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-md text-sm transition-colors',
                active
                  ? 'bg-white dark:bg-[#1F1B15] text-ink dark:text-[#F5F1EA] font-medium border-l-2 border-flame'
                  : 'text-muted dark:text-[#8C837C] hover:bg-white dark:hover:bg-[#1F1B15] hover:text-ink dark:hover:text-[#F5F1EA]',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-line dark:border-[#2A241D] flex items-center justify-between">
        <span className="text-[11px] text-muted dark:text-[#6B625C] font-mono">v0.1.0 · local</span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="p-1.5 rounded-md text-muted dark:text-[#8C837C] hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-white dark:hover:bg-[#1F1B15]"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
