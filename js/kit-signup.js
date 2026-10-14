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
      'fields[website]': ['Website / portfolio', 'url'],
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
      const orderedNames = ['fields[first_name]', 'fields[last_name]', 'email_address', 'fields[website]', 'fields[instagram]'];
      orderedNames.forEach((name) => {
        const input = form.elements.namedItem(name);
        if (!input) return;
        input.required = name !== 'fields[instagram]';
        const field = input.closest('.formkit-field');
        if (field) {
          const parent = field.parentElement;
          const submit = parent.querySelector('.formkit-submit');
          parent.insertBefore(field, submit?.parentElement === parent ? submit : null);
        }
      });
      form.addEventListener('submit', (event) => {
        orderedNames.forEach((name) => {
          const input = form.elements.namedItem(name);
          if (input) input.value = input.value.trim();
        });
        const website = form.elements.namedItem('fields[website]');
        website.setCustomValidity('');
        try {
          const value = website.value;
          const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value);
          if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password || /\s|\\/.test(value)) throw new Error();
          website.value = url.href;
        } catch {
          website.setCustomValidity('Enter a valid website or portfolio address.');
        }
        if (!form.reportValidity()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
      form.elements.namedItem('fields[website]').addEventListener('input', (event) => event.target.setCustomValidity(''));
      Object.entries(labels).forEach(([name, [caption, autocomplete]], index) => {
        const input = form.elements.namedItem(name);
        if (!input) return;
        input.id = `kit-${uid}-field-${index}`;
        input.autocomplete = autocomplete;
        if (name === 'email_address') input.type = 'email';
        if (name === 'fields[website]') { input.type = 'text'; input.inputMode = 'url'; }
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
      if (fields && !fields.hidden && modal.classList.contains('is-open')) {
        form.elements.namedItem('fields[first_name]')?.focus({ preventScroll: true });
      }
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
    const intro = modal?.querySelector('[data-invitation-intro]');
    const fields = modal?.querySelector('[data-invitation-fields]');
    const next = modal?.querySelector('[data-invitation-next]');
    const back = modal?.querySelector('[data-invitation-back]');
    function showStep(showFields) {
      intro.hidden = showFields;
      fields.hidden = !showFields;
      modal.querySelector('.cw-join__panel').scrollTop = 0;
      if (showFields) {
        loadForm();
        const first = container.querySelector('input');
        if (first) first.focus({ preventScroll: true });
        else back.focus({ preventScroll: true });
      } else next.focus({ preventScroll: true });
    }
    if (intro && fields && next && back) {
      modal.addEventListener('modal:open', () => showStep(false));
      next.addEventListener('click', () => showStep(true));
      back.addEventListener('click', () => showStep(false));
    } else modal?.addEventListener('modal:open', loadForm);
    retry.addEventListener('click', loadForm);
    container.addEventListener('submit', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      status.textContent = 'The invitation form is still connecting. Please wait a moment and try again.';
      status.hidden = false;
    });
  });
})();
