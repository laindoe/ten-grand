// ============================================================
// AMASS "Voices Heard" submission modal — shared by index.html
// (AMASS Comm(unity) section) and community-wall.html (ADD YOUR
// VOICE button). Self-contained: owns its own open/close + scroll
// lock instead of depending on js/main.js, so it works unmodified
// on either page. On the homepage, js/main.js listens for the
// amass-modal:lock / amass-modal:unlock events dispatched below to
// keep pausing the billboard scroll sequence while this modal is open.
// ============================================================

(() => {
  function initAmassModalOpenClose() {
    const modal = document.getElementById('amass-modal');
    const triggers = document.querySelectorAll('[data-modal-open="amass-modal"]');
    if (!modal || !triggers.length) return;

    let lastFocused = null;
    let scrollLock = null;
    const viewport = window.visualViewport;
    let viewportFrame = null;

    // iOS keyboards shrink/pan the visual viewport without necessarily
    // changing dvh. Keep the overlay inside the area the user can see.
    function syncViewport() {
      viewportFrame = null;
      if (!viewport || !modal.classList.contains('is-open')) return;
      // Leave intentional pinch zoom under the browser's control.
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      modal.style.setProperty('--amass-viewport-height', `${viewport.height}px`);
      modal.style.setProperty('--amass-viewport-top', `${viewport.offsetTop}px`);

      // Safari already scrolls the focused field into view. Adjusting
      // panel.scrollTop here races its keyboard animation and can jump.
    }

    function queueViewportSync() {
      if (viewportFrame === null) viewportFrame = requestAnimationFrame(syncViewport);
    }

    function trackViewport() {
      if (!viewport) return;
      syncViewport();
      viewport.addEventListener('resize', queueViewportSync);
      viewport.addEventListener('scroll', queueViewportSync);
    }

    function stopTrackingViewport() {
      if (!viewport) return;
      viewport.removeEventListener('resize', queueViewportSync);
      viewport.removeEventListener('scroll', queueViewportSync);
      if (viewportFrame !== null) cancelAnimationFrame(viewportFrame);
      viewportFrame = null;
      modal.style.removeProperty('--amass-viewport-height');
      modal.style.removeProperty('--amass-viewport-top');
    }

    // Same body-lock technique used elsewhere on the site: position:fixed
    // + scroll offset compensation + scrollbar-width padding compensation,
    // so the page behind the modal can't scroll (including on iOS, where
    // plain overflow:hidden on body doesn't stop background scroll).
    function lockScroll() {
      if (scrollLock) return;
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
      document.dispatchEvent(new CustomEvent('amass-modal:lock'));
    }

    function unlockScroll() {
      if (!scrollLock) return;
      const saved = scrollLock;
      scrollLock = null;
      saved.styles.forEach(([property, value, priority]) => {
        if (value) document.body.style.setProperty(property, value, priority);
        else document.body.style.removeProperty(property);
      });
      document.dispatchEvent(new CustomEvent('amass-modal:unlock'));
      const root = document.documentElement;
      const behavior = root.style.getPropertyValue('scroll-behavior');
      const priority = root.style.getPropertyPriority('scroll-behavior');
      root.style.setProperty('scroll-behavior', 'auto', 'important');
      window.scrollTo(saved.x, saved.y);
      if (behavior) root.style.setProperty('scroll-behavior', behavior, priority);
      else root.style.removeProperty('scroll-behavior');
    }

    function openModal(event) {
      if (modal.classList.contains('is-open')) return;
      lastFocused = event.currentTarget;
      lockScroll();
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      trackViewport();
      modal.querySelector('.modal__close').focus({ preventScroll: true });
    }

    function closeModal() {
      stopTrackingViewport();
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      unlockScroll();
      if (lastFocused) lastFocused.focus({ preventScroll: true });
      modal.dispatchEvent(new CustomEvent('modal:close'));
    }

    triggers.forEach((trigger) => trigger.addEventListener('click', openModal));
    modal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
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
    const cropOverlay = document.getElementById('amass-crop-overlay');
    const cropImage = document.getElementById('amass-crop-image');
    const cropCancelBtn = document.getElementById('amass-crop-cancel');
    const cropConfirmBtn = document.getElementById('amass-crop-confirm');
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
        accent: '#dbe916',
        accentBlend: '#e5dc16',
        focusOptions: ['Music', 'Film', 'Animation', 'Design', 'Writing', 'Photography', 'Fashion', 'Visual Art', 'Games', 'Live Experiences', 'Other'],
      },
      build: {
        label: 'I BUILD',
        verb: 'build',
        whatTitle: 'WHAT DO YOU BUILD?',
        whyTitle: 'WHY DO YOU BUILD?',
        whyPlaceholder: 'Tell us why you build...',
        accent: '#be2026',
        accentBlend: '#e42320',
        focusOptions: ['Studios', 'Venues', 'Platforms', 'Technology', 'Agencies', 'Distribution', 'Manufacturing', 'Education', 'Communities', 'Creative Services', 'Other'],
      },
      fund: {
        label: 'I FUND',
        verb: 'fund',
        whatTitle: 'WHAT DO YOU FUND?',
        whyTitle: 'WHY DO YOU FUND?',
        whyPlaceholder: 'Tell us why you fund...',
        accent: '#4fb620',
        accentBlend: '#77d34e',
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
      8: 'WE HEAR YOU',
    };
    let currentStep = 1;
    let isSubmitting = false;
    let flowVersion = 0;
    let lastFocusRole = null;
    let photoObjectUrl = null;
    let photoBlob = null;
    let reviewAudioEl = null;
    let cropper = null;

    function clearPhoto() {
      photoInput.value = '';
      photoBlob = null;
      if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
        photoObjectUrl = null;
      }
      photoPreviewImg.src = '';
      photoPreviewImg.hidden = true;
      photoPreviewEmpty.hidden = false;
      photoRemoveBtn.hidden = true;
    }

    // blob is the already-square-cropped image coming out of the crop
    // overlay -- this is the single source of truth for both the
    // preview and the eventual upload, so nothing re-reads photoInput's
    // raw (uncropped) file after this point.
    function setPhoto(blob) {
      if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
      photoBlob = blob;
      photoObjectUrl = URL.createObjectURL(blob);
      photoPreviewImg.src = photoObjectUrl;
      photoPreviewImg.hidden = false;
      photoPreviewEmpty.hidden = true;
      photoRemoveBtn.hidden = false;
    }

    function closeCropOverlay() {
      cropOverlay.hidden = true;
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      if (cropImage.src) {
        URL.revokeObjectURL(cropImage.src);
        cropImage.src = '';
      }
    }

    function openCropOverlay(file) {
      cropImage.src = URL.createObjectURL(file);
      cropOverlay.hidden = false;
      // .modal__panel scrolls internally (overflow-y:auto) and is this
      // overlay's positioned ancestor, so inset:0 places the overlay at
      // the panel's scrolled-to-top content position, not the current
      // viewport -- without resetting scroll first, the overlay can
      // render above the visible area if the user had scrolled down
      // through an earlier step.
      modal.querySelector('.modal__panel').scrollTop = 0;
      cropper = new Cropper(cropImage, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        background: false,
        guides: false,
        center: false,
        highlight: false,
      });
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
      recordPlayBtn.classList.toggle('is-playing', isPlaying);
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
      // recordButton.disabled below closes the gap while the mic
      // permission prompt is pending -- without it, a second tap during
      // that wait (no visual feedback yet, since is-recording isn't
      // set until the promise resolves) re-enters this function and
      // starts a second concurrent MediaRecorder/stream that races the
      // first one over the shared mediaRecorder/recordingTimer
      // variables, leaving the record button unable to cleanly stop
      // either one.
      if (!micSupported || audioBlob || recordButton.disabled || recordButton.classList.contains('is-recording')) return;
      recordButton.disabled = true;
      recordLabel.textContent = 'Starting…';
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
        recordButton.disabled = false;
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
        recordButton.disabled = false;
        recordLabel.textContent = 'Record Your Voice';
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

    function addReviewPhoto() {
      const item = document.createElement('div');
      item.className = 'amass-flow__review-item amass-flow__review-item--photo';
      const term = document.createElement('strong');
      term.textContent = 'Photo';
      const img = document.createElement('img');
      img.className = 'amass-flow__review-photo';
      img.src = photoObjectUrl;
      img.alt = '';
      item.append(term, img);
      reviewEl.appendChild(item);
    }

    // Own play/pause button + <audio>, independent from step 5's
    // recording preview so each can be played without disturbing the
    // other. reviewAudioEl is tracked so showStep can pause it when the
    // user navigates away from this step.
    function addReviewAudio(label) {
      const item = document.createElement('div');
      item.className = 'amass-flow__review-item';
      const term = document.createElement('strong');
      term.textContent = label;

      const wrap = document.createElement('div');
      wrap.className = 'amass-flow__review-audio';

      const audio = document.createElement('audio');
      audio.className = 'amass-flow__review-audio-el';
      audio.src = audioObjectUrl;

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'amass-flow__review-play';
      playBtn.setAttribute('aria-label', 'Play recording');
      playBtn.innerHTML =
        '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5 L19 12 L7 19 Z"/></svg>' +
        '<svg class="amass-flow__review-play-icon amass-flow__review-play-icon--pause" viewBox="0 0 24 24" aria-hidden="true" hidden><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' +
        '<span>Play</span>';

      const playIcon = playBtn.querySelector('.amass-flow__review-play-icon--play');
      const pauseIcon = playBtn.querySelector('.amass-flow__review-play-icon--pause');
      const playLabel = playBtn.querySelector('span');

      function setIcon(isPlaying) {
        setSvgHidden(playIcon, isPlaying);
        setSvgHidden(pauseIcon, !isPlaying);
        playLabel.textContent = isPlaying ? 'Pause' : 'Play';
        playBtn.classList.toggle('is-playing', isPlaying);
      }

      const duration = document.createElement('span');
      duration.className = 'amass-flow__review-audio-duration';
      duration.textContent = formatClock(recordedSeconds);

      playBtn.addEventListener('click', () => {
        if (audio.paused) audio.play();
        else audio.pause();
      });
      audio.addEventListener('play', () => setIcon(true));
      audio.addEventListener('pause', () => setIcon(false));
      audio.addEventListener('ended', () => {
        setIcon(false);
        duration.textContent = formatClock(recordedSeconds);
      });
      // Same live counting treatment as the step 5 recording preview.
      audio.addEventListener('timeupdate', () => {
        if (audio.paused) return;
        duration.textContent = `${formatClock(audio.currentTime)} / ${formatClock(recordedSeconds)}`;
      });

      wrap.append(audio, playBtn, duration);
      item.append(term, wrap);
      reviewEl.appendChild(item);
      reviewAudioEl = audio;
    }

    function buildReview() {
      const config = roleConfig[selectedRole()];
      reviewEl.replaceChildren();
      reviewAudioEl = null;
      if (photoObjectUrl) addReviewPhoto();
      addReviewItem('Name', nameInput.value.trim());
      addReviewItem('Role', config.label);
      const otherValue = focusOtherInput.hidden ? '' : focusOtherInput.value.trim();
      const focusDisplay = selectedFocusButtons()
        .map((button) => button.dataset.value)
        .map((value) => (value === 'Other' && otherValue ? `Other (${otherValue})` : value))
        .join(', ');
      addReviewItem(`What you ${config.verb}`, focusDisplay);
      addReviewItem('Title', responseTitleInput.value.trim());
      if (audioBlob) {
        addReviewAudio(`Why you ${config.verb}`);
      } else {
        addReviewItem(`Why you ${config.verb}`, whyInput.value.trim());
      }
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
      if (step !== 7 && reviewAudioEl) reviewAudioEl.pause();
      if (step === 4) ensureFocusGrid();
      if (step === 5) {
        updateWhyPlaceholder();
        setOrbColor(recordButton);
      }
      if (step === 7) buildReview();
      setNextState();
      // Each step is a new page of the form. Move focus off the previous
      // field (and dismiss its keyboard) before resetting dialog scroll.
      if (modal.classList.contains('is-open')) {
        titleEl.setAttribute('tabindex', '-1');
        titleEl.focus({ preventScroll: true });
      }
      const dialogPanel = modal.querySelector('.amass-flow__panel');
      dialogPanel.scrollTop = 0;
      requestAnimationFrame(() => {
        if (currentStep === step) dialogPanel.scrollTop = 0;
      });
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
      closeCropOverlay();
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
      if (file) openCropOverlay(file);
    });

    cropCancelBtn.addEventListener('click', () => {
      photoInput.value = '';
      closeCropOverlay();
    });

    cropConfirmBtn.addEventListener('click', () => {
      if (!cropper) return;
      cropper.getCroppedCanvas({ width: 600, height: 600 }).toBlob((blob) => {
        if (blob) setPhoto(blob);
        closeCropOverlay();
      }, 'image/jpeg', 0.9);
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
    recordAudio.addEventListener('ended', () => {
      setPlayIcon(false);
      recordHint.textContent = formatClock(recordedSeconds);
    });
    // Counts up while playing (0:00 / 0:30, 0:01 / 0:30, ...) so it's
    // obvious something is actually playing -- freezes wherever it was
    // on pause (timeupdate just stops firing) and resets to the plain
    // total above on ended.
    recordAudio.addEventListener('timeupdate', () => {
      if (recordAudio.paused) return;
      recordHint.textContent = `${formatClock(recordAudio.currentTime)} / ${formatClock(recordedSeconds)}`;
    });

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

        if (photoBlob) {
          const fileName = `${crypto.randomUUID()}.jpg`;
          const { data: photoUploadData, error: photoUploadError } = await window.tenGrandSupabase.storage
            .from('voices-heard-photos')
            .upload(fileName, photoBlob, { contentType: 'image/jpeg' });
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

  document.addEventListener('DOMContentLoaded', () => {
    initAmassModalOpenClose();
    initAmassSubmission();
  });
})();
