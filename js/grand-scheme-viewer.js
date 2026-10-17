// Standalone PDF.js reader. The Kit signup modal and its settings are independent.
const $ = (id) => document.getElementById(id);
const toolbar = $('viewer-toolbar');
const track = $('blueprint-track'), viewport = $('blueprint-viewport'), strip = $('blueprint-strip');
const picker = $('page-picker'), modeButton = $('reading-mode'), progress = $('reading-progress');
const notice = $('load-notice'), message = $('load-message'), retry = $('retry-load');
const previous = $('previous-page'), next = $('next-page');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const smallDevice = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const vendor = new URL('../assets/pdfjs/', import.meta.url);
const storageKey = `ten-grand-blueprint:${location.pathname}`;
let pdfjs, config, loadingTask, pdf, records = [], generation = 0, queue = [], processing = false;
let frame = 0, resizeTimer = 0, geometry = null, currentPage = 1, desired = new Set();
let readingPosition = null, resizePosition = null;
let failure = false, destroyed = false, starting = true, lastLayout = '';
let mode = reducedMotion.matches ? 'vertical' : 'horizontal';
try { if (localStorage.getItem(`${storageKey}:mode`) === 'vertical') mode = 'vertical'; } catch {}
document.body.dataset.mode = mode;

function showNotice(text, error = false, floating = false) {
  notice.hidden = false;
  notice.classList.toggle('is-error', error);
  notice.classList.toggle('is-floating', floating);
  notice.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
  retry.hidden = !error;
  failure = error;
}
function hideNotice() { notice.hidden = true; failure = false; }
function title(number) { return config?.PAGE_DETAILS[number - 1]?.title || `Blueprint panel ${number}`; }
function updateModeControl() {
  modeButton.textContent = mode === 'vertical' ? 'Read horizontally' : 'Read vertically';
  modeButton.setAttribute('aria-pressed', String(mode === 'vertical'));
}
function safeURL(value) {
  try { const url = new URL(value, config.PDF_URL); return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function capturePosition() {
  if (!geometry) return { section: 'cover', y: scrollY };
  if (mode === 'vertical') {
    const record = records.find((item) => item.element.getBoundingClientRect().bottom > geometry.toolbar + 1) || records.at(-1);
    const top = record.element.getBoundingClientRect().top + scrollY;
    return { section: 'vertical', page: record.number, fraction: (scrollY + geometry.toolbar - top) / record.height };
  }
  const relative = scrollY - geometry.start;
  if (relative < 0) return { section: 'cover', y: scrollY };
  if (relative > geometry.travel) return { section: 'ending', extra: relative - geometry.travel };
  return { section: 'stage', fraction: geometry.travel ? relative / geometry.travel : 0 };
}
function restorePosition(position) {
  if (!position || !geometry) return;
  let y = position.y || 0;
  if (position.section === 'stage') y = geometry.start + geometry.travel * Math.max(0, Math.min(1, position.fraction || 0));
  if (position.section === 'ending') y = geometry.start + geometry.travel + (position.extra || 0);
  if (position.section === 'vertical') {
    const record = records[(position.page || 1) - 1];
    if (record) y = record.element.getBoundingClientRect().top + scrollY - geometry.toolbar + (position.fraction || 0) * record.height;
  }
  window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  scheduleUpdate();
}
function goToPage(number) {
  if (!geometry) return;
  number = Math.max(1, Math.min(records.length, Number(number)));
  let y;
  if (number === 1) y = 0;
  else if (mode === 'vertical') y = records[number - 1].element.getBoundingClientRect().top + scrollY - geometry.toolbar;
  else y = geometry.start + geometry.travel * (number - 1) / Math.max(1, records.length - 1);
  window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  scheduleUpdate();
}

// A small link service for PDF.js' real annotation layer. PDF JavaScript stays disabled.
const linkService = {
  externalLinkEnabled: true,
  addLinkAttributes(link, value, newWindow) {
    const url = safeURL(value);
    if (!url) return;
    link.href = url;
    link.rel = 'noopener noreferrer';
    if (newWindow) link.target = '_blank';
    link.setAttribute('aria-label', `PDF link: ${url}`);
  },
  getDestinationHash() { return '#blueprint-reader'; },
  getAnchorUrl(hash) { return hash || '#blueprint-reader'; },
  async goToDestination(destination) {
    try {
      const dest = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
      if (!dest) return;
      const index = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
      goToPage(index + 1);
    } catch { showNotice('This PDF destination could not be opened. Use the panel menu instead.', true, true); }
  },
  executeNamedAction(action) {
    if (action === 'NextPage') goToPage(currentPage + 1);
    else if (action === 'PrevPage') goToPage(currentPage - 1);
    else if (action === 'FirstPage') goToPage(1);
    else if (action === 'LastPage') goToPage(records.length);
  },
};

function addHotspots(record) {
  const layer = document.createElement('div');
  layer.className = 'hotspot-layer';
  for (const hotspot of config.HOTSPOTS[record.number] || []) {
    const rect = hotspot.rect;
    if (!hotspot.label || !Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(value) || value < 0 || value > 1) || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > 1 || rect[1] + rect[3] > 1) continue;
    const href = hotspot.href && safeURL(hotspot.href);
    if (!href && !hotspot.description) continue;
    const element = document.createElement(href ? 'a' : 'button');
    element.className = 'blueprint-hotspot';
    element.setAttribute('aria-label', hotspot.label);
    element.title = hotspot.label;
    Object.assign(element.style, { left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%`, height: `${rect[3] * 100}%` });
    if (href) { element.href = href; element.rel = 'noopener noreferrer'; }
    else {
      element.type = 'button';
      element.setAttribute('aria-haspopup', 'dialog');
      element.addEventListener('click', () => {
        $('hotspot-title').textContent = hotspot.label;
        $('hotspot-description').textContent = hotspot.description;
        $('hotspot-dialog').showModal();
      });
    }
    layer.append(element);
  }
  record.surface.append(layer);
}
function makeRecord(page, number) {
  const base = page.getViewport({ scale: 1 });
  const element = document.createElement('div');
  element.className = 'blueprint-sheet';
  element.dataset.page = number;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `${number} of ${pdf.numPages}: ${title(number)}. ${config.PAGE_DETAILS[number - 1]?.description || ''}`);
  const placeholder = document.createElement('span');
  placeholder.className = 'sheet-placeholder';
  placeholder.textContent = `Loading ${title(number)}…`;
  element.append(placeholder);
  addDescription(number);
  const surface = document.createElement('div');
  surface.className = 'pdf-page-surface';
  element.append(surface);
  const record = { page, number, base, element, surface, placeholder, width: 0, height: 0, canvas: null, task: null, rendered: false, failed: false };
  strip.append(element);
  addHotspots(record);
  return record;
}
function addDescription(number) {
  const item = document.createElement('li');
  const heading = document.createElement('strong');
  heading.textContent = title(number);
  item.append(heading, document.createTextNode(` — ${config.PAGE_DETAILS[number - 1]?.description || 'A blueprint panel in The Grand Scheme.'}`));
  $('panel-descriptions').append(item);
}
function dispose(record) {
  record.task?.cancel();
  record.task = null;
  if (record.canvas) { record.canvas.width = 0; record.canvas.height = 0; record.canvas.remove(); record.canvas = null; }
  record.surface.querySelector('.annotationLayer')?.remove();
  record.rendered = false;
  record.placeholder.hidden = false;
  record.page.cleanup();
}
function cancelRendering() {
  generation++;
  queue = [];
  for (const record of records) dispose(record);
}
function layout(preserve = true, savedPosition = null) {
  if (!pdf || destroyed) return;
  const position = preserve ? savedPosition || capturePosition() : null;
  const toolbarHeight = Math.ceil(toolbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--toolbar-height', `${toolbarHeight}px`);
  const width = document.documentElement.clientWidth;
  const height = Math.max(180, Math.round(viewport.clientHeight));
  const signature = `${width}:${mode === 'vertical' ? 'v' : height}:${mode}:${devicePixelRatio}`;
  if (signature === lastLayout && preserve) { update(); return; }
  lastLayout = signature;
  cancelRendering();
  for (const record of records) {
    const ratio = record.base.width / record.base.height;
    if (mode === 'vertical') {
      record.width = Math.round(Math.min(width, 1000));
      record.height = Math.round(record.width / ratio);
    } else if (width <= 760 || matchMedia('(pointer: coarse)').matches) {
      record.width = width;
      record.height = height;
    } else {
      record.height = height;
      record.width = Math.round(height * ratio);
    }
    Object.assign(record.element.style, { width: `${record.width}px`, height: `${record.height}px` });
    const scale = Math.min(record.width / record.base.width, record.height / record.base.height);
    record.artWidth = record.base.width * scale;
    record.artHeight = record.base.height * scale;
    Object.assign(record.surface.style, { width: `${record.artWidth}px`, height: `${record.artHeight}px`, left: `${(record.width - record.artWidth) / 2}px`, top: `${(record.height - record.artHeight) / 2}px` });
    record.failed = false;
  }
  const stripWidth = records.reduce((sum, record) => sum + record.width, 0);
  const travel = Math.max(0, stripWidth - width);
  track.style.height = mode === 'horizontal' ? `${height + travel}px` : 'auto';
  const start = track.getBoundingClientRect().top + scrollY - toolbarHeight;
  geometry = { width, height, toolbar: toolbarHeight, travel, start };
  if (position) restorePosition(position);
  update();
}
async function renderRecord(record, token) {
  if (record.rendered || record.failed || token !== generation) return;
  const cssScale = Math.min(record.width / record.base.width, record.height / record.base.height);
  const pdfViewport = record.page.getViewport({ scale: cssScale });
  const maxPixels = smallDevice ? 2_500_000 : 5_000_000;
  const outputScale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(maxPixels / (record.width * record.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(pdfViewport.width * outputScale);
  canvas.height = Math.ceil(pdfViewport.height * outputScale);
  canvas.setAttribute('aria-hidden', 'true');
  let task;
  try {
    task = record.page.render({ canvas, viewport: pdfViewport, transform: [outputScale, 0, 0, outputScale, 0, 0], background: 'rgb(255,255,255)' });
    record.task = task;
    await task.promise;
    if (token !== generation || destroyed || !desired.has(record)) { canvas.width = canvas.height = 0; return; }
    record.canvas = canvas;
    record.surface.prepend(canvas);
    record.placeholder.hidden = true;
    record.rendered = true;
    record.element.style.setProperty('--total-scale-factor', String(cssScale * (record.base.userUnit || 1)));
    record.element.style.setProperty('--scale-round-x', '1px');
    record.element.style.setProperty('--scale-round-y', '1px');
    const annotations = (await record.page.getAnnotations({ intent: 'display' })).filter((annotation) => annotation.annotationType === pdfjs.AnnotationType.LINK);
    if (token !== generation || destroyed || !desired.has(record)) return;
    if (annotations.length) {
      const div = document.createElement('div');
      div.className = 'annotationLayer';
      record.surface.append(div);
      const layer = new pdfjs.AnnotationLayer({ div, page: record.page, viewport: pdfViewport.clone({ dontFlip: true }), linkService });
      await layer.render({ annotations, renderForms: false, enableScripting: false, imageResourcesPath: new URL('images/', vendor).href });
      div.querySelectorAll('a').forEach((link) => {
        if (!link.hasAttribute('aria-label')) link.setAttribute('aria-label', 'Go to another blueprint panel');
      });
    }
  } catch (error) {
    canvas.width = canvas.height = 0;
    if (token !== generation || error.name === 'RenderingCancelledException' || destroyed) return;
    dispose(record);
    record.failed = true;
    record.rendered = false;
    record.placeholder.textContent = `${title(record.number)} could not be rendered.`;
    record.placeholder.hidden = false;
    showNotice('A panel could not load. Try again, or open the PDF directly.', true, true);
    console.error('Grand Scheme page rendering failed', error);
  } finally { if (record.task === task) record.task = null; }
}
async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length && !destroyed) {
      const entry = queue.shift();
      if (entry.token !== generation || !desired.has(entry.record)) continue;
      await renderRecord(entry.record, entry.token);
    }
  } finally { processing = false; }
  if (!failure && records.some((record) => record.rendered)) hideNotice();
}
function scheduleRendering() {
  const candidates = records.map((record) => {
    const rect = record.element.getBoundingClientRect();
    const verticalDistance = Math.max(geometry.toolbar - rect.bottom, rect.top - innerHeight, 0);
    const horizontalDistance = Math.max(-rect.right, rect.left - geometry.width, 0);
    const distance = verticalDistance + horizontalDistance;
    record.element.inert = verticalDistance > 0 || horizontalDistance > 0;
    return { record, distance };
  }).sort((a, b) => a.distance - b.distance);
  desired = new Set(candidates.slice(0, smallDevice ? 3 : 5).map((item) => item.record));
  for (const record of records) {
    if (!desired.has(record) && record.canvas && !record.task) dispose(record);
  }
  queue = queue.filter((entry) => desired.has(entry.record) && entry.token === generation);
  for (const { record } of candidates) {
    if (desired.has(record) && !record.rendered && !record.failed && !record.task && !queue.some((entry) => entry.record === record)) queue.push({ record, token: generation });
  }
  void drainQueue();
}
function update() {
  frame = 0;
  if (!geometry || !pdf || destroyed) return;
  let fraction;
  if (mode === 'horizontal') {
    const offset = Math.max(0, Math.min(geometry.travel, scrollY - geometry.start));
    strip.style.transform = `translate3d(${-offset}px,0,0)`;
    fraction = geometry.travel ? offset / geometry.travel : scrollY >= geometry.start ? 1 : 0;
    currentPage = Math.min(records.length, 1 + Math.round(fraction * Math.max(0, records.length - 1)));
    progress.value = fraction;
  } else {
    const first = records.find((record) => record.element.getBoundingClientRect().bottom > geometry.toolbar + 1);
    currentPage = first?.number || records.length;
    progress.value = currentPage / records.length;
  }
  picker.value = String(currentPage);
  previous.disabled = currentPage <= 1;
  next.disabled = currentPage >= records.length;
  if (!resizePosition && document.documentElement.clientWidth === geometry.width && (mode === 'vertical' || Math.round(viewport.clientHeight) === geometry.height)) readingPosition = capturePosition();
  scheduleRendering();
}
function scheduleUpdate() { if (!frame) frame = requestAnimationFrame(update); }
function changeMode() {
  if (!pdf) return;
  const page = currentPage;
  mode = mode === 'horizontal' ? 'vertical' : 'horizontal';
  document.body.dataset.mode = mode;
  try { localStorage.setItem(`${storageKey}:mode`, mode); } catch {}
  updateModeControl();
  layout(false);
  goToPage(page);
}
async function load() {
  destroyed = false;
  starting = true;
  hideNotice();
  showNotice('Loading the blueprint…');
  $('blueprint-reader').setAttribute('aria-busy', 'true');
  const slow = setTimeout(() => { if (starting) showNotice('The blueprint is still loading. You can open the PDF directly while you wait.'); }, 8000);
  try {
    config ||= await import('../assets/js/grand-scheme-config.js');
    for (const id of ['download-pdf', 'notice-download']) { $(id).href = config.PDF_URL; $(id).hidden = false; }
    pdfjs ||= await import(new URL('pdf.min.mjs', vendor).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendor).href;
    // Revalidate cached bytes on every open/refresh. The deployment revision also
    // gives each GitHub Pages deployment a fresh CDN key, without manual versions.
    const source = new URL(config.PDF_URL);
    const revision = document.body.dataset.pdfRevision;
    if (revision) source.searchParams.set('publication', revision);
    const response = await fetch(source, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    // Supply one validated snapshot: PDF.js must not mix cached range responses.
    loadingTask = pdfjs.getDocument({ data, cMapUrl: new URL('cmaps/', vendor).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', vendor).href, wasmUrl: new URL('wasm/', vendor).href, iccUrl: new URL('iccs/', vendor).href, isEvalSupported: false });
    loadingTask.onProgress = ({ loaded, total }) => { if (starting && total) message.textContent = `Loading the blueprint… ${Math.min(100, Math.round(100 * loaded / total))}%`; };
    pdf = await loadingTask.promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
    strip.replaceChildren(); $('panel-descriptions').replaceChildren();
    records = pages.map((page, i) => makeRecord(page, i + 1));
    picker.replaceChildren(...records.map((record) => new Option(`${record.number}. ${title(record.number)}`, record.number)));
    picker.disabled = modeButton.disabled = false;
    $('viewer-ending').hidden = false;
    $('blueprint-reader').setAttribute('aria-busy', 'false');
    hideNotice();
    updateModeControl();
    layout(false);
    const navigation = performance.getEntriesByType('navigation')[0]?.type;
    if (navigation === 'back_forward' || navigation === 'reload') {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey));
        if (saved?.mode === mode) requestAnimationFrame(() => requestAnimationFrame(() => restorePosition(saved.position)));
      } catch {}
    }
  } catch (error) {
    pdf = null;
    await loadingTask?.destroy();
    loadingTask = null;
    showNotice('The blueprint could not load. Check your connection and try again, or open the PDF directly.', true);
    $('blueprint-reader').setAttribute('aria-busy', 'false');
    console.error('Grand Scheme PDF loading failed', error);
  } finally { clearTimeout(slow); starting = false; }
}

previous.addEventListener('click', () => goToPage(currentPage - 1));
next.addEventListener('click', () => goToPage(currentPage + 1));
picker.addEventListener('change', () => goToPage(picker.value));
modeButton.addEventListener('click', changeMode);
retry.addEventListener('click', () => {
  if (pdf) {
    hideNotice();
    records.forEach((record) => { record.failed = false; record.placeholder.textContent = `Loading ${title(record.number)}…`; });
    scheduleUpdate();
  } else void load();
});
window.addEventListener('scroll', scheduleUpdate, { passive: true });
window.addEventListener('resize', () => {
  resizePosition ||= readingPosition || capturePosition();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const position = resizePosition; resizePosition = null; layout(true, position);
  }, 140);
}, { passive: true });
new ResizeObserver(() => {
  if (geometry && Math.ceil(toolbar.getBoundingClientRect().height) !== geometry.toolbar) layout();
}).observe(toolbar);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches && mode !== 'vertical') changeMode(); });
document.addEventListener('keydown', (event) => {
  if (!pdf || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, select, textarea, button, a, dialog')) return;
  if (event.key.toLowerCase() === 'v') { event.preventDefault(); changeMode(); return; }
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); goToPage(currentPage + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
document.addEventListener('focusin', (event) => {
  const sheet = event.target.closest('.blueprint-sheet');
  if (!sheet || !geometry) return;
  const rect = event.target.getBoundingClientRect();
  if (rect.left < 0 || rect.right > geometry.width || rect.top < geometry.toolbar || rect.bottom > innerHeight) goToPage(Number(sheet.dataset.page));
});
function savePosition() {
  if (!geometry) return;
  try { sessionStorage.setItem(storageKey, JSON.stringify({ mode, position: capturePosition() })); } catch {}
}
window.addEventListener('pagehide', (event) => {
  savePosition();
  if (!event.persisted) {
    destroyed = true;
    cancelRendering();
    void loadingTask?.destroy();
  }
});
window.addEventListener('pageshow', (event) => { if (event.persisted) { location.reload(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) savePosition(); });
void load();
