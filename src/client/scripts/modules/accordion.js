/**
 * Services list: opening one service closes the others, so the list stays short.
 */
export function initAccordion() {
  document.querySelectorAll('[data-accordion]').forEach((group) => {
    const items = [...group.querySelectorAll('details')];
    items.forEach((d) =>
      d.addEventListener('toggle', () => {
        if (d.open) items.forEach((o) => { if (o !== d) o.open = false; });
      }),
    );
  });
}
