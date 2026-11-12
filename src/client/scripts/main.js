/**
 * Entry point for public pages. Each feature only loads when its markup is on the page.
 */
document.documentElement.classList.add('js');

const onReady = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

onReady(async () => {
  const has = (sel) => document.querySelector(sel);

  const { initTopbar } = await import('./modules/topbar.js');
  initTopbar();

  const tasks = [];
  if (has('.hero')) tasks.push(import('./modules/hero.js').then((m) => m.initHero()));
  if (has('[data-work-grid]')) tasks.push(import('./modules/work.js').then((m) => m.initWork()));
  if (has('[data-steps]')) tasks.push(import('./modules/steps.js').then((m) => m.initSteps()));
  if (has('[data-brief]')) tasks.push(import('./modules/brief.js').then((m) => m.initBrief()));
  if (has('[data-estimator]')) tasks.push(import('./modules/estimator.js').then((m) => m.initEstimator()));
  if (has('[data-booking]')) tasks.push(import('./modules/booking.js').then((m) => m.initBooking()));
  if (has('[data-testimonials]')) tasks.push(import('./modules/testimonials.js').then((m) => m.initTestimonials()));
  if (has('[data-subscribe]')) tasks.push(import('./modules/subscribe.js').then((m) => m.initSubscribe()));
  if (has('[data-wordmark]')) tasks.push(import('./modules/wordmark.js').then((m) => m.initWordmark()));
  if (has('[data-accordion]')) tasks.push(import('./modules/accordion.js').then((m) => m.initAccordion()));
  await Promise.allSettled(tasks);
});
