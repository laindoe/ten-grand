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

LIGHT_COLOUR = '#ff003d'   # the brighter of the two reds across the exports
BEZEL = '#141414'          # the page background

# Translucent copies behind each lamp, (units to inflate, opacity), painted
# largest first. Plain geometry rather than a blur filter: fourteen cars
# animate their scale continuously and a filter would re-rasterise per frame.
GLOW = [(14.0, 0.14), (9.0, 0.26), (5.0, 0.42), (2.0, 0.62)]

# Label inset inside the plate's white face: enough to clear a bolt hole
# (its centre inset plus its radius) with a little air after it.
BOLT_CLEARANCE = 3.5
LABEL_INSET_Y = 5.0

# Plate size, as a fraction of each drawing's own ink box, applied the same
# way to all six cars regardless of how big or small that car's own artist
# happened to draw its plate -- the average natural proportion measured
# across the six real exports (widths ranged 22%-34%, heights 10%-15.5%).
# Position still comes from each car's own detected plate location; only the
# size is normalised, per "i want all the license plates to be the same
# size."
PLATE_WIDTH_FRAC = 0.286
PLATE_HEIGHT_FRAC = 0.134

# Rendered width of one monospace character as a fraction of font-size, with
# the -0.02em tracking .highway__plate sets. 0.58 is the measured advance and
# leaves the longest label filling the plate exactly, which is no margin at
# all when the monospace stack resolves to a different face per platform;
# 0.623 holds it at about 93% of the plate.
EM_PER_CHAR = 0.623
LONGEST_LABEL = 'PHOTOGRAPHR'

# The two labels that would not fit are abbreviated rather than shrunk.
ABBREVIATE = {'MANUFACTURER': 'MANUFACTR', 'PHOTOGRAPHER': 'PHOTOGRAPHR'}

# Each lane's own share of .distance__visual's width, from
# .highway__car--LANE{width:...%} in css/style.css. .highway__plate's other
# geometry (left/top/width/height) is a percentage of the car's own box, but
# its font-size is set in cqw, which sizes against .distance__visual (the
# query container) instead -- so turning a label's target width in "percent
# of this car" into a font-size needs the car's own share of the container
# folded in, or it renders many times too large.
LANE_WIDTH_PCT = {'centre': 61.0573, 'left': 31.3222, 'right': 31.0767}

# Matches the previous three cars' shipped font-sizes to within ~1% once the
# cqw conversion above is applied -- EM_PER_CHAR is the bare character
# advance, and real monospace rendering wants a little more room than that.
FONT_SIZE_CORRECTION = 1.09

MARK = ('<!-- car symbols: generated by tools/build_cars.py, do not hand-edit -->',
        '<!-- end car symbols -->')

SHAPE = r'<(path|rect|circle|ellipse|line|polygon|polyline)\b([^>]*?)/?>'


def add_drive_delays(html):
    """Expose each generated car's drive delay to the redraw script."""
    car_open = re.compile(
        r'<div class="highway__car highway__car--(centre|left|right)"'
        r'([^>]*style=")([^"]*)(">)')
    def delay_rewrite(m):
        if '--drive-delay:' in m.group(3):
            return m.group(0)
        delay = re.search(r'animation-delay:(-?[\d.]+s)', m.group(3))
        assert delay, 'car is missing its drive animation delay'
        return ('<div class="highway__car highway__car--%s"%s'
                '--drive-delay:%s;%s%s'
                % (m.group(1), m.group(2), delay.group(1), m.group(3), m.group(4)))
    html, matched = car_open.subn(delay_rewrite, html)
    assert matched == 14, 'found %d cars, expected 14' % matched

    # Remove the wrapper used by the superseded early-fade experiment.
    html = re.sub(r'<div class="highway__fade">(.*?)</div>(</div></div>)',
                  r'\1\2', html)
    assert 'class="highway__fade"' not in html
    return html


def measure():
    """Ink box, plate geometry, and every shape's box, in each drawing's own
    user units."""
    r = subprocess.run(['node', str(MEASURE)], capture_output=True, text=True)
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
    one glow instead of one glow per shape. Returns a list of (x0,y0,x1,y1)
    union boxes."""
    groups = []
    for _, box in lamps:
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
        groups.append((nx0, ny0, nx1, ny1))
    return groups


def halos(clusters):
    out = []
    for x0, y0, x1, y1 in clusters:
        w, h = x1 - x0, y1 - y0
        r = min(w, h) * 0.18
        for d, o in GLOW:
            out.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" '
                       'fill="%s" opacity="%.2f"/>'
                       % (x0 - d, y0 - d, w + 2 * d, h + 2 * d, r + d, LIGHT_COLOUR, o))
    return out


def assign_car_variants(html, report):
    """Point each of the 14 car instances at one of its lane's two drawings,
    alternating in document order, and inject that variant's own plate
    geometry as an inline style -- the lane-level CSS rule can't be correct
    for two differently-proportioned models sharing a lane."""
    variants = {}
    for name in CARS:
        variants.setdefault(LANES[name], []).append(name)

    car_re = re.compile(
        r'(<div class="highway__car highway__car--(centre|left|right)"[^>]*>'
        r'<div class="highway__bob"[^>]*>)'
        r'<svg class="highway__car-art" aria-hidden="true">'
        r'<use href="#hw-car-([\w-]+)"/></svg>'
        r'<span class="highway__plate"(?: style="[^"]*")?>(<span[^>]*>[A-Z]+</span>)</span>'
        r'(</div></div>)')

    seen = {}
    def rewrite(m):
        lane, current = m.group(2), m.group(3)
        vs = variants[lane]
        variant = vs[seen.get(lane, 0) % len(vs)]
        seen[lane] = seen.get(lane, 0) + 1
        r = report[variant]
        style = ('left:%.3f%%;top:%.3f%%;width:%.3f%%;height:%.3f%%;font-size:%.4fcqw'
                 % (r['left'], r['top'], r['width'], r['height'], r['font_units']))
        return ('%s<svg class="highway__car-art" aria-hidden="true">'
                '<use href="#hw-car-%s"/></svg>'
                '<span class="highway__plate" style="%s">%s</span>%s'
                % (m.group(1), variant, style, m.group(4), m.group(5)))

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
        g = halos(clusters)
        vb = geo[name]['ink']
        parts = ['  <symbol id="hw-car-%s" viewBox="%g %g %g %g">' % ((name,) + tuple(vb))]
        parts += ['    ' + e for e, _ in body] + ['    ' + e for e in g] + \
                 ['    ' + e for e, _ in lamps]
        parts.append('  </symbol>')
        blocks.append('\n'.join(parts))

        # Label box: a canonical size (same fraction of every car's own ink
        # box) centred on this car's own detected plate location, inset
        # clear of its bolt holes by that same drawing's own margin.
        fx, fy, fw, fh = geo[name]['face']
        inset_frac = (geo[name]['boltInset'] + geo[name]['boltRadius'] + BOLT_CLEARANCE) / fw
        cx, cy = fx + fw / 2, fy + fh / 2
        pw, ph = vb[2] * PLATE_WIDTH_FRAC, vb[3] * PLATE_HEIGHT_FRAC
        px, py = cx - pw / 2, cy - ph / 2
        inset = pw * inset_frac
        lx, lw = px + inset, pw - 2 * inset
        ly, lh = py + LABEL_INSET_Y, ph - 2 * LABEL_INSET_Y
        font_cqw = ((lw / vb[2]) * LANE_WIDTH_PCT[LANES[name]]
                    / (len(LONGEST_LABEL) * EM_PER_CHAR) * FONT_SIZE_CORRECTION)
        report[name] = dict(
            body=len(body), lamps=len(lamps), clusters=len(clusters), halos=len(g), vb=vb,
            left=(lx - vb[0]) / vb[2] * 100, top=(ly - vb[1]) / vb[3] * 100,
            width=lw / vb[2] * 100, height=lh / vb[3] * 100, font_units=font_cqw)

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
