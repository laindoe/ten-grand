#!/usr/bin/env python3
"""Generate the "VOICES HEARD" equalizer-bar wordmark as an SVG.

    python3 tools/build_voices_heard_bars.py

Writes assets/images/voices-heard-bars.svg. Rerun after editing the
tunables below (text, colors, bar density, peak height) and bump the
?v= query param on its two <img> references (voices-heard.html,
community-wall.html) so browsers pick up the change.

How it works: renders the text to a high-res alpha mask with DejaVu
Sans Bold, then samples it in thin vertical columns -- each column's
contiguous ink runs become rounded vertical bar segments, so the bars
*are* the letterforms (chunked into a bar rhythm) rather than a
separate decorative wave laid on top. Each bar is then pushed taller
by a sum of a few low-frequency sine waves (an "envelope", so nearby
bars grow and shrink together instead of each bar being independent
noise) plus a little per-bar random jitter, which is what gives it the
spiky audio-spectrum look instead of just tracing the glyph outline.
Empty columns (between letters/words) get a small ambient dot, which
is what gives the ends/gaps their tapering look.
"""
import math
import random
import sys
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
TEXT_WORDS = ["VOICES", "HEARD"]
RENDER_SIZE = 420          # glyph render size (px) -- supersampled, scaled down later
LETTER_GAP = 46            # extra px between letters at render scale
WORD_GAP = 190             # extra px between words at render scale
PAD = 40

BAR_PITCH = 9              # px between bar centers, in FINAL svg units
BAR_WIDTH = 4.4
INK_THRESHOLD = 90
DOT_HEIGHT = 6             # ambient dot height for empty columns, final units
FINAL_SCALE = 0.19         # render-space -> final svg-space

GLOW_STD_DEV = 2.6

# Extra vertical "spectrum peak" push, layered low-frequency sine waves
# plus light per-bar jitter, so bars poke out past the letter's own
# stroke thickness like a real audio-spectrum envelope instead of just
# tracing the glyph outline. Scaled by how much ink the column has, so
# it still reads as the word first and a waveform second.
ENV_AMP = 0.6               # multiple of the column's own ink height
ENV_WAVES = [
    (0.021, 1.0, 0.0),
    (0.047, 0.55, 1.7),
    (0.011, 0.7, 3.1),
]
JITTER_SEED = 7
JITTER_AMOUNT = 0.14        # fraction of ink height, random per bar
DOT_ENV_AMP = 5.5           # extra px (final units) for the gap dots' own taper
MARGIN_PAD = 240            # extra render-space top/bottom room for peaks to grow into

def build_mask():
    font = ImageFont.truetype(FONT_PATH, RENDER_SIZE)
    # Measure each character, lay out manually so we control spacing.
    tmp = Image.new("L", (10, 10))
    d = ImageDraw.Draw(tmp)

    words_glyphs = []
    total_w = 0
    max_top, max_bottom = 0, 0
    for wi, word in enumerate(TEXT_WORDS):
        glyphs = []
        for ch in word:
            bbox = d.textbbox((0, 0), ch, font=font)
            w = d.textlength(ch, font=font)
            glyphs.append((ch, w, bbox))
            total_w += w + LETTER_GAP
            max_bottom = max(max_bottom, bbox[3])
        total_w -= LETTER_GAP  # no trailing gap after last letter of word
        words_glyphs.append(glyphs)
        if wi < len(TEXT_WORDS) - 1:
            total_w += WORD_GAP

    ascent, descent = font.getmetrics()
    canvas_w = int(total_w) + PAD * 2
    canvas_h = ascent + descent + PAD * 2 + MARGIN_PAD * 2
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)

    x = PAD
    baseline_y = PAD + MARGIN_PAD
    for wi, glyphs in enumerate(words_glyphs):
        for ch, w, bbox in glyphs:
            draw.text((x, baseline_y), ch, font=font, fill=255)
            x += w + LETTER_GAP
        x -= LETTER_GAP
        if wi < len(words_glyphs) - 1:
            x += WORD_GAP

    bbox = img.getbbox()
    if bbox:
        left, top, right, bottom = bbox
        top = max(0, top - MARGIN_PAD)
        bottom = min(canvas_h, bottom + MARGIN_PAD)
        img = img.crop((left, top, right, bottom))
    return img


def ink_runs(column_pixels, threshold):
    """Return list of (start, end) inclusive pixel index runs where value>threshold."""
    runs = []
    start = None
    for i, v in enumerate(column_pixels):
        if v > threshold:
            if start is None:
                start = i
        else:
            if start is not None:
                runs.append((start, i - 1))
                start = None
    if start is not None:
        runs.append((start, len(column_pixels) - 1))
    return runs


def envelope(xi):
    """Smooth 0..1-ish low-frequency wave, sampled in render-space x."""
    v = 0.0
    for freq, amp, phase in ENV_WAVES:
        v += amp * math.sin(xi * freq + phase)
    # normalize roughly into 0..1
    total_amp = sum(a for _, a, _ in ENV_WAVES)
    return (v / total_amp + 1) / 2


def main():
    mask = build_mask()
    w, h = mask.size
    pixels = mask.load()
    rng = random.Random(JITTER_SEED)

    render_pitch = BAR_PITCH / FINAL_SCALE
    render_bar_w = BAR_WIDTH / FINAL_SCALE

    bars = []  # ("bar", xc, y0, y1) or ("dot", xc)
    x = render_bar_w / 2
    while x < w:
        xi = int(x)
        col = [pixels[xi, yy] for yy in range(h)]
        runs = ink_runs(col, INK_THRESHOLD)
        env = envelope(xi)
        if runs:
            for (a, b) in runs:
                ink_h = b - a
                jitter = 1 + (rng.random() - 0.5) * 2 * JITTER_AMOUNT
                extra = ink_h * ENV_AMP * env * jitter
                a2 = a - extra / 2
                b2 = b + extra / 2
                bars.append(("bar", x * FINAL_SCALE, a2 * FINAL_SCALE, (b2 + 1) * FINAL_SCALE))
        else:
            bars.append(("dot", x * FINAL_SCALE, env))
        x += render_pitch

    final_w = w * FINAL_SCALE
    final_h = h * FINAL_SCALE
    mid_y = final_h / 2

    svg_parts = []
    svg_parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {final_w:.1f} {final_h:.1f}">')
    svg_parts.append('<defs>')
    svg_parts.append(
        f'<linearGradient id="vhb-grad" x1="0" y1="0" x2="{final_w:.1f}" y2="0" gradientUnits="userSpaceOnUse">'
        '<stop offset="0" stop-color="#00b0e0"/>'
        '<stop offset="0.22" stop-color="#15d6c0"/>'
        '<stop offset="0.42" stop-color="#4fe06a"/>'
        '<stop offset="0.5" stop-color="#e5dc16"/>'
        '<stop offset="0.58" stop-color="#4fe06a"/>'
        '<stop offset="0.78" stop-color="#15d6c0"/>'
        '<stop offset="1" stop-color="#00b0e0"/>'
        '</linearGradient>'
    )
    svg_parts.append(
        f'<filter id="vhb-glow" x="-30%" y="-80%" width="160%" height="260%">'
        f'<feGaussianBlur stdDeviation="{GLOW_STD_DEV}" result="blur"/>'
        '<feMerge>'
        '<feMergeNode in="blur"/>'
        '<feMergeNode in="blur"/>'
        '<feMergeNode in="SourceGraphic"/>'
        '</feMerge>'
        '</filter>'
    )
    svg_parts.append('</defs>')
    svg_parts.append(f'<g filter="url(#vhb-glow)" fill="url(#vhb-grad)">')

    for bar in bars:
        if bar[0] == "dot":
            _, xc, env = bar
            dot_h = DOT_HEIGHT + DOT_ENV_AMP * env
            y0 = mid_y - dot_h / 2
            svg_parts.append(
                f'<rect x="{xc - BAR_WIDTH/2:.2f}" y="{y0:.2f}" width="{BAR_WIDTH:.2f}" '
                f'height="{dot_h:.2f}" rx="{BAR_WIDTH/2:.2f}"/>'
            )
        else:
            _, xc, y0, y1 = bar
            y0 = max(0.0, min(y0, final_h))
            y1 = max(0.0, min(y1, final_h))
            height = max(y1 - y0, BAR_WIDTH)
            svg_parts.append(
                f'<rect x="{xc - BAR_WIDTH/2:.2f}" y="{y0:.2f}" width="{BAR_WIDTH:.2f}" '
                f'height="{height:.2f}" rx="{BAR_WIDTH/2:.2f}"/>'
            )

    svg_parts.append('</g>')
    svg_parts.append('</svg>')

    out_path = sys.argv[1] if len(sys.argv) > 1 else "assets/images/voices-heard-bars.svg"
    with open(out_path, "w") as f:
        f.write("\n".join(svg_parts))
    print(f"wrote {out_path}  size={final_w:.0f}x{final_h:.0f}  bars={len(bars)}")


if __name__ == "__main__":
    main()
