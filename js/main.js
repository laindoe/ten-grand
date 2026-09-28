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
    const ctaEl = modal.querySelector('.modal__cta');
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
      // Same headline/CTA as the desktop callout (see .route__callout in
      // style.css) -- one look for a sign's content, just two different
      // presentations (centred overlay here, side card there).
      titleEl.textContent = trigger.dataset.calloutHeadline || '';
      setBody(trigger.dataset.modalBody || '');
      if (ctaEl) ctaEl.textContent = trigger.dataset.calloutCta || '';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      modal.querySelector('.modal__close').focus();
    }

    function closeModal() {
      const closed = lastFocused;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (lastFocused) lastFocused.focus();
      // Route pins use this to know when to light the next stretch of
      // road (see initRoute) — dispatched after the close so anything
      // listening sees the modal already gone.
      modal.dispatchEvent(new CustomEvent('modal:close', { detail: { trigger: closed } }));
    }

    // Route pins are wired directly by initRoute (their modal only opens
    // on mobile; on desktop the same click just advances the road
    // instead), so they opt out of this generic auto-bind — otherwise
    // this listener would pop the modal open on desktop too.
    document.querySelectorAll('[data-modal-title]').forEach((trigger) => {
      if (trigger.classList.contains('route__pin')) return;
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

    return { modal, open: openModal, close: closeModal };
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

    // .distance__crop clips the tall scene down to a short window on desktop
    // (see css/style.css); a car sliding through that window gets a hard cut
    // wherever its edge crosses the window's top/bottom. Rather than fading
    // that cut (rejected -- it should look like a clean stop, not a dissolve),
    // hide a car outright for the moment it would straddle either edge, in
    // the same stage-local coordinate space top/left are already computed in.
    // On mobile there's no crop transform, so these bounds land at ~0 and
    // ~stageHeight and effectively never trigger.
    const cropEl = document.querySelector('.distance__crop');
    let clipTop = -Infinity;
    let clipBottom = Infinity;
    function measureClipBounds() {
      if (!cropEl) return;
      const cropRect = cropEl.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      clipTop = cropRect.top - stageRect.top;
      clipBottom = clipTop + cropRect.height;
    }
    new ResizeObserver(() => {
      stageWidth = stage.clientWidth;
      stageHeight = stage.clientHeight;
      measureClipBounds();
    }).observe(stage);
    measureClipBounds();

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
        const height = baseHeight * scale;
        const bottom = top + height;
        // A small nick off a car's edge (a few percent of its own height) is
        // an unremarkable, ordinary hard crop -- cars have always looked like
        // that at the frame's edges. Only a severe cut (more than a third of
        // the car itself) reads as broken, so only that gets hidden outright;
        // anything milder is left to the crop's normal overflow clip.
        const hiddenAbovePx = top < clipTop ? Math.min(clipTop, bottom) - top : 0;
        const hiddenBelowPx = bottom > clipBottom ? bottom - Math.max(clipBottom, top) : 0;
        const severelyClipped = Math.max(hiddenAbovePx, hiddenBelowPx) / height > 0.35;

        car.el.style.left = `${left}px`;
        car.el.style.top = `${top}px`;
        car.el.style.width = `${baseWidth * scale}px`;
        car.el.style.height = `${height}px`;
        car.el.style.opacity = severelyClipped ? '0' : String(opacityAt(progress));
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

  // The route used to run once, straight through, on a single CSS class.
  // Now it is five stages — orb-to-development, then one per sign down to
  // distribution, then the final stretch into the globe — and only the
  // first one is automatic. Each of the other four waits for its sign to
  // be dealt with: clicked, and on mobile its modal closed, before the
  // next stretch of road lights up. Desktop has no modal, so there the
  // click itself advances (see the pin click handler below).
  //
  // Stage N is "on" via `route.dataset.stage`, which CSS reads to run that
  // segment's reveal-mask sweep and light the sign it ends at (see the
  // Impact Path v3 rules in style.css). JS never animates anything
  // directly — it only ever changes which stage is current.
  function initRoute(routeModal) {
    const route = document.querySelector('.route');
    if (!route) return;
    const stage = route.querySelector('.route__stage');
    const spark = route.querySelector('.route__spark');
    if (!stage) return;

    const pins = Array.from(route.querySelectorAll('.route__pin'));
    const markers = Array.from(route.querySelectorAll('.rt3-marker'));
    const desktopQuery = window.matchMedia('(min-width: 900px)');
    const totalStages = pins.length + 1; // one per sign, plus the final stretch into the globe

    let currentStage = 0;
    let armFrame = 0;

    function setStage(n) {
      currentStage = n;
      route.dataset.stage = String(n);
    }

    function pinForStage(n) {
      return pins.find((pin) => Number(pin.dataset.stage) === n);
    }

    function advance() {
      if (currentStage < 1 || currentStage >= totalStages) return;
      setStage(currentStage + 1);
    }

    // A sign becomes clickable the moment its own marker ignites, which
    // CSS times to when that stage's sweep reaches it. Listening for the
    // ignite animation, rather than duplicating its delay here in JS,
    // means the two can never drift out of sync.
    markers.forEach((marker) => {
      marker.addEventListener('animationstart', (event) => {
        if (event.animationName !== 'rt3MarkerLight') return;
        marker.classList.add('is-lit'); // e.g. keeps the hurdle's lamps blinking from here on
        const n = Number(route.dataset.stage);
        const pin = pinForStage(n);
        if (pin) pin.classList.add('is-reached');
      });
    });

    // Desktop's equivalent of the mobile modal: a callout card in the open
    // margin beside the road, linked to its sign with a connector line,
    // instead of a centred overlay. Same "click opens it, closing it
    // advances if it was the current sign" pattern as the modal below,
    // just a different presentation for the same content.
    const callout = route.querySelector('.route__callout');
    const calloutHeadline = callout && callout.querySelector('.route__callout-headline');
    const calloutBody = callout && callout.querySelector('.route__callout-body');
    const calloutCta = callout && callout.querySelector('.route__callout-cta');
    let calloutTrigger = null;

    function setCalloutBody(text) {
      calloutBody.textContent = '';
      text.split(/\n\s*\n/).forEach((para) => {
        const trimmed = para.trim();
        if (!trimmed) return;
        const p = document.createElement('p');
        p.textContent = trimmed;
        calloutBody.appendChild(p);
      });
    }

    // Inset of the connector's dot/bullet from whichever card edge is
    // farthest from the label (see openCallout below).
    const CONNECTOR_DOT_INSET = 20;

    function openCallout(pin) {
      if (!callout) return;
      calloutTrigger = pin;
      calloutHeadline.textContent = pin.dataset.calloutHeadline || '';
      setCalloutBody(pin.dataset.modalBody || '');
      calloutCta.textContent = pin.dataset.calloutCta || '';
      // Stems from the label, not the sign -- this measures wherever the
      // label actually renders rather than the pin itself.
      const label = document.getElementById(`route-label-${pin.dataset.stage}`) || pin;
      const stageRect = stage.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      // Drops straight down from the label instead of opening beside it --
      // the card is wide enough that "beside" ran it right over the word.
      // The card's near-the-road edge (right edge for a left-side label,
      // left edge for a right-side one -- the stable edge that side's
      // text already hugs, see .route__pin--left/--right .route__pin-text)
      // lines up under that same edge of the label.
      const side = pin.dataset.calloutSide || 'right';
      const align = side === 'left' ? 'right' : 'left';
      callout.dataset.align = align;
      const top = labelRect.bottom - stageRect.top + 22;
      const cardAttachX = align === 'left' ? labelRect.left : labelRect.right;
      const left = align === 'left'
        ? cardAttachX - stageRect.left
        : cardAttachX - stageRect.left - callout.offsetWidth;
      callout.style.setProperty('--top', `${top}px`);
      callout.style.setProperty('--left', `${left}px`);
      // The connector runs from the very start of the title -- not the
      // label box's near/far edge, which can sit past the title itself
      // when the note line beneath it ("Bring it to life.") is wider --
      // underneath the label, over to the dot, then down into the card.
      // The dot sits toward whichever card edge is FARTHEST from that
      // start point, so the line always travels away from the sign
      // rather than doubling back over it: the far corner is the card's
      // right edge for a left-aligned card (whose left edge already sits
      // at the label), and its left edge for a right-aligned one -- the
      // two sides mirror each other by construction.
      const titleEl = label.querySelector('.route__pin-label') || label;
      const titleRect = titleEl.getBoundingClientRect();
      const attachX = titleRect.left;
      const dotX = align === 'left'
        ? callout.offsetWidth - CONNECTOR_DOT_INSET
        : CONNECTOR_DOT_INSET;
      const attachXRelToCard = attachX - stageRect.left - left;
      const bendLeft = Math.min(attachXRelToCard, dotX);
      const bendWidth = Math.abs(attachXRelToCard - dotX);
      // The underline sits right under the TITLE specifically, not the
      // label box as a whole -- which runs on past it to the note line
      // beneath ("Map out the idea."), so the connector's total height
      // has to stretch past that note too to still reach the card's own
      // top unchanged.
      const connectorHeight = top - (titleRect.bottom - stageRect.top);
      callout.style.setProperty('--connector-height', `${connectorHeight}px`);
      callout.style.setProperty('--connector-dot-x', `${dotX}px`);
      callout.style.setProperty('--connector-bend-left', `${bendLeft}px`);
      callout.style.setProperty('--connector-bend-width', `${bendWidth}px`);
      callout.classList.add('is-open');
      callout.setAttribute('aria-hidden', 'false');
      route.classList.add('route--callout-open');
      // Dims every label but this one's.
      route.querySelectorAll('.route__pin').forEach((el) => {
        el.classList.remove('is-callout-active');
      });
      if (label.parentElement) label.parentElement.classList.add('is-callout-active');
    }

    function closeCallout(advanceIfCurrent) {
      if (!callout || !callout.classList.contains('is-open')) return;
      const wasCurrent = advanceIfCurrent && calloutTrigger && Number(calloutTrigger.dataset.stage) === currentStage;
      callout.classList.remove('is-open');
      callout.setAttribute('aria-hidden', 'true');
      route.classList.remove('route--callout-open');
      route.querySelectorAll('.route__pin').forEach((el) => {
        el.classList.remove('is-callout-active');
      });
      if (calloutTrigger) calloutTrigger.focus();
      calloutTrigger = null;
      if (wasCurrent) advance();
    }

    if (callout) {
      callout.querySelectorAll('[data-callout-close]').forEach((el) => {
        el.addEventListener('click', () => closeCallout(true));
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCallout(true);
      });
    }

    pins.forEach((pin) => {
      pin.addEventListener('click', () => {
        // pointer-events already keeps this to reached signs, but a sign
        // stays reached (and clickable) after it's passed, not just while
        // it's current -- so this only re-checks "is it lit at all", not
        // "is it the current one".
        if (!pin.classList.contains('is-reached')) return;
        if (desktopQuery.matches) {
          openCallout(pin);
        } else if (routeModal) {
          // Mobile always reopens the modal, current sign or a past one --
          // advancing (if this is the current sign) waits for its close,
          // handled by the modal:close listener below.
          routeModal.open(pin);
        }
      });
    });

    if (routeModal) {
      routeModal.modal.addEventListener('modal:close', (event) => {
        const trigger = event.detail && event.detail.trigger;
        if (!trigger || !trigger.classList.contains('route__pin')) return;
        if (Number(trigger.dataset.stage) === currentStage) advance();
      });
    }

    function beginSequence() {
      if (currentStage > 0) return;

      // Give the browser one painted frame with the colour layer forcibly
      // hidden, then start the mask animation and wait one more painted frame
      // before revealing it. This prevents Chromium from briefly compositing
      // the complete gradient while the SVG mask is being promoted. Only the
      // very first stage needs this: by stage two the lit layer is already
      // composited and visible, so later stages just change the stage number.
      route.classList.add('route--armed');
      armFrame = requestAnimationFrame(() => {
        route.classList.add('route--running');
        armFrame = requestAnimationFrame(() => {
          route.classList.remove('route--armed');
          armFrame = 0;
          setStage(1);
        });
      });
    }

    if (spark) spark.addEventListener('click', beginSequence);

    if (prefersReducedMotion) {
      // Nothing to withhold for motion — show it all lit immediately, same
      // as the rest of the site does for reduced motion, but signs still
      // need to be reachable so their modals stay openable on mobile.
      setStage(totalStages);
      pins.forEach((pin) => pin.classList.add('is-reached'));
      markers.forEach((marker) => marker.classList.add('is-lit'));
      return;
    }

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
        beginSequence();
      } else if (lit && (box.bottom <= top || box.top >= bottom)) {
        // reset only once it is entirely gone: the road un-colouring (and a
        // sign going dark again) is what would make the replay read as a
        // glitch, so it happens unseen. Progress resets with it — scrolling
        // back plays the whole sequence again from the orb.
        lit = false;
        if (armFrame) cancelAnimationFrame(armFrame);
        armFrame = 0;
        currentStage = 0;
        route.dataset.stage = '0';
        route.classList.remove('route--armed');
        route.classList.remove('route--running');
        pins.forEach((pin) => pin.classList.remove('is-reached'));
        markers.forEach((marker) => marker.classList.remove('is-lit'));
        closeCallout(false);
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
    const routeModal = initModal();
    initRoute(routeModal);
    initTimelineBubbles();
    initBillboards();
    initHighwayCars();
  });
})();
