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

    // One <p> per paragraph, split on blank lines, so the copy in
    // _data/route.yml can run to more than a sentence. textContent per
    // paragraph, so nothing in a data file can inject markup.
    function setBody(text) {
      bodyEl.textContent = '';
      text.split(/\n\s*\n/).forEach((para) => {
        const trimmed = para.trim();
        if (!trimmed) return;
        const p = document.createElement('p');
        p.textContent = trimmed;
        bodyEl.appendChild(p);
      });
    }

    function openModal(trigger) {
      lastFocused = trigger;
      titleEl.textContent = trigger.dataset.modalTitle || '';
      setBody(trigger.dataset.modalBody || '');
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
  // so several can stay open at once. Each item is a CSS grid row with
  // the bubble as a normal (not absolutely positioned) grid cell, so
  // the row's height already grows to fit an open bubble on its own —
  // no manual measuring needed here.
  function initTimelineBubbles() {
    const items = document.querySelectorAll('.amass__timeline-item');
    if (!items.length) return;

    items.forEach((item) => {
      const toggle = item.querySelector('.amass__timeline-toggle');
      const bubble = item.querySelector('.amass__timeline-bubble');
      if (!toggle || !bubble) return;

      toggle.addEventListener('click', () => {
        const isOpen = item.classList.contains('is-open');
        item.classList.toggle('is-open', !isOpen);
        toggle.setAttribute('aria-expanded', String(!isOpen));
        bubble.hidden = isOpen;
      });
    });
  }

  // Chromium normally rasterizes each transformed car once and lets the GPU
  // shrink that texture for the rest of the drive. Fine SVG lines then blink
  // between physical pixels near the horizon. Drive width, height and
  // position from requestAnimationFrame instead: these layout properties make
  // the browser repaint the actual vectors at their current size every frame.
  function initHighwayCars() {
    if (prefersReducedMotion) return;

    const stage = document.querySelector('.distance__visual');
    if (!stage) return;
    const elements = Array.from(stage.querySelectorAll('.highway__car'));
    if (!elements.length) return;

    const lanes = {
      centre: { duration: 17999, from: 1.65300, to: 0.01680 },
      left:   { duration: 22498, from: 4.09987, to: 0.04167 },
      right:  { duration: 14399, from: 4.12350, to: 0.04191 },
    };
    const opacityStops = [
      [0, 1], [2 / 3, 1], [0.708333, 0.827], [0.75, 0.632],
      [0.791667, 0.471], [0.833333, 0.338], [0.875, 0.228],
      [0.916667, 0.137], [0.958333, 0.062], [1, 0],
    ];

    const cars = elements.map((el) => {
      const lane = el.classList.contains('highway__car--centre')
        ? 'centre'
        : el.classList.contains('highway__car--left') ? 'left' : 'right';
      const style = getComputedStyle(el);
      const origin = style.transformOrigin.split(' ').map(parseFloat);
      const plate = el.querySelector('.highway__plate');
      return {
        el,
        plate,
        lane,
        delay: Math.abs(parseFloat(style.getPropertyValue('--drive-delay'))) * 1000,
        leftRatio: el.offsetLeft / stage.clientWidth,
        topRatio: el.offsetTop / stage.clientHeight,
        widthRatio: el.offsetWidth / stage.clientWidth,
        heightRatio: el.offsetHeight / stage.clientHeight,
        originXRatio: origin[0] / el.offsetWidth,
        originYRatio: origin[1] / el.offsetHeight,
        plateFont: parseFloat(getComputedStyle(plate).fontSize),
      };
    });

    function opacityAt(progress) {
      for (let i = 1; i < opacityStops.length; i++) {
        const next = opacityStops[i];
        if (progress <= next[0]) {
          const prev = opacityStops[i - 1];
          const span = next[0] - prev[0];
          const local = span ? (progress - prev[0]) / span : 0;
          return prev[1] + (next[1] - prev[1]) * local;
        }
      }
      return 0;
    }

    let stageWidth = stage.clientWidth;
    let stageHeight = stage.clientHeight;
    new ResizeObserver(() => {
      stageWidth = stage.clientWidth;
      stageHeight = stage.clientHeight;
    }).observe(stage);

    let running = false;
    let frame = 0;
    let startedAt = 0;

    function draw(now) {
      if (!running) return;
      const elapsed = now - startedAt;
      cars.forEach((car) => {
        const lane = lanes[car.lane];
        const progress = ((elapsed + car.delay) % lane.duration) / lane.duration;
        const scale = lane.from * Math.pow(lane.to / lane.from, progress);
        const baseLeft = car.leftRatio * stageWidth;
        const baseTop = car.topRatio * stageHeight;
        const baseWidth = car.widthRatio * stageWidth;
        const baseHeight = car.heightRatio * stageHeight;
        const left = baseLeft + baseWidth * car.originXRatio * (1 - scale);
        const top = baseTop + baseHeight * car.originYRatio * (1 - scale);

        car.el.style.left = `${left}px`;
        car.el.style.top = `${top}px`;
        car.el.style.width = `${baseWidth * scale}px`;
        car.el.style.height = `${baseHeight * scale}px`;
        car.el.style.opacity = String(opacityAt(progress));
        car.el.style.zIndex = String(Math.max(1, 48 - Math.floor(progress * 48)));
        car.plate.style.fontSize = `${car.plateFont * scale}px`;
      });
      frame = requestAnimationFrame(draw);
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries[0].isIntersecting;
      if (visible === running) return;
      running = visible;
      if (running) {
        stage.classList.add('is-frame-driven');
        startedAt = performance.now();
        frame = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(frame);
      }
    });
    observer.observe(stage);
  }

  // The whole route sequence — the colour running down the road, each dot
  // taking its colour, the globe igniting — is CSS with its own delays, so all
  // this has to do is toggle one class. The remove/reflow/add is what lets it
  // replay: restarting a CSS animation needs the element to leave the
  // animating state for one frame.
  //
  // It runs itself once enough of the drawing is on screen, and resets only
  // once the drawing is ENTIRELY gone. That second threshold is the whole
  // trick: the road un-colouring is what would make a replay read as a glitch,
  // so it is only ever done while nobody can see it.
  function initRoute() {
    const route = document.querySelector('.route');
    if (!route) return;
    const stage = route.querySelector('.route__stage');
    const spark = route.querySelector('.route__spark');
    if (!stage) return;

    function run() {
      if (route.classList.contains('route--running')) return;
      route.classList.add('route--running');
    }

    if (spark) spark.addEventListener('click', run);
    if (prefersReducedMotion) return;

    // The sticky nav covers the top of the viewport, so it comes off the room
    // available — otherwise "on screen" counts pixels sitting behind it.
    const nav = document.querySelector('.nav');
    const navHeight = nav ? Math.round(nav.getBoundingClientRect().height) : 0;

    // Deliberately not an IntersectionObserver. A threshold has to be low
    // enough to be reachable on a short screen, and then on a tall one it
    // fires with the globe still under the fold — which is the one thing this
    // section must not do. Worse, an observer only reports at a threshold
    // crossing, so a fast flick that lands on the section can skip every one
    // of them and it never plays at all. Measuring the box on scroll-idle
    // fires on where the reader actually STOPPED, however they got there.
    let lit = false;
    let ticking = false;

    function check() {
      ticking = false;
      const box = stage.getBoundingClientRect();
      const top = navHeight;
      const bottom = window.innerHeight;
      const room = bottom - top;
      // whole thing in view, with a couple of pixels of grace; if it cannot
      // fit at all, settle for most of the room it has
      const ready = box.height <= room
        ? box.top >= top - 8 && box.bottom <= bottom + 8
        : Math.min(box.bottom, bottom) - Math.max(box.top, top) >= room * 0.9;
      if (!lit && ready) {
        lit = true;
        run();
      } else if (lit && (box.bottom <= top || box.top >= bottom)) {
        // reset only once it is entirely gone: the road un-colouring is what
        // would make the replay read as a glitch, so it happens unseen
        lit = false;
        route.classList.remove('route--running');
      }
    }

    function schedule() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(check);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    check();
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
    initRoute();
    initTimelineBubbles();
    initBillboards();
    initHighwayCars();
  });
})();
