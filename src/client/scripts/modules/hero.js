/**
 * Hero: line-by-line headline reveal + the circuit canvas.
 *
 * The canvas draws circuit traces in the logo's style (straight runs with 45° bends, ending
 * in a node) radiating from a point on the right. Signals travel along the traces and light
 * the end node when they arrive. Moving the pointer near a node fires a signal from it.
 * Pauses off-screen and in background tabs; draws a still frame for reduced-motion users.
 */
import { prefersReducedMotion } from './api.js';

export function initHero() {
  const hero = document.querySelector('.hero');
  requestAnimationFrame(() => hero.classList.add('is-ready'));
  const canvas = hero.querySelector('[data-circuit]');
  if (canvas) new Circuit(canvas, hero).start();
}

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

class Circuit {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.ctx = canvas.getContext('2d');
    this.traces = [];
    this.pulses = [];
    this.pointer = null;
    this.running = false;
    this.visible = true;
    this.still = prefersReducedMotion();
    this.last = 0;
    this.spawnTimer = 0;
  }

  start() {
    this.resize();
    let rT;
    window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => this.resize(), 150); });
    this.host.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    this.host.addEventListener('pointerleave', () => { this.pointer = null; });

    if (this.still) { this.drawStill(); return; }
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.toggle(); }).observe(this.host);
    document.addEventListener('visibilitychange', () => this.toggle());
    this.toggle();
  }

  toggle() {
    const should = this.visible && !document.hidden;
    if (should && !this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.frame(t)); }
    else if (!should) this.running = false;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = this.canvas.getBoundingClientRect();
    this.w = width; this.h = height;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.build();
    if (this.still) this.drawStill();
  }

  /** Grow traces outward from a hub, avoiding cells already used. */
  build() {
    const cell = this.w < 700 ? 22 : 28;
    const cols = Math.ceil(this.w / cell);
    const rows = Math.ceil(this.h / cell);
    const used = new Set();
    const key = (c, r) => `${c},${r}`;
    const mobile = this.w < 700;
    const hub = { c: Math.round(cols * (mobile ? 0.8 : 0.72)), r: Math.round(rows * (mobile ? 0.3 : 0.46)) };
    const count = Math.round(Math.min(90, (cols * rows) / 14));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // deterministic layout

    this.traces = [];
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const angle = rand() * Math.PI * 2;
      const radius = 1 + rand() * 4;
      let c = Math.round(hub.c + Math.cos(angle) * radius);
      let r = Math.round(hub.r + Math.sin(angle) * radius);
      if (used.has(key(c, r))) continue;

      // Prefer heading away from the hub; straight runs first, as in the logo.
      let dir = Math.round(((Math.atan2(r - hub.r, c - hub.c) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      if (dir % 2 === 1 && rand() < 0.6) dir = (dir + (rand() < 0.5 ? 1 : 7)) % 8;

      const pts = [[c, r]];
      const cells = [key(c, r)];
      let segments = 2 + Math.floor(rand() * 3);
      let ok = true;
      while (segments-- > 0 && ok) {
        const len = 2 + Math.floor(rand() * (dir % 2 ? 3 : 7));
        for (let s = 0; s < len; s++) {
          const nc = c + DIRS[dir][0];
          const nr = r + DIRS[dir][1];
          if (nc < 1 || nr < 1 || nc >= cols - 1 || nr >= rows - 1 || used.has(key(nc, nr)) || cells.includes(key(nc, nr))) { ok = s > 0; break; }
          c = nc; r = nr; cells.push(key(c, r));
        }
        pts.push([c, r]);
        dir = (dir + (rand() < 0.5 ? 1 : 7)) % 8; // 45° bend
      }
      if (cells.length < 4) continue;
      cells.forEach((k) => used.add(k));

      const points = pts.map(([pc, pr]) => ({ x: pc * cell, y: pr * cell }));
      // Drop zero-length segments and precompute lengths for pulse travel.
      const clean = points.filter((p, idx) => idx === 0 || p.x !== points[idx - 1].x || p.y !== points[idx - 1].y);
      if (clean.length < 2) continue;
      const lens = clean.slice(1).map((p, idx) => Math.hypot(p.x - clean[idx].x, p.y - clean[idx].y));
      this.traces.push({ points: clean, lens, length: lens.reduce((a, b) => a + b, 0), flash: 0, start: clean[0], end: clean[clean.length - 1] });
      i++;
    }
    this.pulses = [];
  }

  pointAt(trace, dist) {
    let d = Math.max(0, Math.min(dist, trace.length));
    for (let i = 0; i < trace.lens.length; i++) {
      if (d <= trace.lens[i]) {
        const a = trace.points[i], b = trace.points[i + 1], t = trace.lens[i] ? d / trace.lens[i] : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= trace.lens[i];
    }
    return trace.end;
  }

  spawn(trace) {
    if (!trace || this.pulses.length > 28) return;
    this.pulses.push({ trace, d: 0, speed: 160 + Math.random() * 160 });
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.traces.length) {
      this.spawn(this.traces[Math.floor(Math.random() * this.traces.length)]);
      this.spawnTimer = 0.12 + Math.random() * 0.25;
    }
    if (this.pointer) {
      for (const t of this.traces) {
        if (Math.hypot(t.start.x - this.pointer.x, t.start.y - this.pointer.y) < 60 && Math.random() < 0.08) this.spawn(t);
      }
    }

    for (const p of this.pulses) p.d += p.speed * dt;
    this.pulses = this.pulses.filter((p) => {
      if (p.d >= p.trace.length) { p.trace.flash = 1; return false; }
      return true;
    });
    for (const t of this.traces) t.flash = Math.max(0, t.flash - dt * 1.6);

    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  drawTraces(ctx) {
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const t of this.traces) {
      let alpha = 0.16;
      if (this.pointer) {
        const near = Math.hypot(t.start.x - this.pointer.x, t.start.y - this.pointer.y);
        if (near < 160) alpha += 0.18 * (1 - near / 160);
      }
      ctx.strokeStyle = `rgba(143,160,181,${alpha})`;
      ctx.beginPath();
      t.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();

      // End node
      ctx.beginPath();
      ctx.arc(t.end.x, t.end.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = t.flash > 0 ? `rgba(43,176,255,${0.35 + t.flash * 0.65})` : '#0F141B';
      ctx.fill();
      ctx.strokeStyle = t.flash > 0 ? `rgba(43,176,255,${0.5 + t.flash * 0.5})` : `rgba(143,160,181,${alpha + 0.1})`;
      ctx.stroke();
      if (t.flash > 0) {
        ctx.beginPath();
        ctx.arc(t.end.x, t.end.y, 3 + (1 - t.flash) * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(43,176,255,${t.flash * 0.4})`;
        ctx.stroke();
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawTraces(ctx);

    // Pulses: bright head with a fading tail drawn along the trace.
    ctx.lineWidth = 2;
    for (const p of this.pulses) {
      const tail = 46;
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const a = this.pointAt(p.trace, p.d - (tail * i) / steps);
        const b = this.pointAt(p.trace, p.d - (tail * (i + 1)) / steps);
        ctx.strokeStyle = `rgba(43,176,255,${(1 - i / steps) * 0.9})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const head = this.pointAt(p.trace, p.d);
      ctx.fillStyle = '#E6F4FF';
      ctx.shadowColor = '#2BB0FF';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawStill() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.traces.forEach((t, i) => { t.flash = i % 5 === 0 ? 0.8 : 0; });
    this.drawTraces(this.ctx);
  }
}
