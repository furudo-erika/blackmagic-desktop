'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, type OntologyNode, type OntologyEdge } from '../../lib/api';

const COLOR: Record<string, string> = {
  company: '#E8523A',
  contact: '#D4A65A',
  deal: '#7E8C67',
  draft: '#6A8EC4',
  agent: '#B06AB3',
  playbook: '#66A8A8',
  trigger: '#C97660',
  memory: '#9A8C6E',
  knowledge: '#9A8C6E',
  other: '#605A57',
};

type Vec = { x: number; y: number; vx: number; vy: number };

// Canvas-based force-directed graph. Continuous animation gives the "alive"
// feel; hover dims everything except the 1-hop neighborhood; click opens
// the file in /vault. Works across hundreds of nodes.
export default function OntologyPage() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const q = useQuery({ queryKey: ['ontology'], queryFn: api.ontology, staleTime: 15_000 });

  const graph = useMemo(() => {
    const nodes = q.data?.nodes ?? [];
    const edges = q.data?.edges ?? [];
    const adj = new Map<string, Set<string>>();
    for (const n of nodes) adj.set(n.id, new Set());
    for (const e of edges) {
      adj.get(e.source)?.add(e.target);
      adj.get(e.target)?.add(e.source);
    }
    const degree = new Map<string, number>();
    for (const [id, s] of adj) degree.set(id, s.size);
    return { nodes, edges, adj, degree };
  }, [q.data]);

  // Force-directed simulation, stored in ref so animation loop can mutate.
  const stateRef = useRef<{
    pos: Map<string, Vec>;
    nodes: OntologyNode[];
    edges: OntologyEdge[];
    adj: Map<string, Set<string>>;
    degree: Map<string, number>;
    width: number;
    height: number;
    t: number;
    raf: number | null;
  } | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of graph.nodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return m;
  }, [graph.nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!wrap || !canvas) return;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (stateRef.current) {
        stateRef.current.width = rect.width;
        stateRef.current.height = rect.height;
      }
    }
    resize();
    window.addEventListener('resize', resize);

    // Initialise positions around category clusters.
    const catAngle = new Map<string, number>();
    const kinds = [...new Set(graph.nodes.map((n) => n.kind))];
    kinds.forEach((k, i) => catAngle.set(k, (i / Math.max(1, kinds.length)) * Math.PI * 2));

    const rect = wrap.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const pos = new Map<string, Vec>();
    for (const n of graph.nodes) {
      const a = catAngle.get(n.kind) ?? 0;
      const r = 160 + Math.random() * 120;
      pos.set(n.id, {
        x: cx + Math.cos(a) * r + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(a) * r + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
      });
    }

    stateRef.current = {
      pos,
      nodes: graph.nodes,
      edges: graph.edges,
      adj: graph.adj,
      degree: graph.degree,
      width: rect.width,
      height: rect.height,
      t: 0,
      raf: null,
    };

    const REPULSE = 2400;
    const SPRING = 0.015;
    const SPRING_LEN = 110;
    const CENTER = 0.008;
    const DAMP = 0.86;

    function step() {
      const S = stateRef.current!;
      const list = S.nodes;
      // Repulsion (O(n^2) but typical vault < ~500 nodes).
      for (let i = 0; i < list.length; i++) {
        const a = S.pos.get(list[i]!.id);
        if (!a) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = S.pos.get(list[j]!.id);
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const inv = 1 / Math.sqrt(d2);
          const f = REPULSE / d2;
          const fx = dx * inv * f;
          const fy = dy * inv * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      for (const e of S.edges) {
        const a = S.pos.get(e.source);
        const b = S.pos.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = d - SPRING_LEN;
        const f = diff * SPRING;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      for (const n of list) {
        const p = S.pos.get(n.id);
        if (!p) continue;
        p.vx += (S.width / 2 - p.x) * CENTER;
        p.vy += (S.height / 2 - p.y) * CENTER;
        p.vx *= DAMP;
        p.vy *= DAMP;
        p.x += p.vx;
        p.y += p.vy;
      }
    }

    function draw() {
      const S = stateRef.current!;
      if (!ctx || !canvas) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S.width, S.height);

      // Background subtle gradient.
      const bg = isDark ? '#0F0D0A' : '#FBFAF8';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S.width, S.height);

      const qs = query.toLowerCase();
      const matching = qs
        ? new Set(S.nodes.filter((n) => n.label.toLowerCase().includes(qs) || n.path.toLowerCase().includes(qs)).map((n) => n.id))
        : null;

      const connected = hoverId ? S.adj.get(hoverId) ?? new Set<string>() : null;
      const focused = hoverId ? new Set<string>([hoverId, ...(connected ?? [])]) : null;

      // Edges as curves.
      for (const e of S.edges) {
        const a = S.pos.get(e.source);
        const b = S.pos.get(e.target);
        if (!a || !b) continue;
        const highlight = focused ? focused.has(e.source) && focused.has(e.target) : true;
        if (!highlight) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 18;

        const color = COLOR[S.nodes.find((n) => n.id === e.source)?.kind ?? 'other'] ?? '#888';
        const op = focused ? 0.75 : 0.22;
        ctx.strokeStyle = hexWithAlpha(color, op);
        ctx.lineWidth = focused ? 1.4 : 0.9;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
      }
      // Dim-layer for non-highlighted edges when focused.
      if (focused) {
        for (const e of S.edges) {
          if (focused.has(e.source) && focused.has(e.target)) continue;
          const a = S.pos.get(e.source);
          const b = S.pos.get(e.target);
          if (!a || !b) continue;
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,22,20,0.06)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Nodes.
      for (const n of S.nodes) {
        const p = S.pos.get(n.id);
        if (!p) continue;
        const deg = S.degree.get(n.id) ?? 0;
        const r = 4 + Math.log2(deg + 1) * 3.2;
        const color = COLOR[n.kind] ?? '#888';
        const isMatch = matching ? matching.has(n.id) : true;
        const isFocused = focused ? focused.has(n.id) : true;
        const dim = (isMatch ? 1 : 0.15) * (isFocused ? 1 : 0.2);

        // Glow
        if (dim === 1 && deg > 1) {
          const glow = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 3.4);
          glow.addColorStop(0, hexWithAlpha(color, 0.35));
          glow.addColorStop(1, hexWithAlpha(color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        // Core
        ctx.fillStyle = hexWithAlpha(color, 0.92 * dim);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        // Ring
        if (hoverId === n.id) {
          ctx.strokeStyle = isDark ? '#F5F1EA' : '#1A1614';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Label — only for high-degree or focused nodes.
        if ((deg >= 2 || hoverId === n.id) && dim > 0.5) {
          ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isDark ? 'rgba(230,224,216,0.85)' : 'rgba(26,22,20,0.8)';
          ctx.fillText(n.label, p.x + r + 6, p.y);
        }
      }
    }

    let running = true;
    function loop() {
      if (!running) return;
      step();
      draw();
      stateRef.current!.raf = requestAnimationFrame(loop);
    }
    loop();

    // Hit-testing for hover + click.
    function nearestAt(clientX: number, clientY: number): OntologyNode | null {
      const rect = canvas!.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const S = stateRef.current;
      if (!S) return null;
      let best: { n: OntologyNode; d: number } | null = null;
      for (const n of S.nodes) {
        const p = S.pos.get(n.id);
        if (!p) continue;
        const deg = S.degree.get(n.id) ?? 0;
        const r = 4 + Math.log2(deg + 1) * 3.2 + 3;
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < r && (!best || d < best.d)) best = { n, d };
      }
      return best?.n ?? null;
    }
    function onMove(ev: MouseEvent) {
      const n = nearestAt(ev.clientX, ev.clientY);
      setHoverId(n?.id ?? null);
      canvas!.style.cursor = n ? 'pointer' : 'default';
    }
    function onClick(ev: MouseEvent) {
      const n = nearestAt(ev.clientX, ev.clientY);
      if (n) router.push(`/vault?path=${encodeURIComponent(n.path)}`);
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);

    return () => {
      running = false;
      if (stateRef.current?.raf) cancelAnimationFrame(stateRef.current.raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [graph, isDark, query, hoverId, router]);

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="px-6 py-4 border-b border-line dark:border-[#2A241D] flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink dark:text-[#F5F1EA]">Ontology</h1>
          <p className="text-xs text-muted dark:text-[#8C837C]">
            Live graph of your vault. Nodes are files; edges follow frontmatter references.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Highlight…"
            className="w-52 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-full px-2 py-0.5 text-muted dark:text-[#8C837C]"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: COLOR[k] ?? '#888' }} />
                {k} · {n}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div ref={wrapRef} className="flex-1 relative">
        <canvas ref={canvasRef} className="block" />
        {q.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
            loading…
          </div>
        )}
        {!q.isLoading && graph.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
            Your vault is empty. Ask Chat to enrich a company to see the first nodes.
          </div>
        )}
        {hoverId && (() => {
          const n = graph.nodes.find((x) => x.id === hoverId);
          if (!n) return null;
          const deg = graph.degree.get(n.id) ?? 0;
          return (
            <div className="absolute bottom-4 left-4 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-xl p-4 max-w-xs pointer-events-none">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                <span className="w-2 h-2 rounded-full" style={{ background: COLOR[n.kind] ?? '#888' }} />
                {n.kind}
              </div>
              <div className="mt-1 text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate">{n.label}</div>
              <div className="text-[11px] text-muted dark:text-[#8C837C] font-mono truncate">{n.path}</div>
              <div className="mt-2 text-[11px] text-muted dark:text-[#8C837C]">
                {deg} connection{deg === 1 ? '' : 's'}
              </div>
              <div className="mt-2 text-[11px] text-flame">Click node to open in vault →</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
