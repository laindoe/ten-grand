# Ten Grand — Scrollytelling World Site

A plain HTML/CSS/JS scrollytelling site for Ten Grand. No build step —
static files served directly, ready for GitHub Pages.

## Structure

```
index.html          Page markup, all sections
css/style.css        Styles, CSS variables for colors/fonts/spacing
js/main.js           Scroll animations (reveal-on-scroll)
assets/images/       Exported logo/icon assets go here
assets/fonts/        Any self-hosted font files go here
```

## Sections implemented

1. **Intro** (`#intro`) — nav, wordmark, headline, target icon, explainer
   paragraph. Built from the Figma "intro" frame.
2. **Manual** (`#manual`) — "TG-10000 MANUAL" eyebrow + 4 stacked steps
   (IDEA / VALIDATION / DEVELOPMENT / LAUNCH), each with its own icon and
   color, fading in on scroll. Built from the Figma "manual" frame.

Nav items ENGINE / FUEL / DIRECTOR / CONNECT are stubs pointing at `#`
until those Figma frames are built out.

## Known placeholders (TODO before this looks "real")

- **Step body copy**: all four manual steps currently share the same
  placeholder text ("The divine spark...") — that's what's authored in
  Figma today, update here once real per-step copy exists.

## Animation approach

- `.reveal` elements fade/slide in once via `IntersectionObserver`
  (see `js/main.js`). Cheap, no library. Used on the intro card and
  each manual step.
- Respects `prefers-reduced-motion`.

## Running locally

Just open `index.html` in a browser, or serve it:

```
python3 -m http.server 8000
```

## Deploying to GitHub Pages

Once this is merged to `main`:

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Save — the site will publish at `https://<user>.github.io/ten-grand/`

GitHub Pages builds this repo with Jekyll automatically (no `.nojekyll`,
no custom Actions workflow needed) — see the Transmissions section below.

## Transmissions (Jekyll-powered archive)

`/transmissions/` is a Jekyll blog/archive, not a static page:

```
_config.yml               Site config, baseurl, post permalinks
_includes/nav.html          Shared nav, reused by every page
_includes/site-footer.html  Shared footer
_layouts/transmission.html  Layout for a single transmission's page
transmissions.html         The archive page (filters + featured + grid)
_posts/YYYY-MM-DD-slug.md   One file per transmission
css/transmissions.css      Styles for the archive/post pages only
js/transmissions.js        Vanilla JS client-side filtering (pillar/series/search)
```

To add a real transmission, drop a new file in `_posts/` following the
`YYYY-MM-DD-slug.md` naming convention, with front matter like:

```yaml
---
layout: transmission
title: "Post Title"
date: 2026-09-08
series: "The Grand Ten"   # optional
format: "Essay"
pillars:
  - Technology
  - Entertainment
featured_image: "/assets/images/example.jpg"
excerpt: "Short description of the transmission."
featured: false
---
```

The 3 posts currently in `_posts/` are sample content (`sample: true`,
tagged with a visible "SAMPLE" badge) — replace or remove them once real
transmissions are ready. `index.html` itself now has empty Jekyll front
matter (`---\n---`) so it can use the shared nav/footer includes; its
markup and behavior are otherwise unchanged.
