#!/usr/bin/env node
// Measure each car drawing's ink box, its licence plate, and every shape's
// bounding box, and print it as JSON for tools/build_cars.py.
//
// This needs a browser: the extent of a <path> is not derivable from the
// markup without a path parser, and the plate's face is rotated in some
// exports, so its real position only comes out of a layout engine. Per-shape
// boxes are needed too, because the artist's taillights are drawn as
// freeform paths (housings, lenses, reflectors) rather than plain rects, so
// build_cars.py can no longer size a lamp's glow from its own x/width
// attributes -- it has to come from measured geometry, matched back to the
// same shape by walking the file in the same order.
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/measure_cars.js
//
// Everything is reported in the drawing's own user units.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ART = path.join(__dirname, '..', 'art', 'cars');
const CARS = ['left-1', 'left-2', 'centre-1', 'centre-2', 'right-1', 'right-2'];

// Plate-label font metrics, needed to size each car's font so its own
// longest assigned name fills the label box consistently -- monospace
// letters aren't perfectly uniform advance in every real font (a "1" or "3"
// can differ from a "W"), so a per-character constant tuned against one
// word (PHOTOGRAPHR) drifted off for others. Measured directly instead:
// PLATE_LABELS is a JSON array of every distinct word build_cars.py will
// place on a plate, passed in as an env var since it's Python-side data.
const LABELS = JSON.parse(process.env.PLATE_LABELS || '[]');

(async () => {
  const browser = await chromium.launch();
  const labelPage = await browser.newPage();
  await labelPage.setContent(`
    <div style="position:absolute;visibility:hidden;white-space:nowrap;
      font-family:ui-monospace,Menlo,Consolas,'Liberation Mono',monospace;
      font-weight:700;line-height:1;letter-spacing:-0.02em;font-size:200px"
      id="m"></div>`);
  const labelWidth = {};
  for (const word of LABELS) {
    labelWidth[word] = await labelPage.evaluate((w) => {
      const el = document.getElementById('m');
      el.textContent = w;
      return el.getBoundingClientRect().width / 200;
    }, word);
  }
  await labelPage.close();

  const out = { _labelWidth: labelWidth };
  for (const name of CARS) {
    const page = await browser.newPage();
    await page.setContent('<div id="h" style="width:1400px"></div>');
    await page.evaluate((s) => { document.getElementById('h').innerHTML = s; },
      fs.readFileSync(path.join(ART, name + '.svg'), 'utf8'));
    await page.waitForTimeout(150);
    out[name] = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      const vb = svg.viewBox.baseVal;
      const host = svg.getBoundingClientRect();
      const k = vb.width / host.width;               // page px -> user units
      const toUser = (r) => ({
        x: vb.x + (r.x - host.x) * k, y: vb.y + (r.y - host.y) * k,
        w: r.width * k, h: r.height * k,
      });
      const shapes = [...svg.querySelectorAll('path,rect,circle,ellipse,line,polygon,polyline')];
      const boxes = shapes.map((el) => ({ el, u: toUser(el.getBoundingClientRect()) }));
      const ink = boxes.reduce((a, b) => ({
        x0: Math.min(a.x0, b.u.x), y0: Math.min(a.y0, b.u.y),
        x1: Math.max(a.x1, b.u.x + b.u.w), y1: Math.max(a.y1, b.u.y + b.u.h),
      }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });

      // The plate face: the largest roughly plate-sized white shape (this
      // rules out the small white bolt-hole dots). The bezel used to be
      // found first, by a placeholder #0c0c0c fill, but the real art draws
      // it as a bare stroke (no fill) sized to the face, so it's found
      // second instead, as the smallest unfilled shape whose box encloses
      // the face -- direction reversed from the old convention, not just
      // the paint value.
      const isWhite = (el) => getComputedStyle(el).fill === 'rgb(255, 255, 255)';
      const whites = boxes.filter((b) => isWhite(b.el) && b.u.w > 20 && b.u.h > 8);
      const face = whites.sort((a, b) => (b.u.w * b.u.h) - (a.u.w * a.u.h))[0] || null;
      const pad = 0.75;
      const bezCandidates = face ? boxes.filter((b) =>
        getComputedStyle(b.el).fill === 'none' &&
        b.u.x <= face.u.x + pad && b.u.y <= face.u.y + pad &&
        b.u.x + b.u.w >= face.u.x + face.u.w - pad &&
        b.u.y + b.u.h >= face.u.y + face.u.h - pad) : [];
      const bez = bezCandidates.sort((a, b) => (a.u.w * a.u.h) - (b.u.w * b.u.h))[0] || null;
      // Bolt holes, so the label can be inset clear of them. Any small,
      // roughly round/square shape near the face -- the exports use
      // <circle>, <ellipse> and plain <path> corner dots interchangeably.
      const bolts = face ? boxes.filter((b) => {
        const { w, h } = b.u;
        if (w < 0.5 || h < 0.5 || w > 10 || h > 10) return false;
        if (Math.max(w, h) / Math.min(w, h) > 2) return false;
        const m = 15;
        return b.u.x >= face.u.x - m && b.u.x + w <= face.u.x + face.u.w + m &&
          b.u.y >= face.u.y - m && b.u.y + h <= face.u.y + face.u.h + m;
      }) : [];
      const r4 = (v) => +v.toFixed(2);
      return {
        ink: [r4(ink.x0), r4(ink.y0), r4(ink.x1 - ink.x0), r4(ink.y1 - ink.y0)],
        face: face ? [r4(face.u.x), r4(face.u.y), r4(face.u.w), r4(face.u.h)] : null,
        boltInset: bolts.length && face
          ? r4(Math.min(...bolts.map((b) => b.u.x + b.u.w / 2)) - face.u.x) : null,
        boltRadius: bolts.length ? r4(bolts[0].u.w / 2) : null,
        // Every shape's box, in the same document order build_cars.py's own
        // regex walk visits them, so it can zip the two lists by index.
        shapeBoxes: boxes.map((b) => [r4(b.u.x), r4(b.u.y), r4(b.u.w), r4(b.u.h)]),
      };
    });
    await page.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
