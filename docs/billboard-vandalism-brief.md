# Brief: billboard vandalism effect

Handoff for whoever picks this up next. Everything here is measured from the
repo as it stands, not guessed.

## The job

Six billboards in the "Different Roads" section (`#dilemma`). Each one shows a
slogan. Tapping a billboard swaps the copy underneath it for a counter-argument
and is supposed to reveal **graffiti defacing the slogan**. The graffiti is
currently a dashed placeholder box.

## The decision already made (do not re-litigate)

The vandalism marks have to land in **exact positions relative to the words**
(crossing out a specific word, an arrow at a specific phrase). That forces one
conclusion:

**The slogan and the vandalism must live in the same SVG.**

Right now the slogan is HTML text (`.billboard__headline`) at
`clamp(0.7rem, 3.2vw, 1.1rem)`, so it reflows and rescales with the viewport
independently of any overlay — `THE BEST IN THE BUSINESS` is two lines on a
phone and one line on a wider screen. Marks drawn against it in a separate
coordinate system will drift off the words. One SVG, one coordinate space,
alignment guaranteed by construction.

## What the artist supplies

Six SVGs, one per billboard, each containing two named layers:

- `slogan` — the words, **outlined** (Create Outlines)
- `vandalism` — the marks, **strokes NOT expanded**

Drawn inside a panel of **894.6 × 326.2** units (aspect 2.74:1). That is the
billboard frame's own coordinate space: `billboard-frame.svg` has
`viewBox="0 0 1223.79 832.19"` and the panel sits at left 13.7%, right 13.2%,
top 18.4%, bottom 42.4% of it, which works out to x 167.7..1062.3,
y 153.1..479.3.

Slogan font is **Inter Bold (700)**, all caps, default tracking, centred —
imported in `css/style.css:8` from Google Fonts. Note the CSS fallback is
`-apple-system`, so a phone with the font request blocked renders San
Francisco; match Inter itself, not what the phone shows.

Strokes not expanded because the marks can then be **animated drawing on** with
`stroke-dasharray` / `stroke-dashoffset` — spray marks appearing in sequence
rather than a plain fade. Expanded to filled shapes it is fade-only.

## Current state of the code

| what | where |
|---|---|
| markup, 6 × `.billboard` | `index.html` ~line 62 onward |
| frame art (`<img>`, structure only) | `assets/images/billboard-frame.svg` |
| slogan | `.billboard__headline` span, HTML text |
| placeholder to replace | `.billboard__vandalism` span, `css/style.css:465` |
| panel box over the frame | `.billboard__board`, `css/style.css:438` |
| toggle behaviour | `initBillboards()` in `js/main.js` |

Each `.billboard` carries `data-alt-title` / `data-alt-body`; tapping swaps the
copy below and toggles `.is-active` on the billboard, which currently just
fades the placeholder in.

## Implementation steps

1. **Convert each supplied SVG.** There is a working converter at
   `scratchpad/icons/conv.py` (see the timeline icons, PRs #170–#178 for the
   pattern). It crops the viewBox to the drawing, scales stroke widths, drops
   the `<style>` block and inlines attributes. Reuse it.

2. **Namespace everything.** An inline `<svg>`'s `<style>` is **not** scoped to
   it — bare `.st0` / `.cls-1` selectors apply to the whole document, and this
   page already carries four other inline SVGs. Prefix ids and classes, scope
   the stylesheet under the component's own class. `scratchpad/route/
   build_route.py` has a `namespace()` and `scope()` pair that does this.

3. **Scale the stroke widths.** Illustrator exports these at 0.5–1 unit in a
   300-unit box, which at icon size is a fraction of a pixel and renders
   invisible. Normalise so the heaviest lands on ~1px at the rendered size,
   keeping relative weights. `conv.py` reads the widths off each file's own
   stylesheet rather than assuming a set.

4. **Replace `.billboard__headline`** with the `slogan` layer, and
   `.billboard__vandalism` with the `vandalism` layer, both inside one inline
   SVG positioned in the existing `.billboard__board` box. Add
   `aria-label="<the slogan>"` on the SVG, and `role="img"` — the words are now
   outlined art and would otherwise be invisible to screen readers.

5. **Animate.** `.billboard.is-active` reveals the vandalism. For the draw-on
   effect give each mark `pathLength="1000"`, `stroke-dasharray: 1000`,
   `stroke-dashoffset: 1000` at rest and `0` when active, with staggered
   `transition-delay` or per-mark `animation-delay` so they appear in sequence.
   Put the animation inside `@media (prefers-reduced-motion: no-preference)`
   and make the no-animation base state the finished (defaced) state, so
   reduced-motion users get the end result rather than nothing.

## Things in this repo that will bite

- **`initBillboards()` measures and reserves row heights on load** so toggling
  never shifts the page. If you change what is inside `.billboard__graphic`,
  re-check that logic still measures correctly.
- **Copy changes become redraws.** Once slogans are outlined art they are no
  longer editable in `index.html`. Confirm the six slogans are final first.
- **The slogan will scale with the board, not the viewport.** The current
  `clamp()` has an 11.2px floor; drawn into the SVG there is no floor. Measure
  the rendered px on a 393px viewport and scale the whole billboard if the type
  comes out too small.

## Build and verify locally

Jekyll, deployed via GitHub Pages from `main`.

```bash
cd /path/to/ten-grand
mv Gemfile /tmp/Gemfile.bak          # the Gemfile breaks the sandboxed build
export PATH="$HOME/.rbenv/bin:$PATH" && eval "$(rbenv init -)" && rbenv shell 3.3.6
JEKYLL_NO_BUNDLER_REQUIRE=1 jekyll build --destination /tmp/_site
mv /tmp/Gemfile.bak Gemfile
cd /tmp && python3 -m http.server 8124    # serve /tmp/_site as /ten-grand/
```

Playwright needs `NODE_PATH=/opt/node22/lib/node_modules`.

Check before shipping:

- no horizontal overflow at 320 / 375 / 393 / 430 / 768 / 1024 / 1280 / 1600
  (a 17px overflow at 320 is pre-existing, from the nav — ignore it)
- no console errors beyond the Google Fonts certificate failure, which is a
  sandbox artefact
- toggling a billboard does not change the section's height
- `prefers-reduced-motion: reduce` lands on the defaced state, not a blank one
- tap targets stay at least 44px

## Workflow

Branch `claude/world-site-scrolly-setup-m2cze7`, squash-merge to `main`, which
triggers the Pages deploy. Deploys run one at a time — if one hangs, later ones
queue behind it and cancelling the stuck run is the fix.
