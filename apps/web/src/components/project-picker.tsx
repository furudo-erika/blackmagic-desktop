'use client';

// Project picker. Two entry points:
//   - Login flow: shown after bridge-ready and before sign-in if the user
//     has >1 project OR explicitly clicks "Switch project" from the sidebar.
//   - Sidebar: opens this as a modal.
//
// Uses inline style fallbacks everywhere so it renders even if tailwind
// doesn't load (same pattern as the bridge-form on login-gate.tsx).

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Project } from '../lib/api';

export type ProjectPickerMode = 'modal' | 'page';

export function ProjectPicker({
  mode = 'page',
  onClose,
  onActivated,
}: {
  mode?: ProjectPickerMode;
  onClose?: () => void;
  onActivated?: (project: Project) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  // Escape closes the picker when in modal mode (QA BUG-005).
  useEffect(() => {
    if (mode !== 'modal' || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function activate(id: string) {
    setBusy(id);
    setErr(null);
    try {
      const reg = await api.activateProject(id);
      qc.setQueryData(['projects'], reg);
      // The daemon has flipped VAULT_ROOT — everything else needs to re-fetch.
      qc.invalidateQueries();
      const p = reg.projects.find((x) => x.id === id);
      if (p) onActivated?.(p);
    } catch (e: any) {
      setErr(e?.message || 'activate failed');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Remove this project from the list? (folder on disk is NOT deleted)')) return;
    setBusy(id);
    setErr(null);
    try {
      const reg = await api.deleteProject(id);
      qc.setQueryData(['projects'], reg);
    } catch (e: any) {
      setErr(e?.message || 'delete failed');
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy('__new__');
    setErr(null);
    try {
      const reg = await api.addProject(name, newPath.trim() || undefined);
      qc.setQueryData(['projects'], reg);
      setShowNew(false);
      setNewName('');
      setNewPath('');
    } catch (e: any) {
      setErr(e?.message || 'create failed');
    } finally {
      setBusy(null);
    }
  }

  async function browse() {
    if (!window.bmBridge?.pickFolder) return;
    const p = await window.bmBridge.pickFolder();
    if (p) setNewPath(p);
  }

  const reg = q.data;

  const card = (
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid rgba(55,50,47,0.08)',
        padding: 32,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        position: 'relative',
      }}
    >
      {mode === 'modal' && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            color: '#605A57',
            fontSize: 18,
            cursor: 'pointer',
            width: 24,
            height: 24,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
      <img src="/logo.svg" alt="" width={40} height={40} style={{ marginBottom: 16 }} />
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, marginBottom: 4, color: '#1A1614' }}>
        Choose a project
      </h1>
      <p style={{ fontSize: 14, color: '#605A57', marginTop: 0, marginBottom: 20 }}>
        Each project is its own vault folder — notes, agents, drafts, and
        triggers live under it. Switch anytime.
      </p>

      {q.isLoading && <div style={{ fontSize: 13, color: '#605A57' }}>Loading projects…</div>}
      {reg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {reg.projects.map((p) => {
            const active = p.id === reg.active;
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (active) {
                    onActivated?.(p);
                    onClose?.();
                  } else {
                    activate(p.id);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 12px',
                  border: `1px solid ${active ? '#E8523A' : 'rgba(55,50,47,0.10)'}`,
                  borderRadius: 8,
                  background: active ? 'rgba(232,82,58,0.06)' : '#FBFAF8',
                  cursor: 'pointer',
                  opacity: busy === p.id ? 0.5 : 1,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1614' }}>
                    {p.name}
                    {active && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#E8523A', fontWeight: 500 }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#8C837C',
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.path}
                  </div>
                </div>
                {!active && reg.projects.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => remove(p.id, e)}
                    aria-label={`Remove ${p.name}`}
                    title="Remove from registry (keeps folder on disk)"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#8C837C',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: 4,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {err && (
        <div
          style={{
            marginBottom: 12,
            fontSize: 12,
            color: '#E8523A',
            background: 'rgba(232,82,58,0.08)',
            padding: '6px 10px',
            borderRadius: 6,
          }}
        >
          {err}
        </div>
      )}

      {!showNew ? (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          style={{
            width: '100%',
            height: 38,
            borderRadius: 6,
            background: 'transparent',
            border: '1px dashed rgba(55,50,47,0.25)',
            color: '#605A57',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + New project
        </button>
      ) : (
        <form onSubmit={create}>
          <label style={{ display: 'block', fontSize: 12, color: '#605A57', marginBottom: 4 }}>
            Name
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Apidog"
            autoFocus
            style={{
              width: '100%',
              marginBottom: 10,
              background: '#fff',
              border: '1px solid rgba(55,50,47,0.12)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          <label style={{ display: 'block', fontSize: 12, color: '#605A57', marginBottom: 4 }}>
            Folder <span style={{ color: '#8C837C' }}>(optional — defaults to ~/BlackMagic-&lt;slug&gt;)</span>
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/Users/you/BlackMagic-apidog"
              style={{
                flex: 1,
                minWidth: 0,
                background: '#fff',
                border: '1px solid rgba(55,50,47,0.12)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                fontFamily: 'ui-monospace, Menlo, monospace',
                boxSizing: 'border-box',
              }}
            />
            {typeof window !== 'undefined' && window.bmBridge?.pickFolder && (
              <button
                type="button"
                onClick={browse}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(55,50,47,0.12)',
                  background: '#fff',
                  color: '#1A1614',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Browse…
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={!newName.trim() || busy === '__new__'}
              style={{
                flex: 1,
                height: 38,
                borderRadius: 6,
                background: '#E8523A',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                opacity: !newName.trim() || busy === '__new__' ? 0.5 : 1,
              }}
            >
              {busy === '__new__' ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNew(false);
                setNewName('');
                setNewPath('');
              }}
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 6,
                border: '1px solid rgba(55,50,47,0.12)',
                background: '#fff',
                color: '#605A57',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26,22,20,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 200,
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>{card}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F1EA',
        padding: 24,
        position: 'relative',
        zIndex: 100,
      }}
    >
      {card}
    </div>
  );
}
