'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { api, type OntologyNode, type OntologyEdge } from '../../lib/api';

// 3D force-directed knowledge graph.
// Three.js renders nodes as glowing spheres (icosahedrons for "MOC" /
// hub nodes), edges as faint lines, with a continuous force simulation
// in JS. Hover dims everything except the 1-hop neighborhood; click
// opens the file in the Context editor.

const COLOR_HEX: Record<string, number> = {
  company:    0xE8523A,
  contact:    0xD4A65A,
  deal:       0x7E8C67,
  draft:      0x6A8EC4,
  agent:      0xB06AB3,
  playbook:   0x66A8A8,
  trigger:    0xC97660,
  memory:     0x9A8C6E,
  knowledge:  0x9A8C6E,
  other:      0x605A57,
};

type Vec = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

function buildGlowSprite(color: number): THREE.Sprite {
  // Pre-rendered radial-gradient texture so the glow halo is cheap.
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  grad.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Sprite(mat);
}

export default function OntologyPage() {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Live mirrors so the rAF loop always reads the latest values.
  const hoverIdRef = useRef<string | null>(null); hoverIdRef.current = hoverId;
  const queryRef = useRef(''); queryRef.current = query;
  const isDarkRef = useRef(false);
  useEffect(() => {
    const update = () => { isDarkRef.current = document.documentElement.classList.contains('dark'); };
    update();
    const obs = new MutationObserver(update);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || graph.nodes.length === 0) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
    camera.position.set(0, 0, 700);

    function resize() {
      const rect = wrap!.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    // ── Lights ──────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(200, 300, 500);
    scene.add(dir);

    // ── Init positions clustered by category ────────────────
    const kinds = [...new Set(graph.nodes.map((n) => n.kind))];
    const catCenter = new Map<string, THREE.Vector3>();
    kinds.forEach((k, i) => {
      const a = (i / Math.max(1, kinds.length)) * Math.PI * 2;
      catCenter.set(k, new THREE.Vector3(Math.cos(a) * 260, Math.sin(a) * 260, (i % 2 ? -1 : 1) * 80));
    });
    const pos = new Map<string, Vec>();
    graph.nodes.forEach((n) => {
      const c = catCenter.get(n.kind) ?? new THREE.Vector3();
      pos.set(n.id, {
        x: c.x + (Math.random() - 0.5) * 90,
        y: c.y + (Math.random() - 0.5) * 90,
        z: c.z + (Math.random() - 0.5) * 90,
        vx: 0, vy: 0, vz: 0,
      });
    });

    // ── Build node meshes + glow sprites ────────────────────
    const meshes = new Map<string, { mesh: THREE.Mesh; glow: THREE.Sprite; baseScale: number; color: number }>();
    graph.nodes.forEach((n) => {
      const deg = graph.degree.get(n.id) ?? 0;
      const r = 4 + Math.log2(deg + 1) * 3;
      const color = COLOR_HEX[n.kind] ?? 0x888888;
      const isHub = deg >= 4;
      const geo = isHub
        ? new THREE.IcosahedronGeometry(r, 1)
        : new THREE.SphereGeometry(r, 18, 14);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.55,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.id = n.id;
      scene.add(mesh);
      const glow = buildGlowSprite(color);
      glow.scale.setScalar(r * (isHub ? 6 : 4));
      mesh.add(glow);
      meshes.set(n.id, { mesh, glow, baseScale: 1, color });
    });

    // ── Edges as line segments (one BufferGeometry, mutable verts) ──
    const edgeGeo = new THREE.BufferGeometry();
    const positionsAttr = new Float32Array(graph.edges.length * 6);
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(positionsAttr, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x9a8c6e,
      transparent: true,
      opacity: 0.28,
    });
    const edgeMesh = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeMesh);

    // ── Force simulation (continuous, with kinetic-energy freeze) ──
    const REPULSE = 6500;
    const SPRING = 0.012;
    const SPRING_LEN = 80;
    const CENTER = 0.005;
    const CAT_GRAVITY = 0.0035;
    const DAMP = 0.85;
    const FREEZE = 0.04;
    let frozen = false;
    let frame = 0;

    function step() {
      const list = graph.nodes;
      // Repulsion (O(n²); fine for ~500 nodes max)
      for (let i = 0; i < list.length; i++) {
        const a = pos.get(list[i]!.id);
        if (!a) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = pos.get(list[j]!.id);
          if (!b) continue;
          const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          const d2 = dx*dx + dy*dy + dz*dz + 0.1;
          const inv = 1 / Math.sqrt(d2);
          const f = REPULSE / d2;
          const fx = dx * inv * f, fy = dy * inv * f, fz = dz * inv * f;
          a.vx += fx; a.vy += fy; a.vz += fz;
          b.vx -= fx; b.vy -= fy; b.vz -= fz;
        }
      }
      // Edge springs
      for (const e of graph.edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        const f = (d - SPRING_LEN) * SPRING;
        const fx = (dx / d) * f, fy = (dy / d) * f, fz = (dz / d) * f;
        a.vx += fx; a.vy += fy; a.vz += fz;
        b.vx -= fx; b.vy -= fy; b.vz -= fz;
      }
      // Centering + category gravity + damping
      let ke = 0;
      for (const n of list) {
        const p = pos.get(n.id);
        if (!p) continue;
        const c = catCenter.get(n.kind) ?? new THREE.Vector3();
        p.vx += (c.x - p.x) * CAT_GRAVITY - p.x * CENTER;
        p.vy += (c.y - p.y) * CAT_GRAVITY - p.y * CENTER;
        p.vz += (c.z - p.z) * CAT_GRAVITY - p.z * CENTER;
        p.vx *= DAMP; p.vy *= DAMP; p.vz *= DAMP;
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        ke += p.vx*p.vx + p.vy*p.vy + p.vz*p.vz;
      }
      if (list.length && ke / list.length < FREEZE) frozen = true;
    }

    function syncMeshPositions() {
      for (const [id, slot] of meshes) {
        const p = pos.get(id);
        if (!p) continue;
        slot.mesh.position.set(p.x, p.y, p.z);
      }
      // Edge buffer
      let i = 0;
      for (const e of graph.edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) { i += 6; continue; }
        positionsAttr[i++] = a.x; positionsAttr[i++] = a.y; positionsAttr[i++] = a.z;
        positionsAttr[i++] = b.x; positionsAttr[i++] = b.y; positionsAttr[i++] = b.z;
      }
      (edgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    function applyHighlights() {
      const hover = hoverIdRef.current;
      const qs = queryRef.current.toLowerCase();
      const matching = qs
        ? new Set(graph.nodes.filter((n) => n.label.toLowerCase().includes(qs) || n.path.toLowerCase().includes(qs)).map((n) => n.id))
        : null;
      const focused = hover
        ? new Set<string>([hover, ...(graph.adj.get(hover) ?? new Set())])
        : null;

      for (const [id, slot] of meshes) {
        const matched = matching ? matching.has(id) : true;
        const isFocused = focused ? focused.has(id) : true;
        const dim = (matched ? 1 : 0.12) * (isFocused ? 1 : 0.18);
        const mat = slot.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = 0.4 + dim * 0.6;
        mat.transparent = true;
        mat.emissiveIntensity = 0.25 + dim * 0.55;
        slot.glow.material.opacity = 0.4 * dim;
        slot.mesh.scale.setScalar(id === hover ? 1.35 : 1);
      }
      edgeMat.opacity = focused ? 0.5 : 0.22;
    }

    // ── Camera orbit (mouse drag + wheel zoom) ───────────────
    let azimuth = 0, polar = Math.PI / 2.2, radius = 700;
    let dragging = false;
    let lastX = 0, lastY = 0;
    function setCameraFromAngles() {
      camera.position.set(
        radius * Math.sin(polar) * Math.cos(azimuth),
        radius * Math.cos(polar),
        radius * Math.sin(polar) * Math.sin(azimuth),
      );
      camera.lookAt(0, 0, 0);
    }
    setCameraFromAngles();
    canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('mousemove', (e) => {
      if (dragging) {
        azimuth -= (e.clientX - lastX) * 0.005;
        polar = Math.max(0.15, Math.min(Math.PI - 0.15, polar - (e.clientY - lastY) * 0.005));
        lastX = e.clientX; lastY = e.clientY;
        setCameraFromAngles();
        frozen = false;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      radius = Math.max(120, Math.min(2200, radius + e.deltaY * 0.6));
      setCameraFromAngles();
    }, { passive: false });

    // ── Picking (hover + click) ─────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    function pick(clientX: number, clientY: number): string | null {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects([...meshes.values()].map((s) => s.mesh), false);
      return hits.length ? (hits[0]!.object.userData.id as string) : null;
    }
    canvas.addEventListener('mousemove', (e) => {
      if (dragging) return;
      const id = pick(e.clientX, e.clientY);
      if (id !== hoverIdRef.current) setHoverId(id);
      canvas.style.cursor = id ? 'pointer' : 'default';
    });
    canvas.addEventListener('click', (e) => {
      const id = pick(e.clientX, e.clientY);
      if (id) {
        const n = graph.nodes.find((x) => x.id === id);
        if (n) router.push(`/context?path=${encodeURIComponent(n.path)}`);
      }
    });

    // ── Render loop ─────────────────────────────────────────
    let raf = 0;
    let alive = true;
    function loop() {
      if (!alive) return;
      if (!frozen || frame < 60) step();   // run a few extra frames after freeze for smoothness
      syncMeshPositions();
      applyHighlights();
      renderer.render(scene, camera);
      frame++;
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      meshes.forEach((s) => {
        (s.mesh.geometry as THREE.BufferGeometry).dispose();
        (s.mesh.material as THREE.Material).dispose();
        if (s.glow.material instanceof THREE.SpriteMaterial && s.glow.material.map) s.glow.material.map.dispose();
        s.glow.material.dispose();
      });
      edgeGeo.dispose();
      edgeMat.dispose();
    };
  }, [graph, router]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of graph.nodes) m.set(n.kind, (m.get(n.kind) ?? 0) + 1);
    return m;
  }, [graph.nodes]);

  return (
    <div className="h-full flex flex-col bg-cream dark:bg-[#0F0D0A]">
      <header className="px-6 py-3 border-b border-line dark:border-[#2A241D] flex items-center justify-between gap-4">
        <h1 className="text-base font-semibold text-ink dark:text-[#F5F1EA]">Knowledge graph</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Highlight…"
              className="w-44 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-md px-3 py-1.5 text-xs font-mono text-ink dark:text-[#E6E0D8] focus:outline-none focus:border-flame"
            />
            {query.trim() && (() => {
              const qs = query.trim().toLowerCase();
              const n = graph.nodes.filter(
                (nd) => nd.label.toLowerCase().includes(qs) || nd.path.toLowerCase().includes(qs),
              ).length;
              return (
                <span className={'text-[11px] font-mono ' + (n === 0 ? 'text-flame' : 'text-muted dark:text-[#8C837C]')}>
                  {n === 0 ? 'no match' : `${n} match${n === 1 ? '' : 'es'}`}
                </span>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-full px-2 py-0.5 text-muted dark:text-[#8C837C]">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#' + (COLOR_HEX[k] ?? 0x888888).toString(16).padStart(6, '0') }} />
                {k} · {n}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div ref={wrapRef} className="flex-1 relative">
        <canvas ref={canvasRef} className="block w-full h-full" />
        {q.isLoading && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">loading…</div>}
        {!q.isLoading && graph.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted dark:text-[#8C837C]">
            Context is empty. Ask Chat to enrich a company to see the first node.
          </div>
        )}
        {hoverId && (() => {
          const n = graph.nodes.find((x) => x.id === hoverId);
          if (!n) return null;
          const deg = graph.degree.get(n.id) ?? 0;
          return (
            <div className="absolute bottom-4 left-4 bg-white dark:bg-[#1F1B15] border border-line dark:border-[#2A241D] rounded-xl shadow-xl p-4 max-w-xs pointer-events-none">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted dark:text-[#8C837C]">
                <span className="w-2 h-2 rounded-full" style={{ background: '#' + (COLOR_HEX[n.kind] ?? 0x888888).toString(16).padStart(6, '0') }} />
                {n.kind}
              </div>
              <div className="mt-1 text-sm font-semibold text-ink dark:text-[#F5F1EA] truncate">{n.label}</div>
              <div className="text-[11px] text-muted dark:text-[#8C837C] font-mono truncate">{n.path}</div>
              <div className="mt-2 text-[11px] text-muted dark:text-[#8C837C]">{deg} connection{deg === 1 ? '' : 's'}</div>
              <div className="mt-2 text-[11px] text-flame">Click to open in context →</div>
            </div>
          );
        })()}
        <div className="absolute bottom-3 right-4 text-[10px] font-mono text-muted dark:text-[#8C837C] pointer-events-none">
          drag to orbit · scroll to zoom · click to open
        </div>
      </div>
    </div>
  );
}
