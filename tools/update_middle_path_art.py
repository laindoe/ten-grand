#!/usr/bin/env python3
"""Apply the reusable highway artwork treatment to the Middle Path SVG."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / "_includes" / "middle-path-svg.html"


def element(source: str, tag: str, element_id: str) -> tuple[int, int, str]:
    start = source.index(f'<{tag} id="{element_id}"')
    token = re.compile(rf"</?{tag}\b[^>]*>")
    depth = 0
    for match in token.finditer(source, start):
        depth += -1 if match.group().startswith("</") else 1
        if depth == 0:
            return start, match.end(), source[start:match.end()]
    raise ValueError(f"Unclosed <{tag}> element: {element_id}")


def add_class(markup: str, old: str, new: str) -> str:
    return markup.replace(f'class="{old}"', f'class="{old} {new}"')


source = SVG_PATH.read_text()

# The current highway symbol is defined earlier in the document by the multi-car
# scene. Referencing it keeps the two cars on one source of truth, including the
# red taillights, glow layers, and modern plate face.
replacement = (
    '<svg id="mp-freedom-car" x="432" y="425" width="408" height="308" '
    'viewBox="94.36 33.9 509.38 384.4" preserveAspectRatio="xMidYMid meet" '
    'aria-hidden="true"><use href="#hw-car-centre"/></svg>'
)
if '<g id="mp-freedom-car"' in source:
    start, end, _ = element(source, "g", "mp-freedom-car")
    source = source[:start] + replacement + source[end:]

# Give vegetation dedicated hooks so it can share the highway stroke settings
# without changing unrelated paths that use the SVG exporter's generic classes.
start, end, cacti = element(source, "g", "mp-cacti")
cacti = add_class(cacti, "cls-2", "mp-cactus-outline")
cacti = add_class(cacti, "cls-4", "mp-cactus-rib")
cacti = add_class(cacti, "cls-15", "mp-bush")
source = source[:start] + cacti + source[end:]

SVG_PATH.write_text(source)
