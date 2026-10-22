/**
 * Top bar behaviour:
 *  - frosted, compact state after scrolling
 *  - signal trace fills with scroll progress
 *  - sliding nav indicator that follows hover and the section currently in view
 *  - accessible mobile menu (Esc to close, focus returned to the button)
 */
export function initTopbar() {
  const bar = document.querySelector('[data-topbar]');
  if (!bar) return;

  // --- Scroll state + progress (one rAF-throttled listener) ---
  const progressEl = bar.querySelector('[data-scroll-progress]');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.classList.toggle('is-scrolled', y > 24);
      if (progressEl) progressEl.style.setProperty('--progress', `${max > 0 ? Math.min(100, (y / max) * 100) : 0}%`);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Nav indicator ---
  const nav = bar.querySelector('[data-nav]');
  const indicator = bar.querySelector('[data-nav-indicator]');
  const links = nav ? [...nav.querySelectorAll('.nav__link')] : [];
  let activeLink = links.find((l) => l.getAttribute('aria-current') === 'page') || null;

  const moveTo = (link) => {
    if (!indicator) return;
    if (!link) { indicator.classList.remove('is-visible'); return; }
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    indicator.classList.add('is-visible');
  };

  links.forEach((link) => {
    link.addEventListener('mouseenter', () => moveTo(link));
    link.addEventListener('focus', () => moveTo(link));
  });
  nav?.addEventListener('mouseleave', () => moveTo(activeLink));
  window.addEventListener('resize', () => moveTo(activeLink));

  // Highlight the section in view (home page only).
  const sections = links
    .map((l) => document.getElementById(l.dataset.section))
    .filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          activeLink = links.find((l) => l.dataset.section === e.target.id) || null;
          links.forEach((l) => l.classList.toggle('is-active', l === activeLink));
          if (!nav.matches(':hover')) moveTo(activeLink);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    // Clear the highlight when back in the hero.
    const hero = document.querySelector('.hero');
    if (hero) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { activeLink = null; links.forEach((l) => l.classList.remove('is-active')); moveTo(null); }
      }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
    }
  }
  requestAnimationFrame(() => moveTo(activeLink));

  // --- Mobile menu ---
  const btn = bar.querySelector('[data-menu-btn]');
  const menu = bar.querySelector('[data-mobile-menu]');
  if (!btn || !menu) return;
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    bar.classList.toggle('menu-is-open', open);
    if (open) menu.querySelector('a')?.focus();
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
}
