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

`.nojekyll` is included so GitHub Pages serves the files as-is.
