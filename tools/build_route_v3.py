#!/usr/bin/env python3
"""Normalize the Impact Path export and build the animated inline route SVG."""

from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "impact-path-3.svg"
IMPORT = Path("/Users/shalainderamus/Desktop/impact-path-3.svg")
OUTPUT = ROOT / "_includes" / "route-svg.html"

# The road-sign artwork the markers are built from (see SIGNS below) --
# a separate export, not part of the Figma "Impact Path" source.
SIGNS_SOURCE = ROOT / "art" / "route-signs.svg"

# route-signs.svg carries its own little stylesheet (classes st0..st20).
# Rather than merge a second <style> block into the output and risk it
# colliding with the rt3-* numbered classes already in play, each class
# is resolved to literal attributes at build time -- same approach the
# hand-authored icons elsewhere on the site use.
SIGN_STYLE = {
    "st10": 'fill="#fff" stroke="#000" stroke-width=".7px" stroke-miterlimit="10"',
    "st12": 'fill="none" stroke="#000" stroke-width="2.9px" stroke-miterlimit="10"',
    "st15": 'fill="#fff"',
    "st16": 'fill="#be2026"',
    "st17": 'fill="#e0da15"',
    "st19": 'fill="#308e31"',
    "st20": 'fill="#d5d519"',
    "st4": 'fill="#000" stroke="#fff" stroke-width=".7px" stroke-miterlimit="10"',
    "st0": 'fill="#060607"',
}


def element(source: str, tag: str, element_id: str) -> str:
    start = source.index(f'<{tag} id="{element_id}"')
    token = re.compile(rf"</?{tag}\b[^>]*>")
    depth = 0
    for match in token.finditer(source, start):
        depth += -1 if match.group().startswith("</") else 1
        if depth == 0:
            return source[start:match.end()]
    raise ValueError(f"Unclosed <{tag}> element: {element_id}")


def inner(markup: str) -> str:
    return markup[markup.index('>') + 1:markup.rindex('</')]


def path_for_class(markup: str, class_name: str) -> str:
    match = re.search(rf'<path class="{class_name}"[^>]*?/>', markup)
    if not match:
        raise ValueError(f"Missing path: {class_name}")
    return match.group(0)


if not SOURCE.exists():
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(IMPORT, SOURCE)

raw = SOURCE.read_text()
defs = inner(element(raw, "defs", "")) if '<defs id=""' in raw else re.search(
    r'<defs>(.*?)</defs>', raw, re.S
).group(1)
defs = re.sub(r'<style>.*?</style>', '', defs, flags=re.S)

route = element(raw, "g", "imagination")
route = re.sub(r'<text\b.*?</text>', '', route, flags=re.S)
road_left = path_for_class(route, "cls-11")
road_right = path_for_class(route, "cls-10")
centre = path_for_class(route, "cls-1")
caps = ''.join(re.findall(r'<path class="cls-2"[^>]*?/>', route))
start_orb = re.search(r'<circle class="cls-13"[^>]*?/>', route).group(0)

globe = element(raw, "g", "outer_globe")

# Marker artwork is a road sign standing at the point on the road it
# marks, not a pin dropped onto it: (translate_x, translate_y, scale)
# place each sign's own bottom-centre (the foot of its post, measured
# from route-signs.svg via getBBox) exactly on (cx, cy), so the sign
# reads as planted at the roadside there. Scale is picked per sign so
# each renders about the same height (~130px at this canvas's scale)
# despite very different native proportions -- the diamond signs are
# tall and narrow, the barricade is short and wide.
SIGNS = [
    ("development", "traffic_sign", "#ff334d", 642.75, 362.98, 387.30, 148.29, 0.4014),
    ("production", "hurdle", "#ffd21f", 291.75, 743.23, 152.40, 262.79, 0.5946),
    ("packaging", "u-turn", "#58de68", 738.80, 1025.37, 465.65, 599.89, 0.4014),
    ("distribution", "narrow_road", "#27bfff", 311.47, 1371.31, 213.25, 805.56, 0.4014),
]


def inline_sign_classes(markup: str) -> str:
    return re.sub(r'class="(st\d+)"', lambda m: SIGN_STYLE[m.group(1)], markup)

id_names = re.findall(r'\bid="([^"]+)"', defs)
for old in sorted(id_names, key=len, reverse=True):
    new = f"rt3-{old}"
    defs = defs.replace(f'id="{old}"', f'id="{new}"')
    defs = defs.replace(f'href="#{old}"', f'href="#{new}"')
    for token in (road_left, road_right, centre, caps, start_orb, globe):
        pass
    raw = raw.replace(f'url(#{old})', f'url(#{new})')

# Pull the prefixed gradient references back from the normalized source.
route = element(raw, "g", "imagination")
route = re.sub(r'<text\b.*?</text>', '', route, flags=re.S)
road_left = path_for_class(route, "cls-11")
road_right = path_for_class(route, "cls-10")
centre = path_for_class(route, "cls-1")
caps = ''.join(re.findall(r'<path class="cls-2"[^>]*?/>', route))
start_orb = re.search(r'<circle class="cls-13"[^>]*?/>', route).group(0)
globe = element(raw, "g", "outer_globe")

centre_d = re.search(r'\bd="([^"]+)"', centre).group(1)
defs += (
    '<linearGradient id="rt3-route-colour" x1="0" y1="160" x2="0" y2="1540" '
    'gradientUnits="userSpaceOnUse">'
    '<stop offset="0" stop-color="#ff334d"/>'
    '<stop offset=".34" stop-color="#ffd21f"/>'
    '<stop offset=".66" stop-color="#58de68"/>'
    '<stop offset="1" stop-color="#27bfff"/>'
    '</linearGradient>'
    '<filter id="rt3-soft-glow" x="-100%" y="-100%" width="300%" height="300%" '
    'color-interpolation-filters="sRGB">'
    '<feGaussianBlur stdDeviation="25"/>'
    '</filter>'
    '<mask id="rt3-route-reveal" maskUnits="userSpaceOnUse" '
    'x="0" y="130" width="1064.05" height="1430">'
    f'<path class="rt3-reveal-mask" pathLength="1000" d="{centre_d}"/>'
    '</mask>'
)

class_map = {f"cls-{i}": f"rt3-{i}" for i in range(1, 20)}


def normalize(markup: str) -> str:
    for old, new in class_map.items():
        markup = re.sub(rf'(?<=class=")([^" ]* )?{re.escape(old)}(?=[ " ])',
                        lambda m: (m.group(1) or '') + new, markup)
        markup = markup.replace(f'class="{old}"', f'class="{new}"')
    return markup


def add_class(markup: str, extra: str) -> str:
    return markup.replace('class="', f'class="{extra} ', 1)


road_left = normalize(road_left)
road_right = normalize(road_right)
centre = normalize(centre)
caps = normalize(caps)
start_orb = add_class(normalize(start_orb), "rt3-start-orb")
start_glow = start_orb.replace('class="rt3-start-orb rt3-13"', 'class="rt3-start-glow"')

base_edges = add_class(road_left, "rt3-road-base") + add_class(road_right, "rt3-road-base")
active_edges = add_class(road_left, "rt3-road-active") + add_class(road_right, "rt3-road-active")
base_centre = add_class(centre, "rt3-centre-base")
active_centre = add_class(centre, "rt3-centre-active")
base_caps = caps.replace('class="', 'class="rt3-centre-cap-base ')
active_caps = caps.replace('class="', 'class="rt3-centre-cap-active ')

globe = normalize(globe).replace('id="outer_globe"', 'id="rt3-impact"')
globe = globe.replace('class="rt3-15"', 'class="rt3-15 rt3-impact-core"', 1)
impact_glow = '<circle class="rt3-impact-glow" cx="478.86" cy="1742.74" r="111.63"/>'

signs_raw = SIGNS_SOURCE.read_text()

marker_markup = []
for name, source_id, colour, cx, cy, tx, ty, scale in SIGNS:
    sign = inline_sign_classes(inner(element(signs_raw, "g", source_id)))
    glow = f'<ellipse class="rt3-marker-glow" cx="{cx}" cy="{cy}" rx="37" ry="23"/>'
    group = (
        f'<g id="rt3-marker-{name}" class="rt3-marker rt3-marker--{name}" '
        f'style="--marker-colour:{colour};--marker-x:{cx}px;--marker-y:{cy}px">'
        f'{glow}'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale})">{sign}</g>'
        '</g>'
    )
    marker_markup.append(group)

svg = (
    '<svg class="route__art" xmlns="http://www.w3.org/2000/svg" '
    'xmlns:xlink="http://www.w3.org/1999/xlink" '
    'viewBox="0 0 1064.05 1954.31" role="img" '
    'aria-label="A winding route carrying an idea through development, production, packaging, and distribution to cultural impact">'
    f'<defs>{defs}</defs>'
    '<g class="rt3-road">'
    f'<g>{base_edges}{base_centre}{base_caps}</g>'
    f'<g class="rt3-lit-route" mask="url(#rt3-route-reveal)">{active_edges}{active_centre}{active_caps}</g>'
    '</g>'
    f'{start_glow}{start_orb}'
    + ''.join(marker_markup)
    + impact_glow + globe
    + '</svg>'
)

OUTPUT.write_text(svg)
print(f"Wrote {OUTPUT.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")
