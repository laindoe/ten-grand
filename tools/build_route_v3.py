#!/usr/bin/env python3
"""Normalize the Impact Path export and build the animated inline route SVG."""

from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "impact-path-3.svg"
IMPORT = Path("/Users/shalainderamus/Desktop/impact-path-3.svg")
OUTPUT = ROOT / "_includes" / "route-svg.html"


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
markers = [
    ("development", "Layer_12", "#ff334d", 642.75, 362.98),
    ("production", "Layer_13", "#ffd21f", 291.75, 743.23),
    ("packaging", "Layer_14", "#58de68", 738.80, 1025.37),
    ("distribution", "Layer_15", "#27bfff", 311.47, 1371.31),
]

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

base_edges = add_class(road_left, "rt3-road-base") + add_class(road_right, "rt3-road-base")
active_edges = add_class(road_left, "rt3-road-active") + add_class(road_right, "rt3-road-active")
base_centre = add_class(centre, "rt3-centre-base")
active_centre = add_class(centre, "rt3-centre-active")
base_caps = caps.replace('class="', 'class="rt3-centre-cap-base ')
active_caps = caps.replace('class="', 'class="rt3-centre-cap-active ')

globe = normalize(globe).replace('id="outer_globe"', 'id="rt3-impact"')
globe = globe.replace('class="rt3-15"', 'class="rt3-15 rt3-impact-core"', 1)

marker_markup = []
for name, source_id, colour, cx, cy in markers:
    group = normalize(element(raw, "g", source_id))
    group = group.replace(
        f'id="{source_id}"',
        f'id="rt3-marker-{name}" class="rt3-marker rt3-marker--{name}" '
        f'style="--marker-colour:{colour};--marker-x:{cx}px;--marker-y:{cy}px"'
    )
    glow = (
        f'<ellipse class="rt3-marker-glow" cx="{cx}" cy="{cy}" '
        'rx="37" ry="23"/>'
    )
    group = group.replace('>', '>' + glow, 1)
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
    f'{start_orb}'
    + ''.join(marker_markup)
    + globe
    + '</svg>'
)

OUTPUT.write_text(svg)
print(f"Wrote {OUTPUT.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")
