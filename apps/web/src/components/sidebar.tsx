'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, FolderTree, Building2, Users, Briefcase, Bot, BookOpen, Zap, Send, History, Wrench, Settings as SettingsIcon } from 'lucide-react';
import clsx from 'clsx';

const PRIMARY = [
  { href: '/', label: 'Chat', icon: MessageSquare },
  { href: '/vault', label: 'Vault', icon: FolderTree },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/playbooks', label: 'Playbooks', icon: BookOpen },
  { href: '/triggers', label: 'Triggers', icon: Zap },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/runs', label: 'Runs', icon: History },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname() || '/';
  return (
    <aside className="w-[220px] shrink-0 bg-cream-light border-r border-line flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2">
        <span className="inline-block w-5 h-5 rounded-full bg-flame" />
        <span className="font-semibold tracking-tight text-[15px]">Black Magic</span>
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
                active ? 'bg-white text-ink font-medium border-l-2 border-flame' : 'text-muted hover:bg-white hover:text-ink',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-line text-[11px] text-muted font-mono">
        <div>v0.1.0 · local</div>
      </div>
    </aside>
  );
}
