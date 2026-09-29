#!/usr/bin/env python3
"""Turn the artist's car SVGs into inline <symbol>s for the highway.

    NODE_PATH=/opt/node22/lib/node_modules python3 tools/build_cars.py

Rewrites _includes/highway-svg.html (the symbols) and index.html (the car
instances), then prints the geometry css/style.css needs.

Why symbols rather than background images. The cars used to be greyscale
PNGs: colour type 4, grey + alpha, so there was no channel to put a red tail
light in, and scaling a bitmap resamples it, which is the jitter. Vector
fixes both. There are fourteen instances of six drawings (two variants per
lane), so each drawing becomes one <symbol> in the shared defs and each
instance a two-tag <use>; inlining the art fourteen times would add far more
than that to the page.

Per file it crops the viewBox to the drawing's own ink -- so the symbol has
no padding and keeps the aspect the placement percentages were built for --
resolves every shape's paint from that file's own <style> and writes it as
attributes, then drops the stylesheet, because an inline svg's <style> is not
scoped to it and a bare .st0 would repaint the other inline SVGs on this
page. Tail lights are repainted LIGHT_COLOUR with translucent halos stacked
behind them, the plate bezel is repainted BEZEL, and the bodywork is emitted
before the lamps so the lamps sit on top of it.

Nothing here trusts the class numbering, the group names, or a fixed shape
count, because the six exports disagree on all three: some pre-colour their
lights white, some leave them red; the plate bezel is a fill in one drawing
and a bare stroke in the next; one taillight is a single rect, the next is a
housing-plus-lens pair, the next is a segmented light bar. What they agree on
is paint (the bezel is unfilled and encloses the white face; a lamp is red)
and adjacency (a housing and its lens touch; a light bar's segments touch),
so detection goes by those instead.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art' / 'cars'
SVG_INC = ROOT / '_includes' / 'highway-svg.html'
HTML = ROOT / 'index.html'
MEASURE = ROOT / 'tools' / 'measure_cars.js'

# Two hand-drawn variants per lane, so consecutive cars in the same lane
# don't repeat the same model. LANES maps each file back to its lane.
CARS = ['left-1', 'left-2', 'centre-1', 'centre-2', 'right-1', 'right-2']
LANES = {name: name.split('-')[0] for name in CARS}
LANE_COUNTS = {'left': 5, 'centre': 5, 'right': 4}   # instances per lane in index.html

# Two variants share one lane's CSS box, sized for the closer-to-square of
# the two -- a low, wide car (a sports car) fills most of that box's width,
# but a boxier one (the jeep) only reaches it at the same height, since
# <use> fits by "meet" and only the narrower dimension grows to match. Eyed
# against each lane's other variant, not derived from any measurement.
SIZE_ADJUST = {'left-1': 1.12, 'left-2': 0.92, 'right-2': 1.08}

# Two plate names per model, chosen by the site owner one car at a time and
# cycled across that model's own occurrences in its lane (independently of
# the other model sharing the lane, so an odd instance count just repeats
# the pair rather than needing a third name). A model not listed here yet
# keeps whatever text is already sitting in index.html.
PLATE_NAMES = {'left-1': ['D3SIGNR', 'PUBLISHR'], 'left-2': ['WRITER', 'DIRECTOR'],
                'centre-1': ['ARTIST', 'CREATOR'], 'centre-2': ['PHOTGRAPHR', 'PRODUCER'],
                'right-2': ['VENUE', 'MANUFACTR'], 'right-1': ['STYLIST', 'INVESTOR']}

LIGHT_COLOUR = '#ff003d'   # the brighter of the two reds across the exports
BEZEL = '#141414'          # the page background

# Translucent copies behind each lamp, (units to inflate, opacity), painted
# largest first. Plain geometry rather than a blur filter: fourteen cars
# animate their scale continuously and a filter would re-rasterise per frame.
GLOW = [(9.0, 0.22), (5.0, 0.36), (2.0, 0.56)]

# Label inset inside the plate's white face: enough to clear a bolt hole
# (its centre inset plus its radius) with a little air after it.
BOLT_CLEARANCE = 3.5
LABEL_INSET_Y = 5.0

# Fallback only, for a model with no PLATE_NAMES entry (or a word
# measure_cars.js wasn't asked to measure): a flat per-character estimate,
# less accurate than the real measurement every named model's own longest
# word gets (see PLATE_FILL_TARGET below) since real monospace advance
# isn't perfectly uniform letter to letter.
EM_PER_CHAR = 0.623
LONGEST_LABEL = 'PHOTOGRAPHR'

# Each lane's own share of .distance__visual's width and height, from
# .highway__car--LANE{width:...%;height:...%} in css/style.css.
# .highway__plate's other geometry (left/top/width/height) is a percentage
# of the car's own box, but its font-size is set in cqw, which sizes
# against .distance__visual (the query container) instead -- so turning a
# label's target width in "percent of this car" into a font-size needs the
# car's own share of the container folded in, or it renders many times too
# large. The height figures serve a second purpose below: computing each
# lane box's own aspect ratio, fixed regardless of viewport width since
# .distance__visual has no aspect-ratio of its own -- its height instead
# comes from the fixed-aspect background scene SVG sized to 100% width, so
# both these percentages scale together and their ratio never changes.
LANE_WIDTH_PCT = {'centre': 61.0573, 'left': 31.3222, 'right': 31.0767}
LANE_HEIGHT_PCT = {'centre': 33.3225, 'left': 13.5068, 'right': 13.4221}

# How much of the label box a car's own longest assigned name should fill,
# once sized from its real measured width -- comfortable margin on every
# side rather than edge to edge.
PLATE_FILL_TARGET = 0.90

MARK = ('<!-- car symbols: generated by tools/build_cars.py, do not hand-edit -->',
        '<!-- end car symbols -->')

SHAPE = r'<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?)/?>'


def add_drive_delays(html):
    """Expose each generated car's drive delay to the redraw script."""
    car_open = re.compile(
        r'<div class="highway__car highway__car--(centre|left|right)"'
        r'([^>]*style=")([^"]*)(">)')
    def delay_rewrite(m):
        # Old sampled fade values override the frame-driven opacity rule.
        # Cars now stay opaque; only the separate lamp glow is translucent.
        style = re.sub(r'opacity:[\d.]+;?', '', m.group(3))
        if '--drive-delay:' not in style:
            delay = re.search(r'animation-delay:(-?[\d.]+s)', style)
            assert delay, 'car is missing its drive animation delay'
            style = '--drive-delay:%s;%s' % (delay.group(1), style)
        return ('<div class="highway__car highway__car--%s"%s%s%s'
                % (m.group(1), m.group(2), style, m.group(4)))
    html, matched = car_open.subn(delay_rewrite, html)
    assert matched == 14, 'found %d cars, expected 14' % matched

    # Remove the wrapper used by the superseded early-fade experiment.
    html = re.sub(r'<div class="highway__fade">(.*?)</div>(</div></div>)',
                  r'\1\2', html)
    assert 'class="highway__fade"' not in html
    return html


def measure():
    """Ink box, plate geometry, every shape's box, and (under '_labelWidth')
    the real rendered width-per-font-size-px of every distinct plate word,
    in each drawing's own user units."""
    labels = sorted({n for names in PLATE_NAMES.values() for n in names})
    env = dict(os.environ, PLATE_LABELS=json.dumps(labels))
    r = subprocess.run(['node', str(MEASURE)], capture_output=True, text=True, env=env)
    if r.returncode:
        raise SystemExit('tools/measure_cars.js failed:\n' + (r.stderr or r.stdout))
    return json.loads(r.stdout)


def parse_style(svg):
    """{class: {property: value}} from the file's own <style> block."""
    m = re.search(r'<style>(.*?)</style>', svg, re.S)
    out = {}
    if not m:
        return out
    for sel, decls in re.findall(r'([^{}]+)\{([^{}]*)\}', m.group(1)):
        d = {}
        for part in decls.split(';'):
            if ':' in part:
                k, v = part.split(':', 1)
                d[k.strip()] = v.strip()
        for cls in re.findall(r'\.([\w-]+)', sel):
            out.setdefault(cls, {}).update(d)     # source order, later wins
    return out


def light_spans(svg):
    """Character ranges of each <g id="*-lights"> block."""
    spans = []
    for m in re.finditer(r'<g[^>]*\bid="[^"]*-lights"[^>]*>', svg):
        depth, i = 0, m.start()
        for t in re.finditer(r'<g\b[^>]*?(/?)>|</g>', svg[i:]):
            if t.group(0) == '</g>':
                depth -= 1
                if depth == 0:
                    spans.append((i, i + t.end()))
                    break
            elif t.group(1) != '/':
                depth += 1
    return spans


def convert(name, shape_boxes):
    """Body shapes (paint resolved, ready to emit) and lamp shapes paired
    with their measured box, in document order."""
    svg = (ART / (name + '.svg')).read_text()
    styles, spans = parse_style(svg), light_spans(svg)
    body, lamps = [], []
    for i, m in enumerate(re.finditer(SHAPE, svg)):
        tag, attrs = m.group(1), dict(re.findall(r'([\w:-]+)\s*=\s*"([^"]*)"', m.group(2)))
        paint = {}
        for cls in attrs.pop('class', '').split():
            paint.update(styles.get(cls, {}))
        fill = paint.get('fill', '').strip().lower()
        # A lamp is inside a named lights group, painted a #ff00XX red (the
        # placeholder-style exports), or painted the literal keyword "red"
        # (the real exports, which write their taillights that way).
        is_lamp = any(a <= m.start() < b for a, b in spans) or \
            bool(re.fullmatch(r'#ff00[0-9a-f]{2}', fill, re.I)) or fill == 'red'
        if not paint:
            # No class matched: the shape's paint was left at the SVG/browser
            # default (black) rather than declared, which two of the six
            # exports do for ordinary body panels. Default it to the page
            # background instead of shipping literal black.
            paint['fill'] = BEZEL
        elif fill == '#0c0c0c':
            paint['fill'] = BEZEL
        if is_lamp:
            paint = {'fill': LIGHT_COLOUR}
        el = '<%s %s %s/>' % (tag,
                              ' '.join('%s="%s"' % kv for kv in attrs.items()),
                              ' '.join('%s="%s"' % kv for kv in sorted(paint.items())))
        el = re.sub(r'\s+', ' ', el).replace(' /', '/')
        box = tuple(shape_boxes[i]) if i < len(shape_boxes) else None
        (lamps if is_lamp else body).append((el, box))
    return body, lamps


def cluster_lamps(lamps):
    """Group lamp shapes whose boxes touch or overlap into logical lamp
    units -- a housing+lens pair, a segmented light bar -- so each becomes
    one glow instead of one glow per shape. Returns a list of (box, members)
    where box is the (x0,y0,x1,y1) union and members is the (el, box) lamp
    shapes that made it up, kept around so the glow can be drawn to their
    own outlines instead of the union's bounding rectangle."""
    groups = []  # each: [x0, y0, x1, y1, members]
    for item in lamps:
        _, box = item
        if box is None:
            continue
        x, y, w, h = box
        x0, y0, x1, y1 = x - 1, y - 1, x + w + 1, y + h + 1
        hit = [g for g in groups
               if not (x1 < g[0] or x0 > g[2] or y1 < g[1] or y0 > g[3])]
        for g in hit:
            groups.remove(g)
        nx0 = min([x] + [g[0] for g in hit])
        ny0 = min([y] + [g[1] for g in hit])
        nx1 = max([x + w] + [g[2] for g in hit])
        ny1 = max([y + h] + [g[3] for g in hit])
        members = [item]
        for g in hit:
            members += g[4]
        groups.append([nx0, ny0, nx1, ny1, members])
    return [((g[0], g[1], g[2], g[3]), g[4]) for g in groups]


def _contained_frac(box, cluster):
    """What fraction of box's own area falls inside cluster."""
    bx, by, bw, bh = box
    x0, y0, x1, y1 = cluster
    iw = max(0.0, min(bx + bw, x1) - max(bx, x0))
    ih = max(0.0, min(by + bh, y1) - max(by, y0))
    area = bw * bh
    return (iw * ih) / area if area else 0.0


def split_overlay(body, clusters):
    """Body shapes drawn on top of a lamp -- a housing rim, a reflector bar
    -- almost entirely inside one lamp cluster's box. The artist draws
    these over the light; convert() has already bucketed them into body
    purely by paint, so left alone they'd render before the glow and the
    lamp fill both, burying the accent under the light it frames. Two
    guards keep this from sweeping up ordinary bodywork that merely grazes
    a cluster's box: it must not be painted the plain body-panel colour --
    an accent is always some other paint (a stroke outline, or the bar's
    own off-white fill), where a fender or door seam left at the panel
    default never is; and it must be almost fully (>=90%) inside the
    cluster, not just overlapping it, which is what actually separates a
    rim or bar sized to the lamp from a much larger panel that happens to
    pass nearby."""
    main, overlay = [], []
    for el, box in body:
        is_overlay = (box and ('fill="%s"' % BEZEL) not in el and
                      any(_contained_frac(box, c) >= 0.9 for c in clusters))
        (overlay if is_overlay else main).append((el, box))
    return main, overlay


def _glow_stroke(el, width, opacity):
    """A lamp shape's own geometry, repainted as a thick round-jointed
    outline instead of its fill -- stroke straddles the shape's edge, so a
    width of 2x the wanted bleed pushes color that far past the actual
    silhouette while the same amount lands back inside it, where the lamp's
    own solid fill (drawn afterwards) covers it regardless."""
    tag, attrs = re.match(r'<(\w+)\s+(.*?)\s*/>', el).groups()
    attrs = re.sub(r'\s*\bid="[^"]*"', '', attrs)
    attrs = re.sub(r'\s*\bfill="[^"]*"', '', attrs)
    return ('<%s %s fill="none" stroke="%s" stroke-width="%.2f" '
            'stroke-linejoin="round" stroke-linecap="round" opacity="%.2f"/>'
            % (tag, attrs, LIGHT_COLOUR, width, opacity))


def halos(clusters):
    """One glow per lamp shape, not per cluster -- stroking each shape's own
    outline (see _glow_stroke) instead of inflating the cluster's bounding
    box, so an angled or wedge-shaped lamp gets a halo that hugs its actual
    silhouette rather than a rectangle sized to its widest and tallest
    points. Layered widest/faintest first, across every member, so the
    steps still stack the same way a single shape's would."""
    out = []
    for _, members in clusters:
        for d, o in GLOW:
            for el, _ in members:
                out.append(_glow_stroke(el, 2 * d, o))
    return out


def assign_car_variants(html, report):
    """Point each of the 14 car instances at one of its lane's two drawings,
    alternating in document order, and inject that variant's own plate
    geometry as an inline style -- the lane-level CSS rule can't be correct
    for two differently-proportioned models sharing a lane. Also relabels
    the plate for any model listed in PLATE_NAMES, cycling that model's own
    two names across its own occurrences."""
    variants = {}
    for name in CARS:
        variants.setdefault(LANES[name], []).append(name)

    car_re = re.compile(
        r'(<div class="highway__car highway__car--(centre|left|right)"[^>]*>'
        r'<div class="highway__bob" style=")([^"]*)(">)'
        r'<svg class="highway__car-art" aria-hidden="true">'
        r'<use href="#hw-car-([\w-]+)"/></svg>'
        r'<span class="highway__plate"(?: style="[^"]*")?>(<span[^>]*>[A-Z0-9]+</span>)</span>'
        r'(</div></div>)')

    seen, seen_variant = {}, {}
    def rewrite(m):
        lane = m.group(2)
        vs = variants[lane]
        variant = vs[seen.get(lane, 0) % len(vs)]
        seen[lane] = seen.get(lane, 0) + 1
        r = report[variant]
        style = ('left:%.3f%%;top:%.3f%%;width:%.3f%%;height:%.3f%%;font-size:%.4fcqw'
                 % (r['left'], r['top'], r['width'], r['height'], r['font_units']))
        # Strip any --car-scale this same rewrite left behind on a previous
        # run, so re-running the build stays idempotent instead of piling
        # up a duplicate declaration on every pass.
        prior_style = re.sub(r';?--car-scale:[^;]*;?', '', m.group(3))
        bob_style = '%s;--car-scale:%.4f;' % (prior_style, SIZE_ADJUST.get(variant, 1.0))
        names = PLATE_NAMES.get(variant)
        if names:
            i = seen_variant.get(variant, 0)
            seen_variant[variant] = i + 1
            plate = '<span>%s</span>' % names[i % len(names)]
        else:
            plate = m.group(6)
        word = re.search(r'>([A-Z0-9]+)</span>', plate).group(1)
        style = re.sub(r'font-size:[^;]+', 'font-size:%.4fcqw' % r['fonts'].get(word, r['font_units']), style)
        return ('%s%s%s<svg class="highway__car-art" aria-hidden="true">'
                '<use href="#hw-car-%s"/></svg>'
                '<span class="highway__plate" style="%s">%s</span>%s'
                % (m.group(1), bob_style, m.group(4), variant, style, plate, m.group(7)))

    html, n = car_re.subn(rewrite, html)
    assert n == 14, 'rewrote %d car instances, expected 14' % n
    for lane, count in LANE_COUNTS.items():
        assert seen.get(lane) == count, \
            'lane %s: rewrote %d instances, expected %d' % (lane, seen.get(lane, 0), count)
    return html


def main():
    if '--instances-only' in sys.argv:
        HTML.write_text(add_drive_delays(HTML.read_text()))
        print('  drive delays updated: 14')
        return 0

    geo = measure()
    blocks, report = [], {}
    for name in CARS:
        assert geo[name]['face'], '%s: no plate face detected' % name
        body, lamps = convert(name, geo[name]['shapeBoxes'])
        clusters = cluster_lamps(lamps)
        assert len(clusters) >= 2 and len(clusters) % 2 == 0, \
            '%s: expected an even number (>=2) of lamp clusters, found %d' % (name, len(clusters))
        body, overlay = split_overlay(body, [box for box, _ in clusters])
        g = halos(clusters)
        vb = geo[name]['ink']
        parts = ['  <symbol id="hw-car-%s" viewBox="%g %g %g %g">' % ((name,) + tuple(vb))]
        parts += ['    ' + e for e, _ in body] + ['    ' + e for e in g] + \
                 ['    ' + e for e, _ in lamps] + ['    ' + e for e, _ in overlay]
        parts.append('  </symbol>')
        blocks.append('\n'.join(parts))

        # Use the actual white face, with room for the corner bolts.
        fx, fy, fw, fh = geo[name]['face']
        inset = geo[name]['boltInset'] + geo[name]['boltRadius'] + BOLT_CLEARANCE
        lx, ly = fx + inset, fy + LABEL_INSET_Y
        lw, lh = fw - 2 * inset, fh - 2 * LABEL_INSET_Y
        lane = LANES[name]
        # CSS width and height percentages have different reference lengths.
        # Match SVG's xMidYMid meet transform in both dimensions.
        stage_aspect = 1272.6 / 1761.4
        box_aspect = LANE_WIDTH_PCT[lane] / LANE_HEIGHT_PCT[lane] * stage_aspect
        symbol_aspect = vb[2] / vb[3]
        x_fraction = min(1, symbol_aspect / box_aspect)
        y_fraction = min(1, box_aspect / symbol_aspect)
        width = lw / vb[2] * x_fraction
        height = lh / vb[3] * y_fraction
        names = PLATE_NAMES.get(name, [LONGEST_LABEL])
        fonts = {}
        for word in names:
            em_width = geo['_labelWidth'].get(word, len(word) * EM_PER_CHAR)
            fonts[word] = min(width * LANE_WIDTH_PCT[lane] / em_width,
                              height * LANE_HEIGHT_PCT[lane] / stage_aspect) * PLATE_FILL_TARGET
        report[name] = dict(
            body=len(body), lamps=len(lamps), clusters=len(clusters), halos=len(g), vb=vb,
            left=((1 - x_fraction) / 2 + (lx - vb[0]) / vb[2] * x_fraction) * 100,
            top=((1 - y_fraction) / 2 + (ly - vb[1]) / vb[3] * y_fraction) * 100,
            width=width * 100, height=height * 100,
            font_units=min(fonts.values()), fonts=fonts)

    # --- symbols into the highway include ---
    doc = SVG_INC.read_text()
    new = MARK[0] + '\n' + '\n'.join(blocks) + '\n  ' + MARK[1]
    if MARK[0] in doc:
        doc = re.sub(re.escape(MARK[0]) + r'.*?' + re.escape(MARK[1]), new, doc, flags=re.S)
    else:
        i = doc.index('<defs>') + len('<defs>')
        doc = doc[:i] + '\n  ' + new + '\n  ' + doc[i:]
    SVG_INC.write_text(doc)

    # --- instances: assign each of the 14 to one of its lane's 2 variants ---
    html = HTML.read_text()
    html = assign_car_variants(html, report)
    HTML.write_text(add_drive_delays(html))

    for name in CARS:
        r = report[name]
        print('  %-9s %2d body + %2d lamps (%d clusters) + %2d halos   viewBox %g %g %g %g'
              % (name, r['body'], r['lamps'], r['clusters'], r['halos'], *r['vb']))
    print('\n  --- per-instance plate geometry (now inlined, not in css/style.css) ---')
    for name in CARS:
        r = report[name]
        print('  %-9s left:%.3f%%;top:%.3f%%;width:%.3f%%;height:%.3f%%   '
              'font %.4f cqw' % (name, r['left'], r['top'], r['width'],
                                 r['height'], r['font_units']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
