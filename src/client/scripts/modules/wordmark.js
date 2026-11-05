/**
 * Footer wordmark: "neuropulse" set across the full width and cropped by the bottom edge,
 * printed as a field of halftone dots in the brand gradient.
 *  - each dot is sized by how much of the letter covers its cell, so the type keeps its edges
 *  - dots part around the pointer on springs and brighten as they are pushed off their place
 *  - a click sends a pulse ring through the word
 *  - sleeps when nothing moves or the footer is off screen; static under reduced motion
 */
const GRADIENT_TOP = [43, 176, 255]; // --pulse-hi
const GRADIENT_BOTTOM = [11, 95, 214]; // --deep
const WARM = [244, 248, 252]; // --paper

const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

/** Dot radius for a cell coverage in [0, 1]: area-true, so tone stays even. */
const dotRadius = (coverage, gap) => Math.sqrt(Math.min(1, Math.max(0, coverage))) * gap * 0.56;

export function initWordmark() {
  const root = document.querySelector('[data-wordmark]');
  const canvas = root?.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  const word = root.dataset.wordmark || 'neuropulse';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const RADIUS = 80;
  const CROP = 0.22;

  let w = 0, h = 0, dpr = 1, gap = 6;
  let px = -1e5, py = -1e5;
  let raf = 0, visible = false, awake = true;
  let ring = { x: 0, y: 0, t: -1 };
  let dots = new Float32Array(0); // x, y, vx, vy, hx, hy, r per dot
  let count = 0;
  let colors = [];

  const layout = () => {
    const rect = root.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gap = w < 600 ? 4 : 6;

    // Set the word once on a 1x mask, at a size that fills the width.
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const m = mask.getContext('2d', { willReadFrequently: true });
    const face = (size) => `600 ${size}px Outfit, ui-sans-serif, system-ui, sans-serif`;
    m.font = face(100);
    const size = (w * 0.98 / m.measureText(word).width) * 100;
    m.font = face(size);
    const box = m.measureText(word);
    const cap = box.actualBoundingBoxAscent || size * 0.72;
    m.fillText(word, (w - box.width) / 2, h + cap * CROP);
    const img = m.getImageData(0, 0, w, h).data;

    const cols = Math.ceil(w / gap);
    const rows = Math.ceil(h / gap);
    const tmp = [];
    colors = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        // Coverage: average alpha over a 3x3 sample of the cell.
        let sum = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const x = Math.min(w - 1, Math.floor(gx * gap + ((sx + 0.5) * gap) / 3));
            const y = Math.min(h - 1, Math.floor(gy * gap + ((sy + 0.5) * gap) / 3));
            sum += img[(y * w + x) * 4 + 3];
          }
        }
        const cov = sum / (9 * 255);
        if (cov < 0.06) continue;
        const hx = gx * gap + gap / 2;
        const hy = gy * gap + gap / 2;
        tmp.push(hx, hy, 0, 0, hx, hy, dotRadius(cov, gap));
        colors.push(mix(GRADIENT_TOP, GRADIENT_BOTTOM, hy / h));
      }
    }
    dots = new Float32Array(tmp);
    count = tmp.length / 7;
    awake = true;
  };

  const draw = (now) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = reduced ? 0 : RADIUS;
    const ringAge = ring.t < 0 ? 1e9 : now - ring.t;
    const ringR = ringAge * 0.9;
    let moving = false;

    for (let i = 0; i < count; i++) {
      const j = i * 7;
      let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
      const hx = dots[j + 4], hy = dots[j + 5];
      if (!reduced) {
        if (ringAge < 900) {
          const dx = hx - ring.x, dy = hy - ring.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const band = 1 - Math.min(1, Math.abs(d - ringR) / 26);
          if (band > 0) {
            const f = band * 3.2 * (1 - ringAge / 900);
            vx += (dx / d) * f;
            vy += (dy / d) * f;
          }
        }
        const dx = x - px, dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (r > 0 && d2 < r * r) {
          const d = Math.sqrt(d2) + 0.001;
          const f = (1 - d / r) * 2.6;
          vx += (dx / d) * f;
          vy += (dy / d) * f;
        }
        vx = (vx + (hx - x) * 0.05) * 0.84;
        vy = (vy + (hy - y) * 0.05) * 0.84;
        x += vx;
        y += vy;
        if (Math.abs(vx) + Math.abs(vy) > 0.02 || Math.abs(x - hx) + Math.abs(y - hy) > 0.05) moving = true;
        else { x = hx; y = hy; vx = 0; vy = 0; }
        dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
      }
      const k = Math.min(1, Math.hypot(x - hx, y - hy) / 28);
      const c = k > 0.02 ? mix(colors[i], WARM, k) : colors[i];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.beginPath();
      ctx.arc(x, y, dots[j + 6], 0, 6.2832);
      ctx.fill();
    }
    // Sleep once everything is home and nothing is pushing.
    awake = moving || ringAge < 900 || px > -1e4;
  };

  const loop = (now) => {
    raf = 0;
    if (!visible) return;
    draw(now);
    if (awake) raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    awake = true;
    if (!raf && visible) raf = requestAnimationFrame(loop);
  };
  const local = (e) => {
    const b = canvas.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };

  if (!reduced) {
    if (finePointer) {
      root.addEventListener('pointermove', (e) => { [px, py] = local(e); wake(); });
      root.addEventListener('pointerleave', () => { px = -1e5; py = -1e5; wake(); });
    }
    root.addEventListener('pointerdown', (e) => {
      const [x, y] = local(e);
      ring = { x, y, t: performance.now() };
      wake();
    });
  }

  layout();
  let lastWidth = w;
  new ResizeObserver(() => {
    if (Math.round(root.getBoundingClientRect().width) === lastWidth) return;
    layout();
    lastWidth = w;
    wake();
  }).observe(root);
  new IntersectionObserver(([entry]) => {
    visible = entry ? entry.isIntersecting : true;
    if (visible) wake();
  }).observe(root);

  // Outfit is a web font; re-set the word once it has loaded so the dots use the real face.
  document.fonts?.load('600 100px Outfit').then(() => { layout(); wake(); }).catch(() => {});
}
