#!/usr/bin/env python3
"""
Builds the Open Graph share card: public/og-image.png, 1200x630.

This is what shows when a link to the site is posted in Discord, Bluesky,
Slack or anywhere else that reads OG tags. It's a placeholder in the
studio's palette and layout language, to be replaced with real key art
once that exists.
"""

from PIL import Image, ImageDraw, ImageFont
import random

W, H = 1200, 630
OUT = "/home/claude/digitail-site/public/og-image.png"

LONG_BLACK = (29, 13, 18)
DEEP = (20, 6, 9)
EXTRA_FOAM = (218, 210, 202)
FROZEN_JUNIPER = (93, 204, 202)
FLAT_WHITE = (229, 218, 191)
ARCTIC_WILLOW = (185, 204, 204)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
display = ImageFont.truetype(f"{FONT_DIR}/DejaVuSans-Bold.ttf", 104)
display_sm = ImageFont.truetype(f"{FONT_DIR}/DejaVuSans-Bold.ttf", 62)
mono = ImageFont.truetype(f"{FONT_DIR}/DejaVuSansMono-Bold.ttf", 27)
mono_sm = ImageFont.truetype(f"{FONT_DIR}/DejaVuSansMono.ttf", 22)

img = Image.new("RGB", (W, H), DEEP)
d = ImageDraw.Draw(img)

# --- dot grid, matching the site background -----------------------------
for y in range(0, H, 26):
    for x in range(0, W, 26):
        d.point((x, y), fill=(38, 22, 28))

# --- teal wedge across one corner ---------------------------------------
d.polygon([(W, 0), (W, H), (W - 430, H), (W - 250, 0)], fill=(26, 30, 34))

# --- offset card, rotated, the studio's signature ------------------------
card = Image.new("RGBA", (860, 330), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)
cd.rectangle([10, 10, 850, 320], fill=LONG_BLACK)          # hard shadow
cd.rectangle([0, 0, 840, 310], fill=ARCTIC_WILLOW, outline=LONG_BLACK, width=6)

# rarity stripe along the top, same as the team cards
x = 6
while x < 834:
    cd.rectangle([x, 6, min(x + 18, 834), 22], fill=FROZEN_JUNIPER)
    x += 24

cd.text((44, 62), "DIGI TAIL", font=display, fill=LONG_BLACK)
cd.text((44, 176), "STUDIOS", font=display, fill=LONG_BLACK)

card = card.rotate(-1.4, expand=True, resample=Image.BICUBIC)
img.paste(card, (78, 118), card)

# --- tagline on a teal slab ---------------------------------------------
tag = "INDIE GAME DEVELOPMENT FROM AOTEAROA"
bbox = d.textbbox((0, 0), tag, font=mono)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
sx, sy = 92, 486
d.rectangle([sx - 16, sy - 12, sx + tw + 20, sy + th + 20], fill=LONG_BLACK)
d.rectangle([sx - 20, sy - 16, sx + tw + 16, sy + th + 16],
            fill=FROZEN_JUNIPER, outline=LONG_BLACK, width=4)
d.text((sx, sy), tag, font=mono, fill=LONG_BLACK)

# --- domain, bottom right ------------------------------------------------
dom = "digitailstudios.com"
bbox = d.textbbox((0, 0), dom, font=mono_sm)
d.text((W - (bbox[2] - bbox[0]) - 60, H - 62), dom, font=mono_sm, fill=ARCTIC_WILLOW)

# --- scattered paw marks -------------------------------------------------
random.seed(7)
paw = ImageFont.truetype(f"{FONT_DIR}/DejaVuSans.ttf", 30)
for _ in range(9):
    px, py = random.randint(760, 1140), random.randint(60, 560)
    d.ellipse([px, py, px + 16, py + 20], fill=(40, 52, 56))
    for i, (ox, oy) in enumerate([(-14, -12), (-3, -20), (10, -20), (21, -12)]):
        d.ellipse([px + ox, py + oy, px + ox + 9, py + oy + 11], fill=(40, 52, 56))

img.save(OUT, "PNG", optimize=True)

import os
print(f"wrote {OUT}")
print(f"  {W}x{H}, {os.path.getsize(OUT) / 1024:.0f}KB")
