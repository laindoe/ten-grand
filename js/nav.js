// ============================================================
// TEN GRAND — Nav Philosophy dropdown
// Shared across every page that includes _includes/nav.html, so it
// lives in its own small file rather than js/main.js (homepage-only,
// much larger bundle).
// ============================================================

(() => {
  function initNavDropdown() {
    const trigger = document.getElementById('nav-philosophy-trigger');
    const menu = document.getElementById('nav-philosophy-menu');
    if (!trigger || !menu) return;

    const dropdown = trigger.closest('.nav__dropdown');
    const navInner = trigger.closest('.nav__inner');
    const grandScheme = navInner.querySelector('.nav__item--inverse');

    function alignMenu() {
      if (!dropdown || !grandScheme) return;
      const width = grandScheme.getBoundingClientRect().left - dropdown.getBoundingClientRect().left;
      menu.style.setProperty('--nav-menu-width', `${width}px`);
    }

    alignMenu();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(alignMenu);
      Array.from(navInner.children).forEach((item) => observer.observe(item));
    }
    window.addEventListener('resize', alignMenu);
    window.addEventListener('load', alignMenu);

    function close() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    function open() {
      alignMenu();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', () => {
      if (menu.hidden) open();
      else close();
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('.nav__dropdown-link')) close();
    });

    document.addEventListener('click', (event) => {
      if (menu.hidden) return;
      if (event.target === trigger || trigger.contains(event.target)) return;
      if (event.target === menu || menu.contains(event.target)) return;
      close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        close();
        trigger.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initNavDropdown);
})();
