(() => {
  'use strict';
  const modal = document.getElementById('grand-scheme-modal');
  if (!modal) return;
  const animation = modal.querySelector('[data-grand-scheme-animation]');
  let trigger = null;
  let scrollY = 0;
  let bodyStyle = '';
  function playback() {
    animation.contentWindow?.postMessage({ type: 'grand-scheme:playback', active: modal.open }, location.origin);
  }
  animation.addEventListener('load', playback);
  document.querySelectorAll('[data-grand-scheme-open]').forEach((button) => {
    button.addEventListener('click', () => {
      if (modal.open) return;
      trigger = button;
      scrollY = window.scrollY;
      bodyStyle = document.body.style.cssText;
      modal.showModal();
      document.documentElement.classList.add('grand-scheme-open');
      // Fixed positioning also locks the page on mobile Safari.
      Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%' });
      if (!animation.hasAttribute('src')) animation.src = animation.dataset.src;
      else playback();
    });
  });
  modal.querySelector('[data-grand-scheme-close]').addEventListener('click', () => modal.close());
  let backdropDown = false;
  function outside(event) {
    const rect = modal.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  modal.addEventListener('pointerdown', (event) => { backdropDown = outside(event); });
  modal.addEventListener('click', (event) => {
    if (backdropDown && outside(event)) modal.close();
    backdropDown = false;
  });
  modal.addEventListener('close', () => {
    playback();
    document.documentElement.classList.remove('grand-scheme-open');
    document.body.style.cssText = bodyStyle;
    const previousBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, scrollY);
    document.documentElement.style.scrollBehavior = previousBehavior;
    trigger?.focus({ preventScroll: true });
  });
})();
