#!/usr/bin/env python3
"""Splice the artist's billboard SVGs into index.html.

Each billboard's slogan and its graffiti have to share one coordinate
space, or the marks drift off the words as the type reflows. So the
artist draws both into a single artboard the size of the sign face
(895.3 x 325.8 units, see PANEL below) and this script inlines it.

Usage:
    python3 tools/build_billboards.py            # build every board
    python3 tools/build_billboards.py 1 3        # just boards 1 and 3

Input:  art/billboards/<slug>.svg   (one per entry in BILLBOARDS)
Output: index.html, rewritten in place; run it again any time the
        artist re-exports.

What it expects inside each SVG
-------------------------------
Top-level <g> elements, one per Illustrator layer:

  - exactly one SLOGAN group, holding the words with Create Outlines
    applied and no fill of its own (Illustrator emits these with no
    fill attribute, i.e. default black)
  - one or more MARK groups, the graffiti, each filled via the export's
    own .st0-style class

The slogan is repainted with currentColor so it follows the page's text
colour; the marks are repainted with MARK_COLOUR. The export's <style>
block is dropped and every fill inlined, because an inline <svg>'s
stylesheet is NOT scoped to that svg -- a bare `.st0 { fill: red }`
would repaint the other inline SVGs on this page.

Reveal order is document order, which in an Illustrator export is
bottom layer first. If the marks should appear in some other order,
list their group ids in `marks` for that billboard below.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art' / 'billboards'
HTML = ROOT / 'index.html'

# The sign face drawn inside assets/images/billboard-frame.svg, in that
# file's own units. .billboard__board is positioned onto this same rect
# in css/style.css, so an artboard of these proportions fills it with
# no letterboxing. Keep every export on this artboard.
PANEL = (895.3, 325.8)
PANEL_TOLERANCE = 0.03  # 3% on the aspect ratio

MARK_COLOUR = '#e42320'

# In the same order as the six .billboard blocks in index.html.
# `slug`   - art/billboards/<slug>.svg
# `label`  - the SVG's aria-label; the words are outlined art now, so
#            without this a screen reader gets nothing
# `slogan` - id of the slogan group, or None to auto-detect it as the
#            one group whose paths carry no fill
# `marks`  - ids of the graffiti groups in reveal order, or None for
#            document order
BILLBOARDS = [
    {'slug': 'keep-the-money',        'label': 'KEEP THE MONEY',
     'slogan': None, 'marks': ['cross_out_line', 'what', 'question_mark']},
    {'slug': 'call-the-shots',        'label': 'CALL THE SHOTS',
     'slogan': None, 'marks': ['caret', 'all']},
    {'slug': 'no-more-gatekeepers',   'label': 'NO MORE GATEKEEPERS',
     'slogan': None, 'marks': None},
    {'slug': 'the-biggest-budgets',   'label': 'THE BIGGEST BUDGETS',
     'slogan': 'the_biggest_budgets', 'marks': ['cross_out_line', 'loans']},
    {'slug': 'the-best-in-the-business', 'label': 'THE BEST IN THE BUSINESS',
     'slogan': None, 'marks': None},
    {'slug': 'the-world-is-watching', 'label': 'THE WORLD IS WATCHING',
     'slogan': None, 'marks': None},
]

# css/style.css staggers .billboard__mark--1 .. --MAX_MARKS.
MAX_MARKS = 6

IND = ' ' * 20   # children of <span class="billboard__board">
BOARD_RE = re.compile(
    r'(\n {18}<span class="billboard__board">\n).*?(\n {18}</span>\n)',
    re.S,
)


def top_level_groups(svg):
    """[(id, inner_markup)] for each top-level <g>, in document order."""
    groups, depth, start, gid = [], 0, None, None
    for m in re.finditer(r'<g\b[^>]*?(/?)>|</g>', svg):
        if m.group(0) == '</g>':
            depth -= 1
            if depth == 0:
                groups.append((gid, svg[start:m.start()]))
        elif m.group(1) == '/':
            continue                      # self-closing <g/>, no content
        else:
            if depth == 0:
                idm = re.search(r'\bid="([^"]+)"', m.group(0))
                gid = idm.group(1) if idm else None
                start = m.end()
            depth += 1
    if depth != 0:
        raise SystemExit('unbalanced <g> nesting')
    return groups


def paths_of(markup):
    """[(d, has_own_fill)] for every <path> in a chunk of markup."""
    out = []
    for tag in re.finditer(r'<path\b[^>]*?/?>', markup):
        t = tag.group(0)
        d = re.search(r'\bd="([^"]+)"', t)
        if not d:
            continue
        painted = bool(re.search(r'\b(class|fill)="', t))
        out.append((d.group(1), painted))
    return out


def convert(entry):
    src = ART / (entry['slug'] + '.svg')
    if not src.exists():
        return None, 'missing %s' % src.relative_to(ROOT)

    svg = src.read_text()

    vb = re.search(r'\bviewBox="([\d.\-\s]+)"', svg)
    if not vb:
        return None, 'no viewBox in %s' % src.name
    _, _, vw, vh = [float(n) for n in vb.group(1).split()]
    want, got = PANEL[0] / PANEL[1], vw / vh
    if abs(got - want) / want > PANEL_TOLERANCE:
        return None, ('%s is %g x %g (aspect %.3f); the sign face is %.3f. '
                      'Re-export on a %g x %g artboard or it will letterbox.'
                      % (src.name, vw, vh, got, want, *PANEL))

    groups = top_level_groups(svg)
    if len(groups) < 2:
        return None, '%s has %d top-level group(s); need a slogan plus at ' \
                     'least one mark' % (src.name, len(groups))

    by_id = {gid: markup for gid, markup in groups if gid}

    # The slogan is the group Illustrator left unpainted (default black).
    if entry['slogan']:
        slogan_id = entry['slogan']
        if slogan_id not in by_id:
            return None, '%s has no group id="%s"' % (src.name, slogan_id)
    else:
        bare = [gid for gid, markup in groups
                if not any(painted for _, painted in paths_of(markup))]
        if len(bare) != 1:
            return None, ('%s: expected exactly one unpainted group to use as '
                          'the slogan, found %d (%s). Name it explicitly in '
                          "BILLBOARDS[...]['slogan']."
                          % (src.name, len(bare), ', '.join(map(str, bare))))
        slogan_id = bare[0]

    if entry['marks']:
        missing = [g for g in entry['marks'] if g not in by_id]
        if missing:
            return None, '%s has no group id=%s' % (src.name, missing)
        mark_ids = entry['marks']
    else:
        mark_ids = [gid for gid, _ in groups if gid != slogan_id]

    if not mark_ids:
        return None, '%s has no graffiti groups' % src.name
    if len(mark_ids) > MAX_MARKS:
        return None, ('%s has %d graffiti groups but css/style.css only '
                      'staggers %d -- add more .billboard__mark--N delays'
                      % (src.name, len(mark_ids), MAX_MARKS))

    def emit(markup, ind):
        ds = [d for d, _ in paths_of(markup)]
        if not ds:
            raise SystemExit('%s: empty group' % src.name)
        return '\n'.join('%s<path d="%s" />' % (ind, d) for d in ds)

    out = [
        '%s<svg class="billboard__art" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 %g %g" role="img" aria-label="%s">'
        % (IND, vw, vh, entry['label']),
        '%s  <g class="billboard__slogan" fill="currentColor">' % IND,
        emit(by_id[slogan_id], IND + '    '),
        '%s  </g>' % IND,
    ]
    for n, gid in enumerate(mark_ids, start=1):
        out += [
            '%s  <g class="billboard__mark billboard__mark--%d" fill="%s">'
            % (IND, n, MARK_COLOUR),
            emit(by_id[gid], IND + '    '),
            '%s  </g>' % IND,
        ]
    out.append('%s</svg>' % IND)
    return '\n'.join(out), None


def main(argv):
    wanted = set(int(a) for a in argv) if argv else set(range(1, len(BILLBOARDS) + 1))
    bad = wanted - set(range(1, len(BILLBOARDS) + 1))
    if bad:
        raise SystemExit('no billboard %s (there are %d)'
                         % (sorted(bad), len(BILLBOARDS)))

    html = HTML.read_text()
    boards = list(BOARD_RE.finditer(html))
    if len(boards) != len(BILLBOARDS):
        raise SystemExit('found %d .billboard__board blocks in index.html, '
                         'expected %d' % (len(boards), len(BILLBOARDS)))

    # Right to left, so earlier matches' offsets stay valid.
    built, skipped = [], []
    for i in range(len(BILLBOARDS), 0, -1):
        entry, m = BILLBOARDS[i - 1], boards[i - 1]
        if i not in wanted:
            continue
        art, err = convert(entry)
        if err:
            skipped.append('  %d %-26s %s' % (i, entry['slug'], err))
            continue
        html = html[:m.start()] + m.group(1) + art + m.group(2) + html[m.end():]
        built.append('  %d %-26s ok' % (i, entry['slug']))

    if built:
        HTML.write_text(html)
    for line in sorted(built) + sorted(skipped):
        print(line)
    if not built:
        print('  nothing built; index.html untouched')
    return 1 if skipped else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
