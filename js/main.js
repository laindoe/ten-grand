// ============================================================
// TEN GRAND
//   1. `.reveal` elements fade/slide in once, via IntersectionObserver,
//      as they enter the viewport.
//   2. Shared modal, opened by any element with a `data-modal-title`
//      attribute (used by the engine section's clickable modules).
//   3. Distance section's dot particles: pointer/touch repulsion with
//      a spring back to rest, layered on top of the ambient CSS
//      drift animation (see .distance__push / .distance__drift).
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

  function initDistanceParticles() {
    const visual = document.querySelector('.distance__visual');
    if (!visual || prefersReducedMotion) return;

    const REPEL_RADIUS = 90; // px — pointer influence range
    const REPEL_FORCE = 14; // velocity kick applied at zero distance
    const SPRING = 0.02; // pull back toward rest position each frame
    const DAMPING = 0.9; // velocity decay each frame

    const particles = Array.from(
      visual.querySelectorAll('.distance__point')
    ).map((point) => ({
      point,
      push: point.querySelector('.distance__push'),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }));

    let pointerX = null;
    let pointerY = null;
    let clearTimeoutId = null;

    function setPointer(clientX, clientY) {
      if (clearTimeoutId) {
        clearTimeout(clearTimeoutId);
        clearTimeoutId = null;
      }
      const rect = visual.getBoundingClientRect();
      pointerX = clientX - rect.left;
      pointerY = clientY - rect.top;
    }

    // A quick tap fires pointerdown then pointerup almost instantly —
    // clearing on pointerup right away would leave the physics loop
    // no frame to ever see the touch. Give it a brief grace period so
    // a plain tap still produces a visible push before fading.
    function scheduleClearPointer() {
      if (clearTimeoutId) clearTimeout(clearTimeoutId);
      clearTimeoutId = setTimeout(() => {
        pointerX = null;
        pointerY = null;
        clearTimeoutId = null;
      }, 150);
    }

    // pointerdown too, not just pointermove — a plain tap/touch (no
    // drag) should still register a position and trigger the push.
    window.addEventListener('pointerdown', (event) => {
      setPointer(event.clientX, event.clientY);
    });
    window.addEventListener('pointermove', (event) => {
      setPointer(event.clientX, event.clientY);
    });
    window.addEventListener('pointerup', scheduleClearPointer);
    window.addEventListener('pointercancel', scheduleClearPointer);
    document.addEventListener('pointerleave', scheduleClearPointer);

    function tick() {
      const rect = visual.getBoundingClientRect();

      particles.forEach((p) => {
        if (!p.push) return;

        const homeX = (parseFloat(p.point.style.left) / 100) * rect.width;
        const homeY = (parseFloat(p.point.style.top) / 100) * rect.height;
        const currentX = homeX + p.x;
        const currentY = homeY + p.y;

        if (pointerX !== null) {
          const dx = currentX - pointerX;
          const dy = currentY - pointerY;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS && dist > 0.01) {
            const force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Spring back toward rest position, with damping so it settles.
        p.vx += -p.x * SPRING;
        p.vy += -p.y * SPRING;
        p.vx *= DAMPING;
        p.vy *= DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        p.push.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)`;
      });

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initModal();
    initDistanceParticles();
  });
})();
