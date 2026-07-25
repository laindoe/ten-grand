// ============================================================
// TEN GRAND
//   1. `.reveal` elements fade/slide in once, via IntersectionObserver,
//      as they enter the viewport.
//   2. Shared modal, opened by any element with a `data-modal-title`
//      attribute (used by the engine section's clickable modules).
// ============================================================

(() => {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  function initReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    if (prefersReducedMotion) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
    );

    targets.forEach((el) => observer.observe(el));
  }

  function initModal() {
    const modal = document.getElementById('engine-modal');
    if (!modal) return;

    const titleEl = modal.querySelector('.modal__title');
    const bodyEl = modal.querySelector('.modal__body');
    let lastFocused = null;

    function openModal(trigger) {
      lastFocused = trigger;
      titleEl.textContent = trigger.dataset.modalTitle || '';
      bodyEl.textContent = trigger.dataset.modalBody || '';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      modal.querySelector('.modal__close').focus();
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (lastFocused) lastFocused.focus();
    }

    document.querySelectorAll('[data-modal-title]').forEach((trigger) => {
      trigger.addEventListener('click', () => openModal(trigger));
    });

    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initModal();
  });
})();
