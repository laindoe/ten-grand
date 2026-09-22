#!/usr/bin/env node
// Measure each car drawing's ink box and its licence plate, and print it as
// JSON for tools/build_cars.py.
//
// This needs a browser: the extent of a <path> is not derivable from the
// markup without a path parser, and the plate's face is rotated in one of the
// three exports, so its real position only comes out of a layout engine.
//
//   NODE_PATH=/opt/node22/lib/node_modules node tools/measure_cars.js
//
// Everything is reported in the drawing's own user units.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ART = path.join(__dirname, '..', 'art', 'cars');
const CARS = ['centre', 'left', 'right'];

(async () => {
  const browser = await chromium.launch();
  const out = {};
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

      // The plate: its bezel is the only near-black shape, and its face is the
      // white shape filling that bezel. Identified by paint, not class name --
      // the three exports number their classes differently.
      const bez = boxes.find((b) => getComputedStyle(b.el).fill === 'rgb(12, 12, 12)');
      const face = bez && boxes.find((b) =>
        getComputedStyle(b.el).fill === 'rgb(255, 255, 255)' &&
        b.u.w > bez.u.w * 0.8 && b.u.w < bez.u.w &&
        b.u.x >= bez.u.x - 1 && b.u.x + b.u.w <= bez.u.x + bez.u.w + 1);
      // Bolt holes, so the label can be inset clear of them.
      const bolts = boxes.filter((b) => /circle|ellipse/i.test(b.el.tagName) && b.u.w < 8);
      const r4 = (v) => +v.toFixed(2);
      return {
        ink: [r4(ink.x0), r4(ink.y0), r4(ink.x1 - ink.x0), r4(ink.y1 - ink.y0)],
        face: face ? [r4(face.u.x), r4(face.u.y), r4(face.u.w), r4(face.u.h)] : null,
        boltInset: bolts.length && face
          ? r4(Math.min(...bolts.map((b) => b.u.x + b.u.w / 2)) - face.u.x) : null,
        boltRadius: bolts.length ? r4(bolts[0].u.w / 2) : null,
      };
    });
    await page.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
