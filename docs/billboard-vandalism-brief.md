# Billboards: slogan + vandalism artwork

How the six billboards in the "Different Roads" section (`#middle-path`
in `index.html`) get their artwork. Everything here is measured from the
repo as it stands.

## The job

Each billboard shows a slogan. Tapping it swaps the copy underneath for
a counter-argument and reveals **graffiti defacing the slogan** — a word
crossed out, a scrawl added, a question mark.

Billboard 1 (`KEEP THE MONEY`) is done and is the reference
implementation. The other five still use HTML text plus a dashed
placeholder. All six are driven from the artist's files, so board 1 is
rebuilt from its file too whenever the art changes.

## The decision already made (do not re-litigate)

The marks have to land in **exact positions relative to the words**.
That forces one conclusion:

**The slogan and the vandalism live in the same SVG, on one artboard.**

The slogan was previously HTML text at `clamp(0.7rem, 3.2vw, 1.1rem)`,
so it reflowed and rescaled with the viewport independently of any
overlay — `THE BEST IN THE BUSINESS` is two lines on a phone and one on
a wider screen. Marks drawn against it in a separate coordinate system
drift off the words. One SVG, one coordinate space, alignment guaranteed
by construction.

The corollary: **copy changes become redraws.** Once a slogan is
outlined art it is no longer editable in `index.html`.

## What the artist supplies

One SVG per billboard, at `art/billboards/<slug>.svg`:

| # | file | aria-label |
|---|---|---|
| 1 | `art/billboards/keep-the-money.svg` | KEEP THE MONEY |
| 2 | `art/billboards/call-the-shots.svg` | CALL THE SHOTS |
| 3 | `art/billboards/no-more-gatekeepers.svg` | NO MORE GATEKEEPERS |
| 4 | `art/billboards/the-biggest-budgets.svg` | THE BIGGEST BUDGETS |
| 5 | `art/billboards/the-best-in-the-business.svg` | THE BEST IN THE BUSINESS |
| 6 | `art/billboards/the-world-is-watching.svg` | THE WORLD IS WATCHING |

Each file:

- **Artboard 895.3 × 325.8** (aspect 2.748:1). This is the sign face's
  own box: `assets/images/billboard-frame.svg` has
  `viewBox="0 0 1223.79 832.19"` and the panel sits at left 13.7%,
  right 13.2%, top 18.4%, bottom 42.4% of it — x 167.7..1062.3,
  y 153.1..479.3. `.billboard__board` is positioned onto that same rect,
  so an artboard of these proportions fills it with no letterboxing.
  The builder rejects anything more than 3% off this aspect.
- **One top-level group for the slogan**, words with **Create Outlines**
  applied and **no fill** on it (Illustrator's default, exported with no
  `fill` attribute). The builder finds the slogan by looking for the one
  unpainted group.
- **One top-level group per graffiti mark**, each painted via the
  export's own `.st0`-style class. Separate groups, not one merged
  group — that is what lets them appear in sequence.
- **Outlines on the graffiti too.** The marks come from a display font
  (`Walnut-Regular`), which is not loaded on the site, so live `<text>`
  renders in a fallback face. Worst case in board 1: the strike-through
  bar is the letter *i* scaled to 12.9% width and rotated 88°, which in
  any other font is a completely different shape.

Slogan font is **Inter Bold (700)**, all caps, default tracking,
imported in `css/style.css:8` from Google Fonts. Note the CSS fallback
is `-apple-system`, so a phone with the font request blocked renders San
Francisco — match Inter itself, not what the phone shows.

## Building

```bash
python3 tools/build_billboards.py          # all six
python3 tools/build_billboards.py 1 4      # just boards 1 and 4
```

It rewrites the `.billboard__board` block of each billboard in
`index.html` in place and is idempotent — re-run it any time the artist
re-exports. Files that are missing or malformed are reported and skipped,
leaving that billboard as it was, and the exit status is non-zero. It
does not touch the artist's files.

Per billboard it emits:

```html
<svg class="billboard__art" viewBox="0 0 895.3 325.8"
     role="img" aria-label="KEEP THE MONEY">
  <g class="billboard__slogan" fill="currentColor"> … </g>
  <g class="billboard__mark billboard__mark--1" fill="#e42320"> … </g>
  <g class="billboard__mark billboard__mark--2" fill="#e42320"> … </g>
</svg>
```

- slogan repainted `currentColor`, so it follows the page's text colour
- marks repainted `MARK_COLOUR` (`#e42320`) — the export's `red` is
  pure `#f00`, which is harsh on this background
- the export's `<style>` block **dropped** and every fill inlined. An
  inline `<svg>`'s stylesheet is **not scoped to it**: a bare
  `.st0 { fill: red }` applies to the whole document, and this page
  carries several other inline SVGs. Same for ids — they share the
  page's id space.
- `role="img"` + `aria-label`, because the words are now art and would
  otherwise be invisible to screen readers

Reveal order is document order, which in an Illustrator export is
**bottom layer first**. To override it, list the group ids in
`BILLBOARDS[n]['marks']` in `tools/build_billboards.py` — board 1 does
this to fire strike-through → WHAT → question mark.

## The reveal

In `css/style.css`, under `.billboard__art`:

The marks are **filled letterforms, not strokes**, so
`stroke-dasharray` / `stroke-dashoffset` draw-on is not available for
this construction. They slap on instead: `billboardSlap` scales each
mark down from a 1.4× overshoot with a slight rotation, about its own
centre (`transform-box: fill-box` — without it they scale about the
whole artboard and swing in from off-panel). `.billboard__mark--1..--6`
stagger it on a 0.14s beat.

The whole animation sits inside
`@media (prefers-reduced-motion: no-preference)`, and the base state is
the **finished, defaced** board — reduced motion gets the punchline
rather than a blank panel. `animation-fill-mode: backwards` holds each
mark hidden through its delay, otherwise the plain opacity transition
underneath fades them all in at once.

## Current state

| what | where |
|---|---|
| markup, 6 × `.billboard` | `index.html`, from ~line 62 |
| artist's source art | `art/billboards/*.svg` |
| builder | `tools/build_billboards.py` |
| frame art (`<img>`, structure only) | `assets/images/billboard-frame.svg` |
| panel box over the frame | `.billboard__board`, `css/style.css` |
| slogan + marks styling / reveal | `.billboard__art` onward, `css/style.css` |
| HTML-text fallback, still used by boards 2–6 | `.billboard__headline`, `.billboard__vandalism` |
| toggle behaviour | `initBillboards()` in `js/main.js` |

Each `.billboard` carries `data-alt-title` / `data-alt-body`; tapping
swaps the copy below and toggles `.is-active` on the billboard.

**Once all six are converted**, `.billboard__headline` and
`.billboard__vandalism` are dead CSS — delete both rules and the
`.billboard.is-active .billboard__vandalism` rule with them.

## Things in this repo that will bite

- **`initBillboards()` measures and reserves row heights on load** so
  toggling never shifts the page. `.billboard__art` is
  `position: absolute; inset: 0` precisely so it does not feed into that
  measurement. If you change what is inside `.billboard__graphic`,
  re-check the section's height is identical before and after a toggle.
- **Safari and percentage heights on SVG.** `.billboard__art` is
  absolutely positioned rather than `width/height: 100%` because Safari
  will not resolve a percentage height on an `<svg>` against a box it is
  still laying out — it falls back to the intrinsic 300×150 and
  letterboxes. This already bit the route artwork; Chromium resolves it
  fine, so local measurement will not catch it.
- **The slogan scales with the board, not the viewport.** The old
  `clamp()` had an 11.2px floor; drawn into the SVG there is no floor.
  On a 393px viewport the board renders 117 × 43px, which puts the cap
  height around 8.7px — about what the HTML text gave, but small. If
  the type needs to be bigger the fix is the column layout, not the
  artwork.
- **`#middle-path`, not `#dilemma`.** The section id does not match the
  CSS's `.dilemma__*` class names.

## Build and verify locally

Jekyll, deployed via GitHub Pages from `main`.

```bash
cd /path/to/ten-grand
mv Gemfile /tmp/Gemfile.bak          # the Gemfile breaks the sandboxed build
export PATH="$HOME/.rbenv/bin:$PATH" && eval "$(rbenv init -)" && rbenv shell 3.3.6
JEKYLL_NO_BUNDLER_REQUIRE=1 jekyll build --destination /tmp/_site
mv /tmp/Gemfile.bak Gemfile
# serve so the site is reachable at /ten-grand/ (the Pages base path)
mkdir -p /tmp/serve/ten-grand && cp -r /tmp/_site/* /tmp/serve/ten-grand/
cd /tmp/serve && python3 -m http.server 8124
```

Playwright needs `NODE_PATH=/opt/node22/lib/node_modules`. The page sets
`scroll-behavior: smooth` (`css/style.css:41`), so any `scrollIntoView`
in a test needs a settle wait or measurements land mid-scroll.

Check before shipping:

- no horizontal overflow at 320 / 375 / 393 / 430 / 768 / 1024 / 1280 /
  1600 (a 17px overflow at 320 is pre-existing, from the nav — ignore it)
- no console errors beyond the Google Fonts certificate failure, which
  is a sandbox artefact
- toggling a billboard does not change the section's height
- `prefers-reduced-motion: reduce` lands on the defaced state, not a
  blank one
- tap targets stay at least 44px
- a 4× device-scale-factor screenshot of `.billboard__graphic` per
  board, active, to confirm each mark landed on the word it defaces —
  at 117px wide the real rendering is too small to judge by eye

## Workflow

Branch `claude/world-site-scrolly-setup-m2cze7`, squash-merge to `main`,
which triggers the Pages deploy. Deploys run one at a time — if one
hangs, later ones queue behind it and cancelling the stuck run is the
fix.
