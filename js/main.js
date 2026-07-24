// ============================================================
// TEN GRAND — scroll animations
// Two independent, dependency-free patterns:
//   1. `.reveal` fade/slide-in, triggered once per element.
//   2. Scrollytelling step tracker for the supply-chain section,
//      driven by IntersectionObserver on tall trigger divs.
// ============================================================

(() => {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // ---------- 1. Generic reveal-on-scroll ----------

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

  // ---------- 2. Supply chain scrollytelling ----------

  function initSupplyChainScroller() {
    const scroller = document.getElementById('supply-chain-scroller');
    const stepsList = document.getElementById('supply-chain-steps');
    if (!scroller || !stepsList) return;

    const triggers = Array.from(scroller.querySelectorAll('.scroller__trigger'));
    const steps = Array.from(stepsList.querySelectorAll('.step'));
    const stepByName = new Map(steps.map((el) => [el.dataset.step, el]));

    if (prefersReducedMotion) {
      steps.forEach((el) => el.classList.add('is-active'));
      return;
    }

    const setActive = (name) => {
      steps.forEach((el) => {
        el.classList.toggle('is-active', el.dataset.step === name);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActive(entry.target.dataset.step);
          }
        });
      },
      { threshold: 0.5 }
    );

    triggers.forEach((el) => observer.observe(el));

    // Activate the first step by default so the section isn't empty
    // before the user starts scrolling into it.
    setActive(steps[0]?.dataset.step);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initSupplyChainScroller();
  });
})();
