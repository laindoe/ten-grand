# The Grand Scheme PDF viewer

The standalone viewer is served at **https://laindoe.github.io/ten-grand/grand-scheme/**.
It does not change the existing Grand Scheme/Kit modal, load a signup form, or change Kit settings.
When ready, set Kit's confirmation redirect to this **viewer URL**, not a PDF file or blob URL.
The viewer is a public static page; an email confirmation redirect is not an access-control gate.

## Replace the PDF

1. Export from InDesign as **`grand-scheme.pdf`**.
2. Open **`assets/pdfs/`** in the GitHub repository, upload the replacement, and commit.
3. Wait for GitHub Pages deployment to finish, then open or refresh the viewer.

Permanent repository path: **`assets/pdfs/grand-scheme.pdf`**.
Published PDF: https://laindoe.github.io/ten-grand/assets/pdfs/grand-scheme.pdf
No code edits, manual version numbers, viewer rebuild, or Codex session are needed.
The existing GitHub Pages deployment still runs automatically after committing.
`PDF_URL` in `_data/grand_scheme.yml` documents this permanent path; leave it unchanged.

Every open/refresh fetches with HTTP `cache: 'no-cache'`, allowing ETag/Last-Modified
conditional validation and reuse of unchanged cached bytes. An automatic GitHub Pages
build revision supplies a deployment-specific cache key, avoiding reuse of a previous
deployment's PDF cache entry. An unrelated site deployment may therefore cause one
fresh PDF download. PDF.js receives the validated bytes as one snapshot, rather than
making separate potentially stale range requests. Returning from the browser's
back/forward cache reloads the viewer to validate again; reading progress is restored.
There is no background polling while someone is reading.

GitHub Pages/CDN deployment propagation can briefly serve the previous HTML or file.
If that happens, wait for deployment propagation and refresh. This static site cannot
force GitHub's edge servers to update instantly. No custom caching headers are assumed.

Page count, aspect ratios, frames, and scroll distance come from the loaded PDF,
including single-page files. Page 1 remains the opening scene; all pages join the
existing continuous horizontal strip. Matching artwork edges give best continuity.
PDF link annotations are read anew from each replacement. No custom hotspots are
currently configured. Future `HOTSPOTS` in `assets/js/grand-scheme-config.js` use page
numbers and normalized coordinates: review them if pages move or artwork changes.
Optional panel names/descriptions in that file describe the prototype; update those
if you want new accessible descriptions after changing the publication's contents.
No Adobe service is used.

## Local development

Use Node.js 22.13+ (Node.js 24 recommended) for the pinned PDF.js build tools.

```sh
npm ci
npm run build:pdf
npm run dev:pdf
```

Open **http://127.0.0.1:4173/ten-grand/grand-scheme/**.
This lightweight preview resolves the viewer's Jekyll URL expressions and YAML PDF setting; it is not a full Jekyll replacement.
For the entire site, use the existing Ruby/GitHub Pages setup:

```sh
bundle install
bundle exec jekyll serve --baseurl /ten-grand
```

The site still builds with Jekyll. There is no Node build step on GitHub Pages: the runtime PDF.js files and matching worker are committed in `assets/pdfjs/`.
To upgrade the PDF.js dependency, update its pinned npm version, run `npm run build:pdf`, rerun the tests, and commit both the lockfile and regenerated runtime assets. Keep the worker and library on the same version.

## Behavior and performance

- All five pages, including the cover, share an equal-height, borderless, zero-gap strip. The first downward scroll immediately moves the strip horizontally.
- The sticky track is exactly `viewport height + max(0, strip width - viewport width)` tall.
  Scroll distance maps 1:1 to horizontal translation. Nothing snaps or changes the browser's wheel/touch behavior.
- The document ends at the Invitation panel. The final sticky viewport remains on screen: there is no closing section or extra vertical scroll. Reverse scrolling follows the same path.
- CSS sheet widths are rounded to integer pixels; all strip sheets have the same CSS height.
  PDF rendering is capped at DPR 2 and approximately 2.5 million pixels per mobile canvas / 5 million per desktop canvas.
- Rendering is queued. Nearby pages are prioritized; mobile retains at most three canvas surfaces.
  Obsolete render tasks are cancelled and old canvas backing stores released on resize/replacement.
- Resize preserves the relative stage position. Page history/reload restoration uses session storage, with BFCache handling.
- The presentation has no visible header or controls. Left/Right keys navigate panels; V switches reading orientation.
  Shortcuts are only handled outside links, form controls, and dialogs.
- Pressing V switches to normal vertical document flow and preserves the current panel.
  Reduced motion starts in vertical mode. Readers may choose horizontal mode explicitly with V.
- Native browser pinch zoom remains available. The viewer does not cancel touch events or remap wheel gestures.
  On mobile, each panel occupies the full viewport. PDF proportions are preserved without cropping; white space may remain where page and screen shapes differ.
- Loading and per-page errors provide retry and direct access to the configured PDF.

## Links and optional HTML hotspots

PDF.js's annotation layer preserves ordinary external links and internal page destinations.
Embedded PDF JavaScript, PDF forms, attachments, and InDesign interactive button actions are not executed.
This prototype's entire Invitation page is one link back to Ten Grand; that is part of the PDF itself.

For accessible HTML overlays, set `HOTSPOTS` in `assets/js/grand-scheme-config.js`:

```js
export const HOTSPOTS = {
  3: [{
    label: 'About the Ten Grand Network',
    rect: [.1, .2, .3, .15],
    description: 'Your explanation here.',
  }],
  4: [{
    label: 'Visit the studio',
    rect: [.2, .6, .25, .1],
    href: 'https://example.com/',
  }],
};
```

Page numbers are one-based. Rectangles are `[left, top, width, height]` measured from the page's top-left, normalized to 0–1.
Use either `href` or `description`. Description buttons open a native dialog supporting keyboard focus and Escape.
Unsafe URL schemes and out-of-page rectangles are ignored. Recheck coordinates after changing the PDF.

The sample PDF is flattened imagery, with no selectable text or tagged reading structure.
The HTML includes brief per-panel descriptions, not a complete transcript. A tagged/text-based PDF or fuller HTML transcript is needed for equivalent access to every printed label.
The viewer adds no borders between panels, but printed frame lines already present in the PDF remain visible.

## Verification

```sh
npx playwright install chromium
npm run test:pdf
```

For an existing system Chromium:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:pdf
```

Tests use the actual PDF, local worker, and `/ten-grand/` path. They cover the immediate cover-to-Invitation horizontal geometry, forward/reverse linear movement, the Invitation endpoint, no added gaps/overflow, resize, browser history, mobile layout and pixel caps, reading mode, keyboard navigation, reduced motion, loading failure/retry, slow loads, native PDF links, and normalized hotspot dialogs.
The mobile test uses Chromium's mobile/touch emulation; it does **not** certify real iOS Safari. Before publishing, check an iPhone for touch scrolling, browser-bar expansion/collapse, pinch zoom, rotation, and history restoration.

## Build and deploy

1. Run `npm run build:pdf` if upgrading dependencies (otherwise use committed assets).
2. Run the viewer tests. Optionally validate the complete site with `bundle exec jekyll build`.
3. Commit and push through the site's existing GitHub Pages workflow.
4. Confirm the Pages build and the hosted viewer URL succeed.
5. Separately, when authorized, configure Kit's confirmation redirect to the viewer URL. No Kit changes are made by this implementation.
