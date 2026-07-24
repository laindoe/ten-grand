# Ten Grand — Scrollytelling World Site

A plain HTML/CSS/JS scrollytelling site for Ten Grand. No build step —
static files served directly, ready for GitHub Pages.

## Structure

```
index.html          Page markup, all sections
css/style.css        Styles, CSS variables for colors/fonts/spacing
js/main.js           Scroll animations (reveal-on-scroll + scrollytelling)
assets/images/       Exported logo/icon assets go here
assets/fonts/        Any self-hosted font files go here
```

## Sections implemented

1. **Intro** (`#intro`) — nav, wordmark, headline, target icon, explainer
   paragraph. Built from the Figma "intro" frame.
2. **Creative supply chain** (`#supply-chain`) — scrollytelling sequence:
   a sticky card with 5 steps (IDEA → VALIDATION → DEVELOPMENT → LAUNCH →
   IMPACT) that highlight one at a time as you scroll. Currently
   placeholder copy — structure only, mirroring the repeated Figma frames.
3. **Footer / contact** (`#contact`) — logo, email, tagline, social links.

## Known placeholders (TODO before this looks "real")

- **Wordmark logo** ("TEN GRAND / COMPANY") and the small nav **"N" mark**
  are approximated with type/SVG, not the real exported Figma assets.
  Drop real files into `assets/images/` and swap the markup in
  `index.html` (`.intro__logo`, `.nav__logo-mark`) once exported.
- **Fonts**: using Bodoni Moda (display) + Inter (body) as a close visual
  match. Update the `@import` and `--font-display` / `--font-body`
  variables in `css/style.css` if the real typefaces are different.
- **Supply chain section copy/images**: only the first ("intro") section
  content is final; the supply-chain step body copy and the `IMG_3829`
  photo from the Figma file still need to be pulled in.

## Animation approach

- `.reveal` elements fade/slide in once via `IntersectionObserver`
  (see `js/main.js`). Cheap, no library.
- The supply-chain section uses `position: sticky` on the content card
  plus tall (100vh) trigger divs, observed with `IntersectionObserver`
  to swap the active step as you scroll — the classic scrollytelling
  pattern (no Scrollama/GSAP dependency).
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
