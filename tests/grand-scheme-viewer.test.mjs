import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createViewerServer } from '../tools/pdf-viewer-server.mjs';
let server, browser, origin, url;
before(async () => {
  server = createViewerServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  url = `${origin}/ten-grand/grand-scheme/`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await new Promise((resolve) => server?.close(resolve)); });
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#page-picker').options.length === 5 && !document.querySelector('#page-picker').disabled);
  await page.waitForSelector('[data-page="1"] canvas');
}
async function scrollToFraction(page, fraction) {
  await page.evaluate((fraction) => {
    const track = document.querySelector('#blueprint-track'), view = document.querySelector('#blueprint-viewport');
    const toolbar = document.querySelector('#viewer-toolbar').offsetHeight;
    const travel = document.querySelector('#blueprint-strip').offsetWidth - view.clientWidth;
    scrollTo(0, track.getBoundingClientRect().top + scrollY - toolbar + Math.max(0, travel) * fraction);
  }, fraction);
  await page.waitForTimeout(100);
}
async function stageMetrics(page) {
  return page.evaluate(() => {
    const track = document.querySelector('#blueprint-track'), view = document.querySelector('#blueprint-viewport'), strip = document.querySelector('#blueprint-strip');
    const toolbar = document.querySelector('#viewer-toolbar').offsetHeight;
    const rects = Array.from(strip.children, (node) => node.getBoundingClientRect());
    return { x: new DOMMatrix(getComputedStyle(strip).transform).m41, travel: Math.max(0, strip.offsetWidth - view.clientWidth), top: view.getBoundingClientRect().top, toolbar, trackHeight: track.offsetHeight, height: view.clientHeight, progress: document.querySelector('#reading-progress').value,
      seams: rects.slice(1).map((rect, i) => rect.left - rects[i].right), heights: rects.map((rect) => rect.height), horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      canvases: document.querySelectorAll('canvas').length };
  });
}

test('All five pages in one horizontal strip from the first scroll, Invitation endpoint, resize, and history', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  assert.equal(await page.locator('#blueprint-strip > .blueprint-sheet').count(), 5);
  await page.evaluate(() => scrollTo(0, 80)); await page.waitForTimeout(100);
  assert.ok(Math.abs((await stageMetrics(page)).x + 80) < 1.1, 'The first vertical scroll immediately moves the cover horizontally');
  for (const fraction of [0, .5, .25, 1]) {
    await scrollToFraction(page, fraction);
    const m = await stageMetrics(page);
    assert.ok(Math.abs(m.x + m.travel * fraction) <= 1.1, JSON.stringify(m));
    assert.ok(Math.abs(m.top - m.toolbar) < 1.1);
    assert.equal(m.trackHeight, m.height + m.travel);
    assert.ok(m.seams.every((gap) => Math.abs(gap) < .01));
    assert.equal(new Set(m.heights).size, 1);
    assert.equal(m.horizontalOverflow, false);
  }
  await page.evaluate(() => scrollBy(0, 150)); await page.waitForTimeout(100);
  let m = await stageMetrics(page); assert.ok(Math.abs(m.top) < 1.1, 'Invitation remains at the document endpoint');
  assert.equal(await page.locator('#viewer-toolbar').isVisible(), false);
  assert.ok(await page.evaluate(() => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight) < 2), 'No trailing vertical section');
  await scrollToFraction(page, .5);
  await page.setViewportSize({ width: 1050, height: 780 }); await page.waitForTimeout(450);
  m = await stageMetrics(page); assert.ok(Math.abs(m.x / m.travel + .5) < .025, 'Resize must preserve progress');
  await page.goto(`${origin}/ten-grand/`);
  await page.goBack(); await page.waitForSelector('.blueprint-strip canvas'); await page.waitForTimeout(450);
  m = await stageMetrics(page); assert.ok(Math.abs(m.x / m.travel + .5) < .04, 'History must restore reading progress');
  assert.deepEqual(errors, []); await page.close();
});

test('mobile touch layout, bounded canvas memory, vertical toggle, and keyboard controls', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await ready(page);
  await page.locator('#blueprint-reader').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  const frame = await page.locator('[data-page="2"]').boundingBox();
  assert.equal(frame.width, 390); assert.equal(frame.height, 844);
  let m = await stageMetrics(page); assert.ok(Math.abs(m.top - m.toolbar) < 2); assert.equal(m.horizontalOverflow, false);
  const beforeTouch = await page.evaluate(() => scrollY);
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
  for (const y of [610, 550, 480, 410]) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
    await page.waitForTimeout(35);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(() => scrollY) > beforeTouch + 40, 'Native vertical touch swipe scrolls the reader');
  await touch.detach();
  await scrollToFraction(page, .8); await page.waitForTimeout(900);
  m = await stageMetrics(page); assert.ok(m.canvases <= 3, `Retained ${m.canvases} canvases`);
  const maxPixels = await page.locator('canvas').evaluateAll((canvases) => Math.max(...canvases.map((canvas) => canvas.width * canvas.height)));
  assert.ok(maxPixels <= 2_510_000, 'Mobile raster scale cap');
  await page.locator('#blueprint-reader').focus(); await page.keyboard.press('v');
  await page.waitForFunction(() => document.body.dataset.mode === 'vertical');
  assert.equal(await page.locator('#blueprint-viewport').evaluate((node) => getComputedStyle(node).position), 'static');
  const positions = await page.locator('#blueprint-strip > div').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  assert.ok(positions.every((value, i) => i === 0 || value > positions[i - 1]));
  await page.locator('#blueprint-reader').focus(); await page.keyboard.press('v');
  await page.evaluate(() => { const p = document.querySelector('#page-picker'); p.value = '1'; p.dispatchEvent(new Event('change')); }); await page.waitForTimeout(100);
  await page.locator('#blueprint-reader').focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#page-picker').value === '2');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#page-picker').value === '3');
  await context.close();
});

test('reduced motion starts in an ordinary non-pinned vertical layout', async () => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 900, height: 800 } });
  const page = await context.newPage(); await ready(page);
  assert.equal(await page.locator('body').getAttribute('data-mode'), 'vertical');
  assert.equal(await page.locator('#blueprint-viewport').evaluate((node) => getComputedStyle(node).position), 'static');
  assert.equal(await page.locator('#reading-mode').getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('PDF loading failure is visible and retry recovers at the same base path', async () => {
  const page = await browser.newPage();
  await page.route('**/grand_scheme_blueprint_prototype.pdf', (route) => route.fulfill({ status: 404, body: 'Missing PDF' }));
  await page.goto(url); await page.waitForSelector('#retry-load:not([hidden])');
  assert.match(await page.locator('#load-message').textContent(), /could not load/);
  assert.match(await page.locator('#notice-download').getAttribute('href'), /\/ten-grand\/assets\/pdfs\//);
  await page.unroute('**/grand_scheme_blueprint_prototype.pdf'); await page.locator('#retry-load').click();
  await page.waitForSelector('[data-page="1"] canvas');
  await page.waitForFunction(() => document.querySelector('#load-notice').hidden);
  await page.close();
});

test('slow loading stays actionable without blocking normal page controls', async () => {
  const page = await browser.newPage(); let release;
  const hold = new Promise((resolve) => { release = resolve; });
  await page.route('**/grand_scheme_blueprint_prototype.pdf', async (route) => { await hold; await route.continue(); });
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#load-message').textContent.includes('still loading'), { timeout: 15000 });
  assert.equal(await page.locator('#notice-download').isVisible(), true);
  assert.equal(await page.locator('#viewer-toolbar').isVisible(), false);
  release(); await page.waitForSelector('[data-page="1"] canvas'); await page.close();
});

test('native PDF annotation activates, and normalized HTML hotspots open accessible details', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/assets/js/grand-scheme-config.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('export const HOTSPOTS = {};', "export const HOTSPOTS = {3:[{label:'About the network',rect:[.2,.3,.2,.1],description:'Network hotspot test.'}]};");
    await route.fulfill({ response, body });
  });
  await ready(page); await page.evaluate(() => { const p = document.querySelector('#page-picker'); p.value = '3'; p.dispatchEvent(new Event('change')); }); await page.waitForTimeout(100);
  const hotspot = page.getByRole('button', { name: 'About the network' });
  const coordinates = await hotspot.evaluate((element) => {
    const p = element.closest('.blueprint-sheet').getBoundingClientRect(), r = element.getBoundingClientRect();
    return [(r.left - p.left) / p.width, (r.top - p.top) / p.height, r.width / p.width, r.height / p.height];
  });
  [.2, .3, .2, .1].forEach((expected, i) => assert.ok(Math.abs(coordinates[i] - expected) < .005));
  await hotspot.click(); assert.equal(await page.locator('#hotspot-dialog').isVisible(), true);
  assert.equal(await page.locator('#hotspot-description').textContent(), 'Network hotspot test.');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#hotspot-dialog').isVisible(), false);
  await page.evaluate(() => { const p = document.querySelector('#page-picker'); p.value = '5'; p.dispatchEvent(new Event('change')); });
  const link = page.locator('[data-page="5"] .annotationLayer a'); await link.waitFor();
  const target = 'https://laindoe.github.io/ten-grand/'; assert.equal(await link.getAttribute('href'), target);
  await page.route(target, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Ten Grand link destination</h1>' }));
  await link.click(); await page.waitForURL(target); await page.close();
});


test('a canvas rendering failure shows retry and recovers without reloading the PDF', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let fail = true;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      if (fail && args[0] === '2d') { fail = false; throw new Error('Simulated canvas allocation failure'); }
      return original.apply(this, args);
    };
  });
  await page.goto(url);
  await page.waitForSelector('#retry-load:not([hidden])');
  assert.match(await page.locator('#load-message').textContent(), /panel could not load/);
  await page.locator('#retry-load').click();
  await page.waitForSelector('[data-page="1"] canvas');
  await page.waitForFunction(() => document.querySelector('#load-notice').hidden);
  await page.close();
});
