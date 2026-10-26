#!/usr/bin/env python3
"""Generates the app icons (a cyan lightning bolt on a dark tile) into icons/. PLACEHOLDER art until Overclocked gets its own.
Run:  python3 tools/make-icons.py     (needs Pillow; the PNGs are committed, this is just the source)"""
from PIL import Image, ImageDraw

BG = (14, 15, 20)
BOLT = (88, 214, 255)
RIM = (214, 244, 255)
DARK = (34, 52, 70)

def draw(size, safe):
    """safe: fraction of the tile the artwork may use (maskable icons need ~0.62)."""
    S = size * 4
    img = Image.new('RGB', (S, S), BG)
    u = S * safe / 100.0                     # artwork unit: 100 units across the safe area
    ox = oy = S * (1 - safe) / 2

    def P(x, y):
        return (ox + x * u, oy + y * u)

    glow = Image.new('RGB', (S, S), BG)
    gd = ImageDraw.Draw(glow)
    cx, cy = P(50, 50)
    for r, a in ((46, 0.10), (36, 0.16), (26, 0.22)):
        col = tuple(int(BG[i] + (BOLT[i] - BG[i]) * a) for i in range(3))
        gd.ellipse([cx - r * u, cy - r * u, cx + r * u, cy + r * u], fill=col)
    img.paste(glow)
    d = ImageDraw.Draw(img)
    # shadow, bolt, highlight edge
    d.polygon([P(61, 12), P(26, 56), P(46, 56), P(38, 90), P(76, 42), P(55, 42), P(66, 12)], fill=DARK)
    d.polygon([P(58, 10), P(24, 54), P(44, 54), P(36, 88), P(74, 40), P(53, 40), P(64, 10)], fill=BOLT)
    d.polygon([P(58, 10), P(64, 10), P(53, 40), P(48, 40)], fill=RIM)
    return img.resize((size, size), Image.LANCZOS)

draw(180, 0.8).save('icons/apple-touch-icon.png')
draw(192, 0.8).save('icons/icon-192.png')
draw(512, 0.8).save('icons/icon-512.png')
draw(512, 0.62).save('icons/icon-maskable-512.png')
print('icons written')
