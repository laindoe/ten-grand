// One archive state shared by desktop controls and the mobile toolbar.
(() => {
  'use strict';
  const grid = document.getElementById('transmissions-grid');
  if (!grid) return;
  const category = document.getElementById('category-filter');
  const series = document.getElementById('series-filter');
  const search = document.getElementById('search-input');
  const toggle = document.getElementById('search-toggle');
  const stickyFilters = document.getElementById('archive-desktop-filters');
  const stickyCategory = category.cloneNode(true);
  const stickySeries = series.cloneNode(true);
  stickyCategory.id = 'archive-sticky-category';
  stickySeries.id = 'archive-sticky-series';
  stickyFilters.append(stickyCategory, stickySeries);
  const stickyInput = document.getElementById('archive-sticky-input');

  const buttons = [...document.querySelectorAll('[data-filter-pillar]')];
  const welcome = document.getElementById('archive-welcome');
  const intro = document.getElementById('archive-introduction');
  const empty = document.getElementById('archive-empty');
  const more = document.getElementById('archive-load-more');
  const status = document.getElementById('archive-feed-status');
  const retry = document.getElementById('archive-retry');
  const media = matchMedia('(max-width: 759px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { category: 'all', series: 'all', query: '', limit: 3, searchOpen: false };
  let posts = null, introductions = {}, pending = null;
  const returnParam = new URL(location.href).searchParams.get('return');
  let restore = history.state?.transmissionArchive || null;
  if (returnParam) {
    try { restore = JSON.parse(sessionStorage.getItem('tg-archive:' + returnParam)) || restore; } catch (_) {}
    const clean = new URL(location.href); clean.searchParams.delete('return');
    history.replaceState({ ...history.state, transmissionArchive: restore }, '', clean);
  }
  if (restore) {
    state.category = [...category.options].some(o => o.value === restore.category) ? restore.category : 'all';
    state.series = [...series.options].some(o => o.value === restore.series) ? restore.series : 'all';
    state.query = typeof restore.query === 'string' ? restore.query : '';
    state.limit = Math.max(3, Number(restore.limit) || 3);
    state.searchOpen = !!restore.searchOpen;
    search.value = state.query;
  }
  let restoreCancelled = false;
  ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, () => { restoreCancelled = true; }, { once: true, passive: true }));
  function rememberArchive(card) {
    const snapshot = { ...state, y: scrollY, card: card.href, offset: card.getBoundingClientRect().top };
    history.replaceState({ ...history.state, transmissionArchive: snapshot }, '');
    try {
      const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('tg-archive:' + token, JSON.stringify(snapshot));
      sessionStorage.setItem('tg-return:' + new URL(card.href).pathname, JSON.stringify({ token, archive: location.href }));
    } catch (_) {}
  }
  document.addEventListener('click', event => {
    const card = event.target.closest('a.transmission-card, a.featured-card');
    if (!card || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (new URL(card.href).origin === location.origin) rememberArchive(card);
  });
  function revealArchive(animate = true) {
    clearTimeout(window.archiveRestoreFallback);
    const root = document.documentElement;
    if (root.classList.contains('archive-restoring') && animate) {
      root.classList.add('archive-return-ready');
      setTimeout(() => root.classList.remove('archive-return-ready'), 200);
    }
    root.classList.remove('archive-restoring');
    history.scrollRestoration = 'auto';
  }
  window.addEventListener('pageshow', event => {
    if (event.persisted) revealArchive(false);
  });
  async function restorePosition() {
    if (!restore) return;
    if (document.fonts) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (restoreCancelled) { restore = null; return; }
    const card = [...document.querySelectorAll('a.transmission-card, a.featured-card')].find(el => el.href === restore.card);
    const top = card ? scrollY + card.getBoundingClientRect().top - restore.offset : restore.y;
    window.scrollTo({ top: Math.max(0, Number(top) || 0), behavior: 'instant' });
    restore = null;
    // Allow the sticky controls and bottom clearance to settle before revealing.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  // Collapsing breadcrumb and community dock on desktop and mobile. Appear once
  // the Community Wall banner scrolls fully out of view above the
  // viewport, and disappear again scrolling back up. The filter panel
  // they open shares `state` as its single source of truth: it stages
  // edits in `draft` until Apply, rather than keeping its own copy.
  const crumb = document.getElementById('archive-crumb');
  const crumbRoot = document.getElementById('archive-crumb-root');
  const crumbSep = document.getElementById('archive-crumb-sep');
  const crumbCurrent = document.getElementById('archive-crumb-current');
  const dock = document.getElementById('archive-dock');
  const dockFilters = document.getElementById('archive-sticky-filters');
  const dockSearch = document.getElementById('archive-sticky-search');
  const dockCount = document.getElementById('archive-sticky-count');
  const panel = document.getElementById('archive-filter-panel');
  const panelBackdrop = document.getElementById('archive-filter-panel-backdrop');
  const panelClose = document.getElementById('archive-filter-panel-close');
  const panelCategory = document.getElementById('panel-category-filter');
  const panelSeries = document.getElementById('panel-series-filter');
  const searchPanel = document.getElementById('archive-search-panel');
  const mobileSearch = document.getElementById('archive-mobile-search-input');
  const searchBackdrop = document.getElementById('archive-search-panel-backdrop');
  const searchClose = document.getElementById('archive-search-panel-close');
  const panelClear = document.getElementById('archive-filter-panel-clear');
  const panelApply = document.getElementById('archive-filter-panel-apply');
  const community = document.querySelector('.archive-community');
  const siteNav = document.querySelector('.site-frame > .nav');
  let collapsed = false, draft = null, panelOpener = null, observer = null;
  function updateNavHeight() {
    if (siteNav) document.documentElement.style.setProperty('--t-nav-height', siteNav.getBoundingClientRect().height + 'px');
  }
  updateNavHeight();
  if (siteNav && 'ResizeObserver' in window) new ResizeObserver(updateNavHeight).observe(siteNav);
  window.addEventListener('resize', updateNavHeight);
  function element(tag, className, text) {
    const el = document.createElement(tag); el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function safeUrl(value) {
    if (!value) return null;
    try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch (_) { return null; }
  }
  function renderCard(post) {
    const card = element('a', 'transmission-card');
    card.href = safeUrl(post.url) || '#';
    const image = element('div', 'transmission-card__image');
    const imageUrl = safeUrl(post.image);
    if (imageUrl) image.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
    const body = element('div', 'transmission-card__body');
    if (post.sample) body.append(element('span', 'sample-badge', 'SAMPLE'));
    body.append(element('p', 'transmission-card__date', post.displayDate));
    if (post.series) body.append(element('p', 'transmission-card__series', post.series.toUpperCase()));
    body.append(element('h3', 'transmission-card__title', post.title.toUpperCase()));
    if (post.format) body.append(element('p', 'transmission-card__format', post.format.toUpperCase()));
    const words = post.excerpt.trim().split(/\s+/);
    body.append(element('p', 'transmission-card__excerpt', words.slice(0, 20).join(' ') + (words.length > 20 ? '…' : '')));
    body.append(element('span', 'transmission-card__cta', '→ READ TRANSMISSION'));
    card.append(image, body); return card;
  }
  function syncControls() {
    category.value = state.category;
    stickyCategory.value = state.category;
    stickySeries.value = state.series;
    stickyInput.value = state.query;
    category.classList.toggle('is-active', state.category !== 'all');
    series.value = state.series;
    series.options[0].textContent = 'SERIES';
    buttons.forEach(b => { const active = b.dataset.filterPillar === state.category; b.classList.toggle('is-active', active); b.setAttribute('aria-pressed', String(active)); });
    search.hidden = media.matches && !state.searchOpen;
    toggle.setAttribute('aria-expanded', String(state.searchOpen));
    toggle.setAttribute('aria-label', state.searchOpen ? 'Hide search' : 'Show search');
    updateCrumb();
    updateDockCount();
  }
  function activeFilterLabel() {
    if (state.series !== 'all') return series.selectedOptions[0].textContent;
    if (state.category !== 'all') return category.selectedOptions[0].textContent;
    return null;
  }
  function updateCrumb() {
    const label = activeFilterLabel();
    crumbSep.hidden = !label;
    crumbCurrent.hidden = !label;
    if (label) {
      crumbCurrent.textContent = label;
      crumbRoot.removeAttribute('aria-current');
      crumbCurrent.setAttribute('aria-current', 'page');
    } else {
      crumbCurrent.removeAttribute('aria-current');
      crumbRoot.setAttribute('aria-current', 'page');
    }
  }
  function updateDockCount() {
    const count = (state.category !== 'all' ? 1 : 0) + (state.series !== 'all' ? 1 : 0) + (state.query ? 1 : 0);
    dockCount.hidden = count === 0;
    dockCount.textContent = String(count);
  }
  function syncBottomClearance() {
    const height = dock.hidden ? 0 : Math.ceil(dock.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--archive-bottom-clearance', height ? (height + 16) + 'px' : '0px');
  }
  if ('ResizeObserver' in window) new ResizeObserver(syncBottomClearance).observe(dock);
  window.addEventListener('resize', syncBottomClearance);
  function setCollapsed(value) {
    // Live search can shorten the page; keep its toolbar in place while typing.
    if (!value && (!panel.hidden || !searchPanel.hidden)) return;
    if (collapsed === value) return;
    collapsed = value;
    crumb.hidden = !value;
    dock.hidden = !value;
    syncBottomClearance();
    if (!value) { closePanel(); closeSearchPanel(); }
  }
  function setupObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    if (!community || !('IntersectionObserver' in window)) return;
    // Trigger right as the Featured Transmission header reaches the nav,
    // not when the community banner's own box crosses y=0 -- the sticky
    // nav covers the top of the viewport, and the featured header sits a
    // further fixed gap below the banner, so both have to be folded into
    // the margin or the collapse fires late (reads as "halfway into the
    // next section"). The banner itself stays the observed element
    // because it's always present and never hidden by filtering, unlike
    // the featured section.
    const navHeight = siteNav ? Math.round(siteNav.getBoundingClientRect().height) : 0;
    const featuredLabel = [...document.querySelectorAll('.archive-featured__label')]
      .find(label => label.getClientRects().length > 0);
    const gap = featuredLabel
      ? Math.max(0, Math.round(featuredLabel.getBoundingClientRect().top - community.getBoundingClientRect().bottom))
      : 0;
    const margin = navHeight - gap;
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => setCollapsed(entry.boundingClientRect.bottom < margin));
    }, { threshold: 0, rootMargin: `${-margin}px 0px 0px 0px` });
    observer.observe(community);
  }
  function syncPanelControls() {
    panelCategory.value = draft.category;
    panelSeries.value = draft.series;
  }
  function positionPopup(popup, button) {
    const toolbar = crumb.getBoundingClientRect();
    const trigger = button.getBoundingClientRect();
    const leftEdge = toolbar.left + 12, rightEdge = toolbar.right - 12;
    const width = Math.min(320, rightEdge - leftEdge);
    const left = Math.max(leftEdge, Math.min(trigger.right - width, rightEdge - width));
    popup.style.setProperty('--archive-popup-top', (toolbar.bottom + 6) + 'px');
    popup.style.setProperty('--archive-popup-left', left + 'px');
    popup.style.setProperty('--archive-popup-width', width + 'px');
  }
  function onPanelKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!panel.hidden) closePanel();
      else closeSearchPanel();
    }
  }
  function openPanel() {
    if (!panel.hidden) { closePanel(); return; }
    closeSearchPanel(false);
    draft = { category: state.category, series: state.series };
    syncPanelControls();
    panelOpener = dockFilters;
    panel.hidden = false;
    dockFilters.setAttribute('aria-expanded', 'true');
    positionPopup(panel, dockFilters);
    panelCategory.focus();
  }
  function closePanel(restoreFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    dockFilters.setAttribute('aria-expanded', 'false');
    draft = null;
    if (restoreFocus && panelOpener) panelOpener.focus();
    requestAnimationFrame(setupObserver);
  }
  function openSearchPanel() {
    if (!searchPanel.hidden) { closeSearchPanel(); return; }
    closePanel(false);
    mobileSearch.value = search.value;
    searchPanel.hidden = false;
    dockSearch.setAttribute('aria-expanded', 'true');
    positionPopup(searchPanel, dockSearch);
    mobileSearch.focus();
  }
  function closeSearchPanel(restoreFocus = true) {
    if (searchPanel.hidden) return;
    searchPanel.hidden = true;
    dockSearch.setAttribute('aria-expanded', 'false');
    if (restoreFocus) dockSearch.focus();
    requestAnimationFrame(setupObserver);
  }
  document.addEventListener('keydown', onPanelKeydown);
  document.addEventListener('focusin', event => {
    if (!panel.hidden && !panel.contains(event.target) && event.target !== dockFilters) closePanel(false);
    if (!searchPanel.hidden && !searchPanel.contains(event.target) && event.target !== dockSearch) closeSearchPanel(false);
  });
  function repositionPopups() {
    if (!media.matches || crumb.hidden) { closePanel(false); closeSearchPanel(false); return; }
    if (!panel.hidden) positionPopup(panel, dockFilters);
    if (!searchPanel.hidden) positionPopup(searchPanel, dockSearch);
  }
  window.addEventListener('resize', repositionPopups);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', repositionPopups);
  function applyPanel() {
    state.category = draft.category;
    state.series = draft.series;
    closePanel();
    reset();
    scrollToOpeningCard();
  }
  function showIntroduction() {
    const defaultState = state.category === 'all' && state.series === 'all' && !state.query;
    if (welcome) welcome.hidden = !defaultState;
    intro.hidden = true;
    if (state.query || defaultState) return;
    const isSeries = state.series !== 'all';
    const key = isSeries ? state.series : state.category;
    const label = isSeries ? series.selectedOptions[0].textContent : category.selectedOptions[0].textContent;
    const copy = introductions[isSeries ? 'series' : 'categories']?.[key] || {
      title: label, description: `Draft: Explore the latest stories and perspectives in ${label}.`, artwork: ''
    };
    document.getElementById('archive-intro-label').textContent = label.toUpperCase();
    document.getElementById('archive-intro-title').textContent = copy.title;
    document.getElementById('archive-intro-description').textContent = copy.description;
    const image = document.getElementById('archive-intro-image');
    const path = copy.artwork?.startsWith('/') ? grid.dataset.baseurl + copy.artwork : copy.artwork;
    const url = safeUrl(path);
    image.hidden = !url;
    image.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : '';
    intro.hidden = false;
  }
  function matches(post) {
    return (state.query || !post.welcome) &&
      (state.category === 'all' || post.pillars.includes(state.category)) &&
      (state.series === 'all' || post.seriesKey === state.series) &&
      (!state.query || `${post.title} ${post.excerpt}`.toLowerCase().includes(state.query));
  }
  function render(append = false) {
    syncControls(); showIntroduction();
    if (!posts) return;
    const matching = posts.filter(matches);
    const shown = Math.min(state.limit, matching.length);
    const start = append ? grid.children.length : 0;
    if (!append) grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    matching.slice(start, shown).forEach(post => fragment.append(renderCard(post)));
    grid.append(fragment);
    empty.hidden = matching.length !== 0;
    more.hidden = shown >= matching.length;
    status.textContent = matching.length ? `Showing ${shown} of ${matching.length} transmissions.` : 'No matching transmissions.';
  }
  async function loadIndex() {
    if (pending) return pending;
    grid.setAttribute('aria-busy', 'true'); retry.hidden = true;
    pending = (async () => {
      try {
        const response = await fetch(grid.dataset.indexUrl);
        if (!response.ok) throw new Error('Index unavailable');
        const index = await response.json();
        posts = index.posts.sort((a, b) => b.date.localeCompare(a.date));
        introductions = index.introductions || {};
        render();
        await restorePosition();
      } catch (_) {
        status.textContent = 'The archive could not load. Please retry.';
        retry.hidden = false;
      } finally { grid.setAttribute('aria-busy', 'false'); pending = null; revealArchive(); }
    })();
    return pending;
  }
  function scrollToOpeningCard() {
    requestAnimationFrame(() => {
      const section = !intro.hidden ? intro : (welcome && !welcome.hidden ? welcome : null);
      const target = section ? section.querySelector('.featured-card') || section : grid;
      const navHeight = siteNav ? siteNav.getBoundingClientRect().height : 0;
      const toolbarHeight = crumb.hidden ? 0 : crumb.getBoundingClientRect().height;
      const top = window.scrollY + target.getBoundingClientRect().top - navHeight - toolbarHeight - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    });
  }
  function reset() { state.limit = 3; render(); }
  function selectCategory(value) { state.category = value; state.series = 'all'; reset(); }
  buttons.forEach(b => b.addEventListener('click', () => selectCategory(b.dataset.filterPillar)));
  category.addEventListener('change', () => selectCategory(category.value));
  series.addEventListener('change', () => { state.series = series.value; state.category = 'all'; reset(); });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); reset(); });
  toggle.addEventListener('click', () => { state.searchOpen = !state.searchOpen; syncControls(); if (state.searchOpen) search.focus(); });
  search.addEventListener('keydown', e => { if (e.key === 'Escape' && media.matches) { state.searchOpen = false; syncControls(); toggle.focus(); } });
  document.getElementById('archive-clear').addEventListener('click', () => {
    state.category = 'all'; state.series = 'all'; state.query = ''; search.value = ''; reset();
  });
  more.addEventListener('click', () => { state.limit += 10; render(true); });
  retry.addEventListener('click', loadIndex);
  media.addEventListener('change', syncControls);
  crumbRoot.addEventListener('click', () => {
    state.category = 'all'; state.series = 'all'; state.query = ''; search.value = ''; reset();
  });
  dockFilters.addEventListener('click', openPanel);
  dockSearch.addEventListener('click', () => { if (!media.matches) stickyInput.focus(); else openSearchPanel(); });
  stickyCategory.addEventListener('change', () => { selectCategory(stickyCategory.value); scrollToOpeningCard(); });
  stickySeries.addEventListener('change', () => { state.series = stickySeries.value; state.category = 'all'; reset(); });
  stickyInput.addEventListener('input', () => { state.query = stickyInput.value.trim().toLowerCase(); search.value = stickyInput.value; reset(); });
  panelClose.addEventListener('click', () => closePanel());
  panelBackdrop.addEventListener('click', () => closePanel());
  panelClear.addEventListener('click', () => { draft = { category: 'all', series: 'all' }; syncPanelControls(); });
  panelApply.addEventListener('click', applyPanel);
  panelCategory.addEventListener('change', () => { draft.category = panelCategory.value; draft.series = 'all'; syncPanelControls(); });
  panelSeries.addEventListener('change', () => { draft.series = panelSeries.value; draft.category = 'all'; syncPanelControls(); });
  searchClose.addEventListener('click', () => closeSearchPanel());
  searchBackdrop.addEventListener('click', () => closeSearchPanel());
  mobileSearch.addEventListener('input', () => {
    state.query = mobileSearch.value.trim().toLowerCase();
    search.value = mobileSearch.value;
    reset();
  });
  mobileSearch.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      closeSearchPanel();
      scrollToOpeningCard();
    }
  });
  media.addEventListener('change', setupObserver);
  syncControls(); loadIndex(); setupObserver();
})();
