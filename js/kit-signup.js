(() => {
  'use strict';
  document.querySelectorAll('[data-kit-signup]').forEach((container) => {
    const uid = container.dataset.kitUid;
    const modal = container.closest('.modal');
    const status = container.querySelector('[data-kit-status]');
    const retry = container.querySelector('[data-kit-retry]');
    const labels = {
      'fields[first_name]': ['First name', 'given-name'],
      'fields[last_name]': ['Last name', 'family-name'],
      'fields[website]': ['Website', 'url'],
      'fields[instagram]': ['Instagram', 'off'],
      email_address: ['Email', 'email'],
    };
    let loading = false;
    let script = null;
    function styleForm() {
      const form = container.querySelector(`form[data-uid="${uid}"]`);
      if (!form) return;
      loading = false;
      container.setAttribute('aria-busy', 'false');
      status.hidden = true;
      retry.hidden = true;
      if (form.dataset.tenGrandStyled) return;
      form.dataset.tenGrandStyled = 'true';
      Object.entries(labels).forEach(([name, [caption, autocomplete]], index) => {
        const input = form.elements.namedItem(name);
        if (!input) return;
        input.id = `kit-${uid}-field-${index}`;
        input.autocomplete = autocomplete;
        if (name === 'email_address') input.type = 'email';
        if (name === 'fields[website]') input.inputMode = 'url';
        const label = document.createElement('label');
        label.htmlFor = input.id;
        label.textContent = caption + (input.required ? '' : ' (optional)');
        input.parentElement.prepend(label);
      });
      const button = form.querySelector('[data-element="submit"]');
      if (button) {
        button.type = 'submit';
        button.classList.add('cw-join__cta');
        const caption = button.querySelector('span');
        if (caption) caption.textContent = container.dataset.kitButton;
      }
      form.querySelector('[data-element="errors"]')?.setAttribute('role', 'alert');
    }
    function loadForm() {
      if (loading || container.querySelector(`form[data-uid="${uid}"]`)) return;
      loading = true;
      container.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading invitation form…';
      status.hidden = false;
      retry.hidden = true;
      script?.remove();
      script = document.createElement('script');
      script.async = true;
      script.dataset.uid = uid;
      script.src = `https://ten-grand.kit.com/${uid}/index.js`;
      script.addEventListener('load', styleForm);
      script.addEventListener('error', () => {
        loading = false;
        container.setAttribute('aria-busy', 'false');
        status.textContent = 'The invitation form could not load. Please try again.';
        retry.hidden = false;
      });
      container.append(script);
    }
    new MutationObserver(styleForm).observe(container, { childList: true, subtree: true });
    modal?.addEventListener('modal:open', loadForm);
    retry.addEventListener('click', loadForm);
    container.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      status.textContent = 'The invitation form is still connecting. Please wait a moment and try again.';
      status.hidden = false;
    });
  });
})();
