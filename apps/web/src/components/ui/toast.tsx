'use client';

/**
 * Minimal toast system — zustand store + <ToastHost/> renderer.
 *
 * Pages call `toast.success('sent')` / `toast.error('bad domain')` and a
 * short-lived pill appears bottom-right. Auto-dismisses after 4s.
 * Mounted once in AppShell; pages don't need a provider.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Check, X, AlertTriangle } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; text: string };

type ToastStore = {
  items: ToastItem[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: number) => void;
};

let seq = 1;

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (kind, text) => set((s) => ({ items: [...s.items, { id: seq++, kind, text }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (text: string) => useToastStore.getState().push('success', text),
  error: (text: string) => useToastStore.getState().push('error', text),
  info: (text: string) => useToastStore.getState().push('info', text),
};

export function useToast() {
  return toast;
}

export function ToastHost() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <ToastPill key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastPill({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  // Pin onDismiss through a ref + empty-dep effect. Otherwise the inline
  // `() => dismiss(t.id)` prop from ToastHost is a fresh reference on
  // every render, which resets the auto-dismiss timer — a new toast
  // push or a surrounding re-render inside the 4s window keeps the
  // surviving pills alive forever.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const h = setTimeout(() => dismissRef.current(), 4000);
    return () => clearTimeout(h);
  }, []);
  const Icon = item.kind === 'success' ? Check : item.kind === 'error' ? AlertTriangle : Check;
  const color =
    item.kind === 'success'
      ? 'border-[#7E8C67]/40 text-[#5D6E4D] dark:text-[#A3B38A]'
      : item.kind === 'error'
      ? 'border-flame/40 text-flame'
      : 'border-line dark:border-[#2A241D] text-ink dark:text-[#E6E0D8]';
  return (
    <div
      className={
        'pointer-events-auto flex items-center gap-2 min-w-[220px] max-w-[360px] bg-white dark:bg-[#1F1B15] border rounded-lg shadow-lg px-3 py-2 text-[12px] ' +
        color
      }
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 break-words">{item.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 cursor-pointer rounded-md p-1.5 -m-1 text-muted hover:text-ink dark:hover:text-[#F5F1EA] hover:bg-cream-light dark:hover:bg-[#17140F]"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
