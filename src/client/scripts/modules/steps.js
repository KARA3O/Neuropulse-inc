/**
 * Process timeline: the line fills as the section scrolls through the viewport and each
 * step lights up when the line reaches it.
 */
import { prefersReducedMotion } from './api.js';

export function initSteps() {
  const list = document.querySelector('[data-steps]');
  const steps = [...list.querySelectorAll('.step')];

  if (prefersReducedMotion()) {
    list.style.setProperty('--steps-progress', 1);
    steps.forEach((s) => s.classList.add('is-reached'));
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const r = list.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 when the list top reaches 80% of the viewport, 1 when its bottom reaches 55%.
    const progress = Math.min(1, Math.max(0, (vh * 0.8 - r.top) / (r.height + vh * 0.25)));
    list.style.setProperty('--steps-progress', progress.toFixed(3));
    steps.forEach((s, i) => s.classList.toggle('is-reached', progress >= i / (steps.length - 1) - 0.02));
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}
