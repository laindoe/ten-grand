(() => {
  'use strict';
  const modal = document.getElementById('grand-scheme-modal');
  if (!modal) return;
  const animation = modal.querySelector('[data-grand-scheme-animation]');
  const signup = modal.querySelector('[data-grand-scheme-signup]');
  const formStatus = modal.querySelector('[data-grand-scheme-form-status]');
  const retry = modal.querySelector('[data-grand-scheme-retry]');
  let signupLoading = false;
  let signupScript = null;
  const fieldLabels = {
    'fields[first_name]': ['First name', 'given-name'],
    'fields[last_name]': ['Last name', 'family-name'],
    'email_address': ['Email', 'email'],
    'fields[alias]': ['Instagram (optional)', 'off'],
  };
  function styleSignupForm() {
    const form = signup.querySelector('form[data-uid="db9ca5304a"]');
    if (!form) return;
    signupLoading = false;
    signup.setAttribute('aria-busy', 'false');
    formStatus.hidden = true;
    retry.hidden = true;
    if (form.dataset.grandSchemeStyled) return;
    form.dataset.grandSchemeStyled = 'true';
    Object.entries(fieldLabels).forEach(([name, [labelText, autocomplete]], index) => {
      const input = form.elements.namedItem(name);
      if (!input) return;
      input.id = `grand-scheme-field-${index}`;
      input.autocomplete = autocomplete;
      if (name === 'email_address') input.type = 'email';
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = labelText;
      input.parentElement.prepend(label);
    });
    const button = form.querySelector('[data-element="submit"]');
    if (button) {
      button.type = 'submit';
      button.classList.add('grand-scheme__cta');
      const caption = button.querySelector('span');
      if (caption) caption.textContent = 'GET THE PLAN';
    }
    const errors = form.querySelector('[data-element="errors"]');
    if (errors) errors.setAttribute('role', 'alert');
  }
  if (signup) {
    const observer = new MutationObserver(styleSignupForm);
    observer.observe(signup, { childList: true, subtree: true });
    retry.addEventListener('click', loadSignupForm);
    // Kit prevents the default submit once its handler is ready. Until then,
    // keep the visitor here rather than navigating to the bare form endpoint.
    signup.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      formStatus.textContent = 'The signup form is still connecting. Please wait a moment and try again.';
      formStatus.hidden = false;
    });
  }
  function loadSignupForm() {
    if (!signup || signupLoading || signup.querySelector('form[data-uid="db9ca5304a"]')) return;
    signupLoading = true;
    signup.setAttribute('aria-busy', 'true');
    formStatus.textContent = 'Loading signup form…';
    formStatus.hidden = false;
    retry.hidden = true;
    signupScript?.remove();
    signupScript = document.createElement('script');
    signupScript.async = true;
    signupScript.dataset.uid = 'db9ca5304a';
    signupScript.src = 'https://ten-grand.kit.com/db9ca5304a/index.js';
    signupScript.addEventListener('load', styleSignupForm);
    signupScript.addEventListener('error', () => {
      signupLoading = false;
      signup.setAttribute('aria-busy', 'false');
      formStatus.textContent = 'The signup form could not load. Please try again.';
      retry.hidden = false;
    });
    signup.append(signupScript);
  }
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
      loadSignupForm();
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
