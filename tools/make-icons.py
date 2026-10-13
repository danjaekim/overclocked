#!/usr/bin/env python3
"""Generates the app icons (an ember-coloured anvil on a dark tile) into icons/.
Run:  python3 tools/make-icons.py     (needs Pillow; the PNGs are committed, this is just the source)"""
from PIL import Image, ImageDraw

BG = (14, 15, 20)
EMBER = (232, 163, 61)
METAL = (154, 160, 184)
DARK = (58, 61, 77)

def draw(size, safe):
    """safe: fraction of the tile the artwork may use (maskable icons need ~0.62)."""
    S = size * 4
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)
    u = S * safe / 100.0                     # artwork unit: 100 units across the safe area
    ox = oy = S * (1 - safe) / 2

    def P(x, y):
        return (ox + x * u, oy + y * u)

    glow = Image.new('RGB', (S, S), BG)
    gd = ImageDraw.Draw(glow)
    cx, cy = P(50, 46)
    for r, a in ((46, 0.10), (36, 0.16), (26, 0.22)):
        col = tuple(int(BG[i] + (EMBER[i] - BG[i]) * a) for i in range(3))
        gd.ellipse([cx - r * u, cy - r * u, cx + r * u, cy + r * u], fill=col)
    img.paste(glow)
    d = ImageDraw.Draw(img)
    # base, waist, face + horn
    d.polygon([P(26, 80), P(74, 80), P(70, 70), P(30, 70)], fill=DARK)
    d.polygon([P(36, 70), P(64, 70), P(60, 52), P(40, 52)], fill=DARK)
    d.polygon([P(14, 44), P(26, 36), P(88, 36), P(84, 46), P(70, 52), P(30, 52), P(22, 48)], fill=METAL)
    d.polygon([P(26, 36), P(88, 36), P(86, 41), P(26, 41)], fill=EMBER)
    # spark
    for dx, dy, r in ((46, 24, 3.2), (56, 17, 2.2), (38, 17, 1.8)):
        x, y = P(dx, dy)
        d.ellipse([x - r * u, y - r * u, x + r * u, y + r * u], fill=EMBER)
    return img.resize((size, size), Image.LANCZOS)

draw(180, 0.8).save('icons/apple-touch-icon.png')
draw(192, 0.8).save('icons/icon-192.png')
draw(512, 0.8).save('icons/icon-512.png')
draw(512, 0.62).save('icons/icon-maskable-512.png')
print('icons written')
