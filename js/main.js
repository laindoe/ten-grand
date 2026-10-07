// ============================================================
// TEN GRAND
//   1. `.reveal` elements fade/slide in once, via IntersectionObserver,
//      as they enter the viewport.
//   2. Shared modal, opened by any element with a `data-modal-title`
//      attribute (used by the engine section's clickable modules).
//   3. Billboard toggle (Different Roads section) — tap a billboard to
//      swap in its alternate title/body and reveal the vandalism
//      placeholder; tap again to return to the default state.
//   4. Simple static modals — a `[data-modal-open="id"]` trigger opens
//      the `.modal` with that id. Content lives in the markup itself
//      (unlike the engine modal above, nothing is populated from data
//      attributes), so this just handles open/close/focus.
// ============================================================

(() => {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  // position:fixed removes <body> from the document's normal flow, which
  // collapses the page's own scrollable height for as long as any modal
  // holds the lock below -- and anything still listening for 'scroll' or
  // 'resize' during that window (see initRoute's scroll-driven sequence)
  // can misread that collapse as the page having scrolled away, and reset
  // state that has nothing to do with the modal. This shared counter lets
  // that kind of listener ignore scroll/resize noise for exactly as long
  // as the page is actually locked, regardless of what triggers it on a
  // given browser.
  let activeScrollLocks = 0;

  // Shared by every modal on the page: position:fixed + scroll offset
  // compensation + scrollbar-width padding compensation, so the page
  // behind an open modal can't scroll on mobile (including iOS, where
  // plain overflow:hidden on body doesn't stop background scroll). Each
  // modal gets its own lock/unlock pair from this factory so it only
  // ever restores the scroll position it itself saved.
  function createScrollLock() {
    let scrollLock = null;

    function lock() {
      if (scrollLock) return;
      activeScrollLocks += 1;
      const body = document.body;
      const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'];
      scrollLock = {
        x: window.scrollX,
        y: window.scrollY,
        styles: properties.map((property) => [
          property, body.style.getPropertyValue(property), body.style.getPropertyPriority(property),
        ]),
      };
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.setProperty('position', 'fixed');
      body.style.setProperty('top', `-${scrollLock.y}px`);
      body.style.setProperty('left', `-${scrollLock.x}px`);
      body.style.setProperty('width', '100%');
      body.style.setProperty('overflow', 'hidden');
      if (scrollbar > 0) body.style.setProperty('padding-right', `${padding + scrollbar}px`);
    }

    function unlock() {
      if (!scrollLock) return;
      const saved = scrollLock;
      scrollLock = null;
      saved.styles.forEach(([property, value, priority]) => {
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      });
      // The page is back in normal flow now, so drop the count BEFORE the
      // scrollTo below -- that call's own 'scroll' event is the real,
      // legitimate one that scroll-driven listeners should still see.
      activeScrollLocks = Math.max(0, activeScrollLocks - 1);
      // Restore instantly even when the page uses smooth scrolling.
      const root = document.documentElement;
      const behavior = root.style.getPropertyValue('scroll-behavior');
      const priority = root.style.getPropertyPriority('scroll-behavior');
      root.style.setProperty('scroll-behavior', 'auto', 'important');
      window.scrollTo(saved.x, saved.y);
      if (behavior) root.style.setProperty('scroll-behavior', behavior, priority);
      else root.style.removeProperty('scroll-behavior');
    }

    return { lock, unlock };
  }

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
    const prevEl = modal.querySelector('.modal__cta-prev');
    const tagEl = modal.querySelector('.modal__tag');
    const tagTextEl = modal.querySelector('.modal__tag-text');
    // openedBy is the pin this modal session was opened for -- it stays
    // put while the reader browses backward inside the overlay (see
    // prevEl below), so closing the modal still correctly judges whether
    // the FRONTIER stage (not whatever stage is currently on screen) is
    // what's being closed, and so advances the road only then. currentTrigger
    // tracks whatever's actually on screen right now, which is what the
    // prev button itself needs to step one further back each time.
    let openedBy = null;
    let currentTrigger = null;

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
      currentTrigger = trigger;
      if (!modal.classList.contains('is-open')) openedBy = trigger;
      // Same headline/CTA as the desktop callout (see .route__callout in
      // style.css) -- one look for a sign's content, just two different
      // presentations (centred overlay here, side card there).
      titleEl.textContent = trigger.dataset.calloutHeadline || '';
      setBody(trigger.dataset.modalBody || '');
      if (tagTextEl) tagTextEl.textContent = trigger.dataset.calloutTag || '';
      if (tagEl) {
        const accent = trigger.dataset.calloutTagColor || '';
        if (accent) tagEl.style.setProperty('--tag-accent', accent);
        else tagEl.style.removeProperty('--tag-accent');
      }
      if (ctaEl) {
        // Names the next sign, same as the desktop callout's CTA -- just
        // as a preview here, since tapping it only closes the modal
        // (mobile always leaves picking the next sign to the reader, see
        // initRoute), not a link to that sign the way desktop's is.
        const nextStage = Number(trigger.dataset.stage) + 1;
        const nextLabel = document.querySelector(`.route__pin[data-stage="${nextStage}"] .route__pin-label`);
        ctaEl.textContent = nextLabel ? nextLabel.textContent : 'IMPACT';
      }
      if (prevEl) {
        // Stage 1 has nothing behind it, so it keeps showing only the
        // single next button, exactly as before this link existed.
        const prevStage = Number(trigger.dataset.stage) - 1;
        const prevPin = prevStage >= 1
          ? document.querySelector(`.route__pin[data-stage="${prevStage}"]`)
          : null;
        const prevLabel = prevPin && prevPin.querySelector('.route__pin-label');
        prevEl.textContent = prevLabel ? prevLabel.textContent : '';
        prevEl.hidden = !prevPin;
      }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      modal.querySelector('.modal__close').focus({ preventScroll: true });
    }

    function closeModal() {
      const closed = openedBy;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      if (openedBy) openedBy.focus({ preventScroll: true });
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

    // Unlike the next/close button, this reopens the modal in place on
    // the previous sign rather than closing it -- mobile never "advances"
    // backward, it just re-populates the same overlay.
    if (prevEl) {
      prevEl.addEventListener('click', () => {
        const prevStage = Number(currentTrigger && currentTrigger.dataset.stage) - 1;
        const prevPin = document.querySelector(`.route__pin[data-stage="${prevStage}"]`);
        if (prevPin) openModal(prevPin);
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    return { modal, open: openModal, close: closeModal };
  }

  // Each [data-modal-open="id"] trigger opens the .modal with that id.
  // Content is static markup, so unlike initModal there's nothing to
  // populate — just the same open/close/focus/backdrop/Escape mechanics,
  // plus the same scroll lock every modal on the site now gets.
  function initSimpleModals() {
    document.querySelectorAll('[data-modal-open]').forEach((trigger) => {
      const modal = document.getElementById(trigger.dataset.modalOpen);
      if (!modal) return;
      let lastFocused = null;
      const { lock: lockScroll, unlock: unlockScroll } = createScrollLock();

      function openModal() {
        if (modal.classList.contains('is-open')) return;
        lastFocused = trigger;
        lockScroll();
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        modal.querySelector('.modal__close').focus({ preventScroll: true });
      }

      function closeModal() {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        unlockScroll();
        if (lastFocused) lastFocused.focus({ preventScroll: true });
        modal.dispatchEvent(new CustomEvent('modal:close'));
      }

      trigger.addEventListener('click', openModal);
      modal.querySelectorAll('[data-modal-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
          closeModal();
        }
      });
    });
  }

  function initAmassSubmission() {
    const modal = document.getElementById('amass-modal');
    const form = document.getElementById('amass-voice-form');
    if (!modal || !form) return;

    const titleEl = modal.querySelector('.modal__title');
    const steps = Array.from(modal.querySelectorAll('[data-amass-step]'));
    const nameInput = form.elements.name;
    const roleInputs = Array.from(form.elements.role);
    const whyInput = form.elements.why_detail;
    const websiteTitleInput = form.elements.website_title;
    const websiteInput = form.elements.website;
    const websiteError = document.getElementById('amass-website-error');
    const responseTitleInput = form.elements.response_title;
    const platformInput = form.elements.social_platform;
    const handleInput = form.elements.social_handle;
    const socialError = document.getElementById('amass-social-error');
    const photoInput = document.getElementById('amass-photo-input');
    const photoPreviewImg = document.getElementById('amass-photo-preview-img');
    const photoPreviewEmpty = document.getElementById('amass-photo-preview-empty');
    const photoRemoveBtn = document.getElementById('amass-photo-remove-btn');
    const removalToggle = document.getElementById('amass-removal-toggle');
    const removalPanel = document.getElementById('amass-removal-panel');
    const errorEl = document.getElementById('amass-form-error');
    const submitButton = form.querySelector('[type="submit"]');
    const reviewEl = document.getElementById('amass-review');
    const countEl = document.getElementById('amass-voice-count');
    const focusHelper = document.getElementById('amass-focus-helper');
    const focusGrid = document.getElementById('amass-focus-grid');
    const focusCounter = document.getElementById('amass-focus-counter');
    const focusOtherInput = document.getElementById('amass-focus-other');
    const recordButton = document.getElementById('amass-record-button');
    const recordLabel = document.getElementById('amass-record-label');
    const recordHint = document.getElementById('amass-record-hint');
    const recordMicIcon = recordButton.querySelector('.amass-record__icon--mic');
    const recordStopIcon = recordButton.querySelector('.amass-record__icon--stop');
    const recordPreview = document.getElementById('amass-record-preview');
    const recordAudio = document.getElementById('amass-record-audio');
    const recordPlayBtn = document.getElementById('amass-record-play');
    const recordPlayLabel = document.getElementById('amass-record-play-label');
    const recordPlayIcon = recordPlayBtn.querySelector('.amass-record__saved-icon--play');
    const recordPauseIcon = recordPlayBtn.querySelector('.amass-record__saved-icon--pause');
    const recordDeleteBtn = document.getElementById('amass-record-delete');
    const recordRerecordBtn = document.getElementById('amass-record-rerecord');
    const writeToggle = document.getElementById('amass-write-toggle');
    const writePanel = document.getElementById('amass-write-panel');
    const writeDisclosure = document.getElementById('amass-write-disclosure');
    const recordWrap = document.getElementById('amass-record');
    const recordDisclaimer = document.getElementById('amass-record-disclaimer');
    const roleConfig = {
      create: {
        label: 'I CREATE',
        verb: 'create',
        whatTitle: 'WHAT DO YOU CREATE?',
        whyTitle: 'WHY DO YOU CREATE?',
        whyPlaceholder: 'Tell us why you create...',
        accent: '#e5dc16',
        accentBlend: '#b5e619',
        focusOptions: ['Music', 'Film', 'Animation', 'Design', 'Writing', 'Photography', 'Fashion', 'Visual Art', 'Games', 'Live Experiences', 'Other'],
      },
      build: {
        label: 'I BUILD',
        verb: 'build',
        whatTitle: 'WHAT DO YOU BUILD?',
        whyTitle: 'WHY DO YOU BUILD?',
        whyPlaceholder: 'Tell us why you build...',
        accent: '#be2026',
        accentBlend: '#e85f1c',
        focusOptions: ['Studios', 'Venues', 'Platforms', 'Technology', 'Agencies', 'Distribution', 'Manufacturing', 'Education', 'Communities', 'Creative Services', 'Other'],
      },
      fund: {
        label: 'I FUND',
        verb: 'fund',
        whatTitle: 'WHAT DO YOU FUND?',
        whyTitle: 'WHY DO YOU FUND?',
        whyPlaceholder: 'Tell us why you fund...',
        accent: '#007938',
        accentBlend: '#00c49a',
        focusOptions: ['Artists', 'Music', 'Film', 'Media', 'Startups', 'Products', 'Events', 'Creative Spaces', 'Community Projects', 'Education', 'Other'],
      },
      support: {
        label: 'I SUPPORT',
        verb: 'support',
        whatTitle: 'WHAT DO YOU SUPPORT?',
        whyTitle: 'WHY DO YOU SUPPORT?',
        whyPlaceholder: 'Tell us why you support...',
        accent: '#00b0e0',
        accentBlend: '#1fe0c7',
        focusOptions: ['Music', 'Film', 'Art', 'Fashion', 'Games', 'Independent Creators', 'Local Culture', 'Live Events', 'Creative Businesses', 'Community Projects', 'Other'],
      },
    };
    const titles = {
      1: 'AMASS Comm(unity) Wall',
      2: 'WHAT SHOULD WE CALL YOU?',
      3: 'HOW DO YOU SHOW UP?',
      6: 'MAKE YOURSELF VISIBLE',
      7: 'READY TO LEAVE YOUR MARK?',
      8: 'WE HEAR YOU.',
    };
    let currentStep = 1;
    let isSubmitting = false;
    let flowVersion = 0;
    let lastFocusRole = null;
    let photoObjectUrl = null;

    function clearPhoto() {
      photoInput.value = '';
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
        photoObjectUrl = null;
      }
      photoPreviewImg.src = '';
      photoPreviewImg.hidden = true;
      photoPreviewEmpty.hidden = false;
      photoRemoveBtn.hidden = true;
    }

    function setPhoto(file) {
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      photoObjectUrl = URL.createObjectURL(file);
      photoPreviewImg.src = photoObjectUrl;
      photoPreviewImg.hidden = false;
      photoPreviewEmpty.hidden = true;
      photoRemoveBtn.hidden = false;
    }

    function selectedRole() {
      const selected = roleInputs.find((input) => input.checked);
      return selected ? selected.value : '';
    }

    // --- Voice recording (step 5) ---
    const MAX_RECORDING_SECONDS = 30;
    const micSupported = Boolean(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder
    );
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    let audioObjectUrl = null;
    let recordingTimer = null;
    let recordingStartedAt = 0;
    let recordedSeconds = 0;

    // Chromium doesn't reflect the .hidden IDL property to the actual
    // `hidden` content attribute on <svg> elements, so toggling icons
    // via plain `svgEl.hidden = true` silently fails (the element never
    // gets display: none). Setting the attribute directly works around it.
    function setSvgHidden(svgEl, isHidden) {
      if (isHidden) svgEl.setAttribute('hidden', '');
      else svgEl.removeAttribute('hidden');
    }

    function formatClock(totalSeconds) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    // MediaRecorder's default mimeType varies by browser (webm/opus in
    // Chrome/Firefox, mp4/aac in Safari) -- this just picks a sane file
    // extension to match whatever it actually recorded.
    function audioFileExtension(mimeType) {
      if (!mimeType) return 'webm';
      if (mimeType.includes('mp4')) return 'm4a';
      if (mimeType.includes('ogg')) return 'ogg';
      if (mimeType.includes('wav')) return 'wav';
      return 'webm';
    }

    // Sets an orb's two gradient stops + its glow fill to the selected
    // role's accent pair (same --tag-accent-style inline custom property
    // technique as .modal__tag) -- falls back to the CSS defaults
    // (var(--color-accent)/var(--color-vandalism)) via removeProperty if
    // no role is selected yet. Shared by the record button's orb and the
    // success screen's orb.
    function setOrbColor(el) {
      const config = roleConfig[selectedRole()];
      if (config) {
        el.style.setProperty('--role-accent', config.accent);
        el.style.setProperty('--role-accent-blend', config.accentBlend);
      } else {
        el.style.removeProperty('--role-accent');
        el.style.removeProperty('--role-accent-blend');
      }
    }

    function clearWrittenResponse() {
      whyInput.value = '';
      const counter = modal.querySelector('[data-counter-for="amass-why-detail"]');
      if (counter) counter.textContent = '0';
      writeToggle.setAttribute('aria-expanded', 'false');
      writePanel.hidden = true;
    }

    function setPlayIcon(isPlaying) {
      setSvgHidden(recordPlayIcon, isPlaying);
      setSvgHidden(recordPauseIcon, !isPlaying);
      recordPlayLabel.textContent = isPlaying ? 'Pause' : 'Play';
    }

    function resetRecording() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      clearTimeout(recordingTimer);
      mediaRecorder = null;
      audioChunks = [];
      audioBlob = null;
      recordedSeconds = 0;
      recordAudio.pause();
      setPlayIcon(false);
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
        audioObjectUrl = null;
      }
      recordAudio.removeAttribute('src');
      recordPreview.hidden = true;
      recordButton.hidden = false;
      recordButton.classList.remove('is-recording');
      setSvgHidden(recordMicIcon, false);
      setSvgHidden(recordStopIcon, true);
      recordLabel.textContent = 'Record Your Voice';
      recordHint.textContent = micSupported
        ? `Up to ${MAX_RECORDING_SECONDS} seconds.`
        : 'Recording isn’t supported in this browser.';
      recordButton.disabled = !micSupported;
    }

    function handleRecordingStopped() {
      clearTimeout(recordingTimer);
      recordedSeconds = Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - recordingStartedAt) / 1000));
      audioBlob = new Blob(audioChunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm' });
      audioObjectUrl = URL.createObjectURL(audioBlob);
      recordAudio.src = audioObjectUrl;
      recordButton.hidden = true;
      recordButton.classList.remove('is-recording');
      recordPreview.hidden = false;
      recordLabel.textContent = 'Recording Saved';
      recordHint.textContent = formatClock(recordedSeconds);
      // Enforces "audio or written, not both" -- recording a voice
      // response clears whatever was typed in the other field.
      clearWrittenResponse();
    }

    async function startRecording() {
      if (!micSupported || audioBlob) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data && event.data.size > 0) audioChunks.push(event.data);
        });
        mediaRecorder.addEventListener('stop', () => {
          stream.getTracks().forEach((track) => track.stop());
          handleRecordingStopped();
        });
        mediaRecorder.start();
        recordingStartedAt = Date.now();
        recordButton.classList.add('is-recording');
        setSvgHidden(recordMicIcon, true);
        setSvgHidden(recordStopIcon, false);
        recordLabel.textContent = 'Recording…';
        const tick = () => {
          const elapsed = Math.min(MAX_RECORDING_SECONDS, (Date.now() - recordingStartedAt) / 1000);
          recordHint.textContent = `${formatClock(elapsed)} / 0:${MAX_RECORDING_SECONDS}`;
          if (elapsed >= MAX_RECORDING_SECONDS) {
            stopRecording();
          } else {
            recordingTimer = setTimeout(tick, 200);
          }
        };
        tick();
      } catch (error) {
        console.error('Ten Grand voice recording failed to start', error);
        recordHint.textContent = 'Microphone access was denied.';
      }
    }

    function stopRecording() {
      clearTimeout(recordingTimer);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    }

    function socialIsValid() {
      return Boolean(platformInput.value) === Boolean(handleInput.value.trim());
    }

    function websiteIsValid() {
      return Boolean(websiteTitleInput.value.trim()) === Boolean(websiteInput.value.trim());
    }

    function setNextState() {
      const next = modal.querySelector(`[data-amass-step="${currentStep}"] [data-amass-next]`);
      if (!next) return;
      if (currentStep === 2) next.disabled = !nameInput.value.trim();
      if (currentStep === 3) next.disabled = !selectedRole();
      if (currentStep === 6) next.disabled = !socialIsValid() || !websiteIsValid();
    }

    function updateWhyPlaceholder() {
      const config = roleConfig[selectedRole()];
      if (config) whyInput.placeholder = config.whyPlaceholder;
    }

    function selectedFocusButtons() {
      return Array.from(focusGrid.querySelectorAll('.amass-focus-option.is-selected'));
    }

    function updateFocusCounter() {
      focusCounter.textContent = `${selectedFocusButtons().length} / 3 selected`;
    }

    function updateFocusOtherVisibility() {
      const otherSelected = selectedFocusButtons().some((button) => button.dataset.value === 'Other');
      focusOtherInput.hidden = !otherSelected;
      if (!otherSelected) focusOtherInput.value = '';
    }

    function renderFocusGrid(config) {
      focusGrid.replaceChildren();
      focusGrid.style.setProperty('--focus-accent', config.accent);
      config.focusOptions.forEach((label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'amass-focus-option';
        button.dataset.value = label;
        button.setAttribute('aria-pressed', 'false');
        button.textContent = label;
        focusGrid.appendChild(button);
      });
      focusOtherInput.hidden = true;
      focusOtherInput.value = '';
      updateFocusCounter();
    }

    // Only rebuilds (and so only clears prior selections) when the role
    // actually changed since the grid was last built -- going back to
    // step 3 and forward again without switching roles keeps whatever
    // the user already picked.
    function ensureFocusGrid() {
      const role = selectedRole();
      const config = roleConfig[role];
      if (!config) return;
      focusHelper.textContent = 'Select up to 3.';
      focusGrid.setAttribute('aria-label', config.whatTitle);
      if (role === lastFocusRole) return;
      lastFocusRole = role;
      renderFocusGrid(config);
    }

    focusGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.amass-focus-option');
      if (!button) return;
      const isSelected = button.classList.contains('is-selected');
      if (!isSelected && selectedFocusButtons().length >= 3) return;
      button.classList.toggle('is-selected');
      button.setAttribute('aria-pressed', String(button.classList.contains('is-selected')));
      updateFocusCounter();
      updateFocusOtherVisibility();
    });

    function addReviewItem(label, value) {
      if (!value) return;
      const item = document.createElement('div');
      item.className = 'amass-flow__review-item';
      const term = document.createElement('strong');
      term.textContent = label;
      const detail = document.createElement('p');
      detail.textContent = value;
      item.append(term, detail);
      reviewEl.appendChild(item);
    }

    function buildReview() {
      const config = roleConfig[selectedRole()];
      reviewEl.replaceChildren();
      addReviewItem('Name', nameInput.value.trim());
      addReviewItem('Role', config.label);
      const otherValue = focusOtherInput.hidden ? '' : focusOtherInput.value.trim();
      const focusDisplay = selectedFocusButtons()
        .map((button) => button.dataset.value)
        .map((value) => (value === 'Other' && otherValue ? `Other (${otherValue})` : value))
        .join(', ');
      addReviewItem(`What you ${config.verb}`, focusDisplay);
      addReviewItem('Title', responseTitleInput.value.trim());
      addReviewItem(`Why you ${config.verb}`, audioBlob ? `🎤 Recorded (${formatClock(recordedSeconds)})` : whyInput.value.trim());
      if (websiteInput.value.trim()) {
        const titleValue = websiteTitleInput.value.trim();
        addReviewItem('Website', titleValue ? `${titleValue} · ${websiteInput.value.trim()}` : websiteInput.value.trim());
      }
      if (platformInput.value && handleInput.value.trim()) {
        const label = platformInput.options[platformInput.selectedIndex].textContent;
        addReviewItem('Find me', `${label} · ${handleInput.value.trim()}`);
      }
    }

    function titleForStep(step) {
      const config = roleConfig[selectedRole()];
      if (step === 4 && config) return config.whatTitle;
      if (step === 5 && config) return config.whyTitle;
      return titles[step] || '';
    }

    function showStep(step) {
      currentStep = step;
      steps.forEach((panel) => {
        const isCurrent = Number(panel.dataset.amassStep) === step;
        panel.hidden = !isCurrent;
        panel.classList.toggle('is-active', isCurrent);
      });
      form.hidden = step === 8;
      titleEl.textContent = titleForStep(step);
      errorEl.hidden = true;
      socialError.hidden = true;
      websiteError.hidden = true;
      if (step !== 5) {
        recordAudio.pause();
        setPlayIcon(false);
      }
      if (step === 4) ensureFocusGrid();
      if (step === 5) {
        updateWhyPlaceholder();
        setOrbColor(recordButton);
      }
      if (step === 7) buildReview();
      setNextState();
    }

    function resetFlow() {
      form.reset();
      lastFocusRole = null;
      flowVersion += 1;
      submitButton.disabled = isSubmitting;
      errorEl.hidden = true;
      socialError.hidden = true;
      websiteError.hidden = true;
      countEl.hidden = true;
      countEl.textContent = '';
      modal.querySelectorAll('[data-counter-for]').forEach((counter) => {
        counter.textContent = '0';
      });
      clearPhoto();
      resetRecording();
      removalPanel.hidden = true;
      removalToggle.setAttribute('aria-expanded', 'false');
      showStep(1);
    }

    async function loadApprovedCount() {
      try {
        const { count, error } = await window.tenGrandSupabase
          .from('voices_heard')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'approved');
        if (error || typeof count !== 'number') return;
        countEl.textContent = `${count.toLocaleString('en-US')} voices heard`;
        countEl.hidden = false;
      } catch (error) {
        console.error('Ten Grand voice count failed', error);
      }
    }

    modal.querySelectorAll('[data-amass-next]').forEach((button) => {
      button.addEventListener('click', () => {
        if (currentStep === 2 && !nameInput.value.trim()) return;
        if (currentStep === 3 && !selectedRole()) return;
        if (currentStep === 6 && !websiteIsValid()) {
          websiteError.hidden = false;
          return;
        }
        if (currentStep === 6 && !socialIsValid()) {
          socialError.hidden = false;
          return;
        }
        showStep(currentStep + 1);
      });
    });

    modal.querySelectorAll('[data-amass-back]').forEach((button) => {
      button.addEventListener('click', () => {
        if (currentStep > 1 && currentStep < 8) showStep(currentStep - 1);
      });
    });

    nameInput.addEventListener('input', setNextState);
    roleInputs.forEach((input) => input.addEventListener('change', setNextState));
    [platformInput, handleInput].forEach((input) => {
      input.addEventListener('input', () => {
        socialError.hidden = true;
        setNextState();
      });
      input.addEventListener('change', () => {
        socialError.hidden = true;
        setNextState();
      });
    });

    [websiteTitleInput, websiteInput].forEach((input) => {
      input.addEventListener('input', () => {
        websiteError.hidden = true;
        setNextState();
      });
    });

    [whyInput].forEach((input) => {
      const counter = modal.querySelector(`[data-counter-for="${input.id}"]`);
      input.addEventListener('input', () => {
        counter.textContent = String(input.value.length);
      });
    });

    photoRemoveBtn.addEventListener('click', clearPhoto);
    photoInput.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      if (file) setPhoto(file);
    });

    removalToggle.addEventListener('click', () => {
      const isExpanded = removalToggle.getAttribute('aria-expanded') === 'true';
      removalToggle.setAttribute('aria-expanded', String(!isExpanded));
      removalPanel.hidden = isExpanded;
    });

    writeToggle.addEventListener('click', () => {
      const isExpanded = writeToggle.getAttribute('aria-expanded') === 'true';
      writeToggle.setAttribute('aria-expanded', String(!isExpanded));
      writePanel.hidden = isExpanded;
    });

    recordButton.addEventListener('click', () => {
      if (recordButton.classList.contains('is-recording')) stopRecording();
      else startRecording();
    });

    recordPlayBtn.addEventListener('click', () => {
      if (recordAudio.paused) recordAudio.play();
      else recordAudio.pause();
    });
    recordAudio.addEventListener('play', () => setPlayIcon(true));
    recordAudio.addEventListener('pause', () => setPlayIcon(false));
    recordAudio.addEventListener('ended', () => setPlayIcon(false));

    recordDeleteBtn.addEventListener('click', resetRecording);
    recordRerecordBtn.addEventListener('click', () => {
      resetRecording();
      startRecording();
    });

    // Enforces "audio or written, not both" the other direction --
    // typing a written response discards any already-recorded audio.
    whyInput.addEventListener('input', () => {
      if (audioBlob) resetRecording();
    });

    modal.addEventListener('modal:close', resetFlow);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (currentStep !== 7 || isSubmitting) return;

      const hasAudio = Boolean(audioBlob);
      const hasWritten = Boolean(whyInput.value.trim());

      const payload = {
        name: nameInput.value.trim(),
        role: selectedRole(),
        focus_areas: selectedFocusButtons().map((button) => button.dataset.value),
        focus_other: focusOtherInput.hidden ? null : focusOtherInput.value.trim() || null,
        response_type: hasAudio ? 'audio' : hasWritten ? 'written' : null,
        response_title: responseTitleInput.value.trim() || null,
        why_detail: hasAudio ? null : whyInput.value.trim() || null,
        audio_path: null,
        audio_duration: hasAudio ? recordedSeconds : null,
        photo_path: null,
        website_title: websiteTitleInput.value.trim() || null,
        website: websiteInput.value.trim() || null,
        social_platform: platformInput.value || null,
        social_handle: handleInput.value.trim() || null,
      };

      if (!payload.name || !roleConfig[payload.role] || !socialIsValid() || !websiteIsValid()) return;

      errorEl.hidden = true;
      isSubmitting = true;
      submitButton.disabled = true;
      const submittedVersion = flowVersion;

      try {
        if (!window.tenGrandSupabase) throw new Error('Supabase client unavailable');

        if (hasAudio) {
          const extension = audioFileExtension(audioBlob.type);
          const fileName = `${crypto.randomUUID()}.${extension}`;
          const { data: uploadData, error: uploadError } = await window.tenGrandSupabase.storage
            .from('voices-heard-audio')
            .upload(fileName, audioBlob, { contentType: audioBlob.type || 'application/octet-stream' });
          if (uploadError) {
            console.error('Ten Grand voice audio upload failed', uploadError);
            throw uploadError;
          }
          payload.audio_path = uploadData.path;
        }

        const photoFile = photoInput.files && photoInput.files[0];
        if (photoFile) {
          const extension = (photoFile.name.split('.').pop() || 'jpg').toLowerCase();
          const fileName = `${crypto.randomUUID()}.${extension}`;
          const { data: photoUploadData, error: photoUploadError } = await window.tenGrandSupabase.storage
            .from('voices-heard-photos')
            .upload(fileName, photoFile, { contentType: photoFile.type || 'application/octet-stream' });
          if (photoUploadError) {
            console.error('Ten Grand voice photo upload failed', photoUploadError);
            throw photoUploadError;
          }
          payload.photo_path = photoUploadData.path;
        }

        const { data, error, status, statusText } = await window.tenGrandSupabase
          .from('voices_heard')
          .insert(payload);
        if (error) console.error('Ten Grand Supabase insert response', { data, error, status, statusText });

        if (error) throw error;

        if (submittedVersion !== flowVersion) return;
        showStep(8);
        loadApprovedCount();
      } catch (error) {
        console.error('Ten Grand voice submission failed', error);
        if (submittedVersion === flowVersion) {
          errorEl.textContent = 'Your voice could not be added. Please try again.';
          errorEl.hidden = false;
        }
      } finally {
        isSubmitting = false;
        submitButton.disabled = false;
      }
    });

    resetFlow();
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
    const crop = stage.closest('.distance__crop') || stage;
    const elements = Array.from(stage.querySelectorAll('.highway__car'));
    if (!elements.length) return;

    // Durations are 1.5x the original 17999/22498/14399ms -- slowed down so
    // each car's crossing reads less like a jump cut, more like a car
    // actually receding into the distance.
    const lanes = {
      centre: { duration: 26999, from: 1.65300, to: 0.01680 },
      left:   { duration: 33747, from: 4.09987, to: 0.04167 },
      right:  { duration: 21599, from: 4.12350, to: 0.04191 },
    };
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
        modelScale: parseFloat(getComputedStyle(el.querySelector('.highway__bob')).getPropertyValue('--car-scale')) || 1,
        culled: false,
        delay: Math.abs(parseFloat(style.getPropertyValue('--drive-delay'))) * 1000,
        leftRatio: el.offsetLeft / stage.clientWidth,
        topRatio: el.offsetTop / stage.clientHeight,
        widthRatio: el.offsetWidth / stage.clientWidth,
        heightRatio: el.offsetHeight / stage.clientHeight,
        originXRatio: origin[0] / el.offsetWidth,
        originYRatio: origin[1] / el.offsetHeight,
        plateFontRatio: parseFloat(getComputedStyle(plate).fontSize) / stage.clientWidth,
      };
    });

    let stageWidth = stage.clientWidth;
    let stageHeight = stage.clientHeight;

    let clip;
    function measureCrop() {
      stageWidth = stage.clientWidth;
      stageHeight = stage.clientHeight;
      const stageRect = stage.getBoundingClientRect();
      const cropRect = crop.getBoundingClientRect();
      clip = {
        left: cropRect.left - stageRect.left,
        top: cropRect.top - stageRect.top,
        right: cropRect.right - stageRect.left,
        bottom: cropRect.bottom - stageRect.top,
      };
    }
    measureCrop();
    const resizeObserver = new ResizeObserver(measureCrop);
    resizeObserver.observe(stage);
    if (crop !== stage) resizeObserver.observe(crop);

    let running = false;
    let frame = 0;
    let startedAt = 0;
    let elapsedBeforePause = 0;

    function draw(now) {
      if (!running) return;
      const elapsed = elapsedBeforePause + now - startedAt;
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
        const width = baseWidth * scale;
        // Conservative bounds include the model scale and overflowing glow.
        // Keep partially visible cars alive; no layout reads in this loop.
        const halfWidth = width * car.modelScale * 0.6;
        const halfHeight = height * car.modelScale * 0.6;
        const cx = left + width / 2;
        const cy = top + height / 2;
        const culled = cx + halfWidth < clip.left || cx - halfWidth > clip.right ||
          cy + halfHeight < clip.top || cy - halfHeight > clip.bottom;
        if (culled !== car.culled) {
          car.el.style.visibility = culled ? 'hidden' : '';
          car.culled = culled;
        }
        // Progress still follows the shared clock, so reentry stays in sync.
        if (culled) return;
        // Full opacity always -- .distance__crop's overflow:hidden already
        // clips a car that's grown past the visible window, so there's
        // nothing for opacity to do here.
        car.el.style.left = `${left}px`;
        car.el.style.top = `${top}px`;
        car.el.style.width = `${width}px`;
        car.el.style.height = `${height}px`;
        car.el.style.zIndex = String(Math.max(1, 48 - Math.floor(progress * 48)));
        car.plate.style.fontSize = `${car.plateFontRatio * stageWidth * scale}px`;
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
        elapsedBeforePause += performance.now() - startedAt;
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
    // The stage to auto-open once its marker lights up, armed only by the
    // desktop callout's CTA -- closing via the X, backdrop-equivalent
    // click-outside, or Escape just advances the road, same as always,
    // leaving the reader to click the next sign themselves.
    let pendingAutoOpenStage = 0;

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
        if (pin && n === pendingAutoOpenStage && desktopQuery.matches) {
          pendingAutoOpenStage = 0;
          openCallout(pin);
        }
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
    const calloutPrev = callout && callout.querySelector('.route__callout-cta-prev');
    const calloutTag = callout && callout.querySelector('.route__callout-tag');
    const calloutTagText = callout && callout.querySelector('.route__callout-tag-text');
    // Same split as the mobile modal's openedBy/currentTrigger (see
    // initModal): calloutOpenedBy stays on the frontier stage while the
    // reader browses backward via calloutPrev, so closing the callout
    // still judges "is this the frontier" correctly and advances the
    // road only then; calloutTrigger tracks whatever's on screen right
    // now, which is what calloutPrev itself steps back from each click.
    let calloutOpenedBy = null;
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
    // Breathing room between the title's own edge and where the
    // connector actually starts -- same for every sign, so it neither
    // touches the word nor drifts far from it.
    const CONNECTOR_TITLE_GAP = 8;
    // Root cause, found after the fact: this sandbox's headless browser
    // can't reach Google Fonts (a proxy cert issue, unrelated to the
    // site), so every measurement taken here was against the fallback
    // font, not Inter -- and "PACKAGING"/"DISTRIBUTION" happen to render
    // meaningfully wider in real Inter Bold than in that fallback, while
    // "DEVELOPMENT"/"PRODUCTION" render at nearly the same width in both.
    // That's exactly the "only two of four" split that was reported.
    // Confirmed by loading the real woff2 locally and re-measuring: with
    // Inter actually applied, these two values read clean against real
    // title widths, matching how development's and production's already
    // did with the plain CONNECTOR_TITLE_GAP.
    const CONNECTOR_TITLE_GAP_OVERRIDE = { 3: -46, 4: -28 };

    function openCallout(pin) {
      if (!callout) return;
      calloutTrigger = pin;
      if (!callout.classList.contains('is-open')) calloutOpenedBy = pin;
      calloutHeadline.textContent = pin.dataset.calloutHeadline || '';
      setCalloutBody(pin.dataset.modalBody || '');
      if (calloutTagText) calloutTagText.textContent = pin.dataset.calloutTag || '';
      if (calloutTag) {
        const accent = pin.dataset.calloutTagColor || '';
        if (accent) calloutTag.style.setProperty('--tag-accent', accent);
        else calloutTag.style.removeProperty('--tag-accent');
      }
      // Names the sign this CTA actually leads to (clicking it opens that
      // one next -- see the CTA click handler below), rather than the
      // themed phrase the mobile modal's own CTA still shows, since
      // mobile's version doesn't chain anywhere and shouldn't promise to.
      const nextPin = pinForStage(Number(pin.dataset.stage) + 1);
      const nextLabelEl = nextPin && nextPin.querySelector('.route__pin-label');
      calloutCta.textContent = nextLabelEl ? nextLabelEl.textContent : 'IMPACT';
      // Same idea in reverse -- stage 1 has no sign behind it, so it keeps
      // showing only the single next button, exactly as before this link
      // existed.
      if (calloutPrev) {
        const prevPin = pinForStage(Number(pin.dataset.stage) - 1);
        const prevLabelEl = prevPin && prevPin.querySelector('.route__pin-label');
        calloutPrev.textContent = prevLabelEl ? prevLabelEl.textContent : '';
        calloutPrev.hidden = !prevPin;
      }
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
      // Distribution (stage 4) sits near the very bottom of .route's own
      // box -- the tall scrollytelling container this callout is
      // positioned relative to, not the viewport -- so opening downward
      // the usual way runs the card past the end of that box and into
      // whatever section follows. Opening it upward instead, card above
      // the label, is the only one of the four stages that needs this:
      // the others all have room below them. .route__callout--up flips
      // the connector's own CSS (see .route__callout-connector and
      // siblings) to match -- trunk and dot below the card, running down
      // into the label, instead of above it running down into the card.
      const opensUpward = pin.dataset.stage === '4';
      callout.classList.toggle('route__callout--up', opensUpward);
      let top;
      let cardBottom;
      if (opensUpward) {
        cardBottom = labelRect.top - stageRect.top - 22;
        top = cardBottom - callout.offsetHeight;
      } else {
        top = labelRect.bottom - stageRect.top + 22;
      }
      const cardAttachX = align === 'left' ? labelRect.left : labelRect.right;
      const left = align === 'left'
        ? cardAttachX - stageRect.left
        : cardAttachX - stageRect.left - callout.offsetWidth;
      callout.style.setProperty('--top', `${top}px`);
      callout.style.setProperty('--left', `${left}px`);
      // The connector runs from the title's own trailing edge -- whichever
      // side already faces the dot, so the line only ever travels away
      // from the sign, never doubles back over the word first -- at the
      // title's own vertical middle, across to the dot, then down into
      // the card. The dot sits toward whichever card edge is FARTHEST
      // from that point, so the far corner is the card's right edge for a
      // left-aligned card (whose left edge already sits at the label),
      // and its left edge for a right-aligned one -- the two sides mirror
      // each other by construction.
      const titleEl = label.querySelector('.route__pin-label') || label;
      const titleRect = titleEl.getBoundingClientRect();
      const titleGap = CONNECTOR_TITLE_GAP_OVERRIDE[pin.dataset.stage] ?? CONNECTOR_TITLE_GAP;
      const attachX = align === 'left'
        ? titleRect.right + titleGap
        : titleRect.left - titleGap;
      const titleMidY = (titleRect.top + titleRect.bottom) / 2;
      const dotX = align === 'left'
        ? callout.offsetWidth - CONNECTOR_DOT_INSET
        : CONNECTOR_DOT_INSET;
      const attachXRelToCard = attachX - stageRect.left - left;
      const bendLeft = Math.min(attachXRelToCard, dotX);
      const bendWidth = Math.abs(attachXRelToCard - dotX);
      // .route__callout-connector-bend's own positioning parent is
      // .route__callout-connector, which is already offset by dotX from
      // the card -- bendLeft above is in the CARD's coordinate space, so
      // it has to be re-based into the bend's local space by subtracting
      // that same offset back out. Done here in JS, as a single already-
      // resolved value, rather than as a calc() of two custom properties
      // in CSS.
      const bendLeftLocal = bendLeft - dotX;
      // Runs from the title's own vertical middle, not its bottom edge --
      // so the connector's total height has to stretch past the rest of
      // the title and the note line beneath it ("Map out the idea.") to
      // still reach the card's own top (or, opening upward, its bottom)
      // unchanged.
      const connectorHeight = opensUpward
        ? (titleMidY - stageRect.top) - cardBottom
        : top - (titleMidY - stageRect.top);
      callout.style.setProperty('--connector-height', `${connectorHeight}px`);
      callout.style.setProperty('--connector-dot-x', `${dotX}px`);
      callout.style.setProperty('--connector-bend-left', `${bendLeftLocal}px`);
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
      const wasCurrent = advanceIfCurrent && calloutOpenedBy && Number(calloutOpenedBy.dataset.stage) === currentStage;
      callout.classList.remove('is-open');
      callout.setAttribute('aria-hidden', 'true');
      route.classList.remove('route--callout-open');
      route.querySelectorAll('.route__pin').forEach((el) => {
        el.classList.remove('is-callout-active');
      });
      if (calloutOpenedBy) calloutOpenedBy.focus();
      calloutTrigger = null;
      calloutOpenedBy = null;
      if (wasCurrent) advance();
    }

    if (callout) {
      callout.querySelectorAll('[data-callout-close]').forEach((el) => {
        el.addEventListener('click', () => closeCallout(true));
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCallout(true);
      });
      // Clicking anywhere outside the card closes it -- the desktop
      // equivalent of the mobile modal's backdrop tap. Signs are excluded
      // since they already open/close callouts through their own handler
      // below; without this guard, opening one from outside the current
      // callout would close it again the instant the click bubbles here.
      document.addEventListener('click', (event) => {
        if (!callout.classList.contains('is-open')) return;
        if (callout.contains(event.target)) return;
        if (event.target.closest('.route__pin')) return;
        closeCallout(true);
      });
      const calloutNext = callout.querySelector('[data-callout-next]');
      if (calloutNext) {
        calloutNext.addEventListener('click', () => {
          // Only chains into the next callout when this sign is the actual
          // frontier -- reopening a past sign's callout and hitting this
          // just closes it, same as the X, since there's nothing to advance.
          if (calloutOpenedBy && Number(calloutOpenedBy.dataset.stage) === currentStage) {
            pendingAutoOpenStage = currentStage + 1;
          }
          closeCallout(true);
        });
      }
      // The previous sign is always already reached by the time this one's
      // callout is open, so this just reopens it directly -- no advance,
      // no closing first, same as clicking any other reached pin.
      if (calloutPrev) {
        calloutPrev.addEventListener('click', () => {
          const prevPin = calloutTrigger && pinForStage(Number(calloutTrigger.dataset.stage) - 1);
          if (prevPin) openCallout(prevPin);
        });
      }
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
        pendingAutoOpenStage = 0;
        closeCallout(false);
      }
    }

    function schedule() {
      // A modal's scroll lock (see createScrollLock above) can itself
      // generate scroll/resize noise while it's engaged -- none of that
      // reflects the reader actually moving, so it shouldn't be allowed
      // to reset or replay this section's progress while it's hidden
      // behind the modal.
      if (ticking || activeScrollLocks > 0) return;
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
    initSimpleModals();
    initAmassSubmission();
    initTimelineBubbles();
    initBillboards();
    initHighwayCars();
  });
})();
