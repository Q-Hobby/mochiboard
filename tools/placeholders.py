#!/usr/bin/env python3
# Pixel-Mochi placeholder pictures for empty image spots in wireframes: little scenes on a 32×24 grid (4:3, 8 px cells → 256×192),
# drawn from the app's own pixel pieces (the small Mochi from the 666 post, the stamps/px emoji) so they feel like Mochiboard, not stock.
# Run from the repo root: python3 tools/placeholders.py   (rewrites web/stamps/ph/*.png and prints a contact sheet to the scratchpad)
from PIL import Image
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from stamps import SMALL, MINI, COLORS, EYE, hx

ROOT = os.path.join(os.path.dirname(__file__), '..', 'web', 'stamps'); OUT = os.path.join(ROOT, 'ph'); os.makedirs(OUT, exist_ok=True)
GW, GH, C = 32, 24, 8
# a quiet palette: the scene must still read as "a picture goes here", so it stays soft and low-contrast
SKY, SKY2, HILL, HILL2, SUN, CLOUD, GROUND, LINE = '#eef4ff', '#dbe9ff', '#cfeadb', '#b9dfc9', '#ffe39a', '#ffffff', '#f3e9f1', '#d9d0dc'

def canvas(bg=SKY): return Image.new('RGBA', (GW * C, GH * C), hx(bg))
def cell(im, x, y, color, w=1, h=1):
    if not (0 <= x < GW and 0 <= y < GH): return
    d = im.load(); c = hx(color)
    for yy in range(y * C, min(GH * C, (y + h) * C)):
        for xx in range(x * C, min(GW * C, (x + w) * C)): d[xx, yy] = c
def sprite(im, rows, ox, oy, pal):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.' and ch in pal: cell(im, ox + x, oy + y, pal[ch])
def mochi(im, ox, oy, color='blue', face=True, small=False):
    col = COLORS[color]; pal = {'B': col['B'], 'S': col['S'], 'D': col['D']}
    if small: sprite(im, MINI, ox, oy, {**pal, 'E': EYE, 'O': '#ff8fc2'}); return
    sprite(im, SMALL, ox, oy, pal)
    if face:
        for c in (3, 9): cell(im, ox + c, oy + 5, EYE); cell(im, ox + c, oy + 6, EYE)
        for c in (2, 10): cell(im, ox + c, oy + 7, '#ff8fc2')
def emoji(im, name, ox, oy, cells=6):
    """a stamps/px emoji (16-cell art) scaled to `cells` grid cells"""
    e = Image.open(os.path.join(ROOT, 'px', name + '.png')).convert('RGBA').resize((cells * C, cells * C), Image.NEAREST)
    im.alpha_composite(e, (ox * C, oy * C))
def hills(im, y=16):
    for x in range(GW): cell(im, x, y, HILL2); cell(im, x, y + 1, HILL, 1, GH - y - 1)
    for x, w in [(2, 6), (12, 9), (24, 6)]: cell(im, x, y - 1, HILL2, w, 1)
    for x, w in [(4, 2), (15, 3), (26, 2)]: cell(im, x, y - 2, HILL2, w, 1)
def sun(im, x=25, y=3): cell(im, x, y, SUN, 4, 4); cell(im, x + 1, y - 1, SUN, 2, 1); cell(im, x + 1, y + 4, SUN, 2, 1); cell(im, x - 1, y + 1, SUN, 1, 2); cell(im, x + 4, y + 1, SUN, 1, 2)
def cloud(im, x, y): cell(im, x, y, CLOUD, 5, 2); cell(im, x + 1, y - 1, CLOUD, 3, 1)
def sparkles(im, pts):
    for x, y in pts: cell(im, x, y, '#ffd3e4'); cell(im, x - 1, y, '#ffe6ef'); cell(im, x + 1, y, '#ffe6ef'); cell(im, x, y - 1, '#ffe6ef'); cell(im, x, y + 1, '#ffe6ef')

SCENES = {}
def scene(name):
    def wrap(f): SCENES[name] = f; return f
    return wrap

@scene('landscape')   # hero pictures, banners, places: Mochi on a hill under a little sun
def _(im): sun(im); cloud(im, 4, 4); cloud(im, 16, 6); hills(im); mochi(im, 10, 6); sparkles(im, [(26, 12), (6, 11)])
@scene('portrait')    # people, avatars, profiles: Mochi in a round frame
def _(im):
    for y in range(GH):
        for x in range(GW):
            if (x - 15.5) ** 2 / 9.5 ** 2 + (y - 12) ** 2 / 9.5 ** 2 <= 1: cell(im, x, y, SKY2)
    mochi(im, 9, 7); cell(im, 9, 18, COLORS['blue']['D'], 13, 1)
@scene('product')     # things for sale, food, objects: Mochi next to a cupcake on a shelf
def _(im):
    cell(im, 0, 17, LINE, GW, 1); cell(im, 0, 18, GROUND, GW, GH - 18); mochi(im, 5, 6); emoji(im, 'cupcake', 20, 9, 8); sparkles(im, [(27, 6), (18, 5)])
@scene('team')        # groups, teams, friends: three Mochis in a row
def _(im): hills(im, 17); mochi(im, 2, 9, 'pink', small=True); mochi(im, 12, 7, 'blue', small=True); mochi(im, 22, 9, 'mint', small=True); sun(im, 26, 2)
@scene('photo')       # a photo, a camera, a gallery: Mochi holding up a camera
def _(im): cell(im, 0, 0, SKY2, GW, GH); mochi(im, 6, 8); emoji(im, 'camera', 18, 7, 8); sparkles(im, [(26, 4), (4, 5), (28, 16)])
@scene('chart')       # data, stats, dashboards: little bars and a proud Mochi
def _(im):
    cell(im, 0, 20, LINE, GW, 1)
    for i, h in enumerate([5, 8, 6, 11, 9]): cell(im, 15 + i * 3, 20 - h, ['#cfe3ff', '#ffd3e4', '#cfeadb', '#ffe39a', '#e6dcff'][i], 2, h)
    mochi(im, 1, 9); emoji(im, 'sparkles', 26, 3, 5)
@scene('map')         # maps, places, travel: a winding path and a pin
def _(im):
    cell(im, 0, 0, HILL, GW, GH)
    for x, y in [(0, 18), (4, 17), (8, 15), (12, 14), (16, 12), (20, 11), (24, 9), (28, 8)]: cell(im, x, y, '#ffffff', 5, 2)
    mochi(im, 3, 4, small=True); emoji(im, 'roundpin', 22, 1, 7)
@scene('music')       # audio, video, media: Mochi with headphones
def _(im): cell(im, 0, 0, '#f6f2ff', GW, GH); mochi(im, 10, 8); emoji(im, 'headphones', 8, 1, 17); sparkles(im, [(4, 14), (27, 15)])   # the headphones sit on her head
@scene('any')         # everything else: Mochi and sparkles, the plainest one
def _(im): mochi(im, 10, 7); sparkles(im, [(5, 6), (26, 5), (24, 16), (7, 17)])

# black and white: the scenes are drawn in colour, then snapped to the wireframes' own grey ramp so they read as placeholders, not pictures
RAMP = [hx(c) for c in ['#fafafa', '#ececee', '#d4d4d8', '#a1a1aa', '#71717a', '#3f3f46', '#18181b']]
def mono(im):
    out = Image.new('RGBA', im.size); s, d = im.load(), out.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = s[x, y]
            if not a: continue
            l = .2126 * r + .7152 * g + .0722 * b
            d[x, y] = RAMP[min(range(len(RAMP)), key=lambda i: abs(RAMP[i][0] - l))]
    return out
def main():
    sheet = Image.new('RGBA', (3 * (GW * C + 16) + 16, 3 * (GH * C + 16) + 16), (250, 246, 251, 255)); i = 0
    for name, draw in SCENES.items():
        im = canvas(); draw(im); im = mono(im); im.save(os.path.join(OUT, name + '.png'))
        sheet.paste(im, (16 + (i % 3) * (GW * C + 16), 16 + (i // 3) * (GH * C + 16))); i += 1
    sheet.save('/private/tmp/claude-501/-Users-jessabug/ccc63478-11f7-4619-852a-3375a7a2bb41/scratchpad/ph_sheet.png'); print('made', ' '.join(SCENES))

if __name__ == '__main__': main()
