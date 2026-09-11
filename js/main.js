// ============================================================
// TEN GRAND
//   1. `.reveal` elements fade/slide in once, via IntersectionObserver,
//      as they enter the viewport.
//   2. Shared modal, opened by any element with a `data-modal-title`
//      attribute (used by the engine section's clickable modules).
//   3. Billboard toggle (Different Roads section) — tap a billboard to
//      swap in its alternate title/body and reveal the vandalism
//      placeholder; tap again to return to the default state.
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

  // Bubbles are independent — opening one does not close any others,
  // so several can stay open at once. Each is positioned absolutely
  // (so it can sit flush against the timeline point, opposite the
  // icon/label), which means it does not push later items down on its
  // own. When it is taller than the item's own box, we reserve the
  // extra room as bottom padding so the next stop on the timeline
  // never sits underneath it.
  function initTimelineBubbles() {
    const items = document.querySelectorAll('.amass__timeline-item');
    if (!items.length) return;

    function closeItem(item) {
      const toggle = item.querySelector('.amass__timeline-toggle');
      const bubble = item.querySelector('.amass__timeline-bubble');
      item.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      bubble.hidden = true;
      item.style.paddingBottom = '';
    }

    items.forEach((item) => {
      const toggle = item.querySelector('.amass__timeline-toggle');
      const bubble = item.querySelector('.amass__timeline-bubble');
      if (!toggle || !bubble) return;

      toggle.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');

        if (isOpen) {
          closeItem(item);
        } else {
          item.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
          bubble.hidden = false;

          // All of the item's children are positioned absolutely, so its
          // own content height is always 0 — only paddingTop occupies
          // flow space above that. The bubble sits at top:0 within the
          // item, so the padding-bottom needed to fully contain it (plus
          // a small gap before the next stop) is its distance past the
          // item's top, minus that fixed top padding.
          const paddingTop = parseFloat(getComputedStyle(item).paddingTop) || 0;
          const itemTop = item.getBoundingClientRect().top;
          const bubbleBottom = bubble.getBoundingClientRect().bottom;
          const neededPaddingBottom = bubbleBottom - itemTop - paddingTop + 16;
          item.style.paddingBottom = neededPaddingBottom > paddingTop ? `${neededPaddingBottom}px` : '';
        }
      });
    });
  }

  function initBillboards() {
    const columns = document.querySelectorAll('.dilemma__column');
    if (!columns.length) return;

    const swapDelay = prefersReducedMotion ? 0 : 180;

    // Read each column's billboards + their default/alt copy up front.
    const columnBillboards = Array.from(columns).map((column) =>
      Array.from(column.querySelectorAll('.billboard')).map((billboard) => {
        const trigger = billboard.querySelector('.billboard__frame');
        const boardEl = billboard.querySelector('.billboard__board');
        const copyEl = billboard.querySelector('.billboard__copy');
        const titleEl = billboard.querySelector('.billboard__title');
        const bodyEl = billboard.querySelector('.billboard__body');
        return {
          billboard,
          trigger,
          boardEl,
          copyEl,
          titleEl,
          bodyEl,
          defaultTitle: titleEl.textContent,
          defaultBody: bodyEl.textContent,
          altTitle: billboard.dataset.altTitle || titleEl.textContent,
          altBody: billboard.dataset.altBody || bodyEl.textContent,
        };
      })
    );

    const rowCount = Math.max(...columnBillboards.map((col) => col.length));

    function naturalCopyHeight(entry, title, body) {
      entry.copyEl.style.minHeight = '';
      entry.titleEl.textContent = title;
      entry.bodyEl.textContent = body;
      return entry.copyEl.getBoundingClientRect().height;
    }

    // A "row" is the Nth billboard in each column. Every billboard in
    // a row shares one min-height for its board graphic (the tallest
    // headline in that row) AND for its copy block (the tallest of
    // any billboard's default/alt copy in that row). Reserving the
    // copy's height as a whole — not the title on its own — means the
    // extra room lands after the paragraph text, not between the
    // title and its own body, so titles line up across columns
    // without opening a gap under a short title.
    function reserveRowHeights() {
      for (let row = 0; row < rowCount; row++) {
        let maxBoardHeight = 0;
        let maxCopyHeight = 0;
        const entries = [];

        columnBillboards.forEach((col) => {
          const entry = col[row];
          if (!entry) return;
          entries.push(entry);
          entry.boardEl.style.minHeight = '';
          maxBoardHeight = Math.max(maxBoardHeight, entry.boardEl.getBoundingClientRect().height);
          maxCopyHeight = Math.max(
            maxCopyHeight,
            naturalCopyHeight(entry, entry.defaultTitle, entry.defaultBody),
            naturalCopyHeight(entry, entry.altTitle, entry.altBody)
          );
        });

        entries.forEach((entry) => {
          entry.boardEl.style.minHeight = `${maxBoardHeight}px`;
          entry.titleEl.textContent = entry.billboard.classList.contains('is-active')
            ? entry.altTitle
            : entry.defaultTitle;
          entry.bodyEl.textContent = entry.billboard.classList.contains('is-active')
            ? entry.altBody
            : entry.defaultBody;
          entry.copyEl.style.minHeight = `${maxCopyHeight}px`;
        });
      }
    }

    reserveRowHeights();

    let resizeTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(reserveRowHeights, 200);
    });

    columnBillboards.flat().forEach((entry) => {
      const { billboard, trigger, copyEl, titleEl, bodyEl, defaultTitle, defaultBody, altTitle, altBody } = entry;
      if (!trigger) return;

      trigger.addEventListener('click', () => {
        const isActive = billboard.classList.toggle('is-active');
        trigger.setAttribute('aria-pressed', String(isActive));

        copyEl.classList.add('is-swapping');

        window.setTimeout(() => {
          titleEl.textContent = isActive ? altTitle : defaultTitle;
          bodyEl.textContent = isActive ? altBody : defaultBody;
          copyEl.classList.remove('is-swapping');
        }, swapDelay);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initReveal();
    initModal();
    initTimelineBubbles();
    initBillboards();
  });
})();
