#!/usr/bin/env python3
# New Mochi stamps, drawn on the same 20×20 pixel grid as stamps/mochi.png (128 px, 6.4 px cells):
#   mochi-double[-pair].png     two little Mochis side by side, in two colors
#   mochi-wings-<color>.png     Mochi with little wings, one per Mochi color
#   mochi-fly-<color>.gif       the same Mochi flapping and bobbing
# Run from the repo root: python3 tools/stamps.py   (rewrites the files in web/stamps)
from PIL import Image
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'web', 'stamps')
N, PX = 20, 128
BASE = {'B': '#33c7ff', 'S': '#ccf5ff', 'D': '#1480db'}          # the blue Mochi's body / shine / shade (what the app calls MOCHI_COLORS.blue)
EYE, BLUSH = '#081f3d', '#ff8fc2'
COLORS = { 'blue': BASE, 'pink': {'B': '#ff8fc2', 'S': '#ffe0ee', 'D': '#e0559a'}, 'mint': {'B': '#5fdba0', 'S': '#d9fbe9', 'D': '#2fae73'},
    'lilac': {'B': '#b49bff', 'S': '#ece5ff', 'D': '#7e5ee6'}, 'butter': {'B': '#ffd54f', 'S': '#fff4c4', 'D': '#e0a800'}, 'peach': {'B': '#ffa978', 'S': '#ffe6d6', 'D': '#e57841'}, 'night': {'B': '#4a4f7a', 'S': '#8d93c9', 'D': '#2b2e4f'} }
WING = {'W': '#ffffff', 'w': '#e8ecf4', 'o': '#c9d0e0'}            # wing white, wing shade, wing edge

def hx(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def base_cells():
    """the original Mochi as 20×20 role letters: B body, S shine, D shade, E eye, O blush, . empty"""
    im = Image.open(os.path.join(ROOT, 'mochi.png')).convert('RGBA'); px = im.load(); s = PX / N
    roles = {hx(BASE['B']): 'B', hx(BASE['S']): 'S', hx(BASE['D']): 'D', hx(EYE): 'E', hx(BLUSH): 'O'}
    return [[roles.get(px[int(x * s + s / 2), int(y * s + s / 2)], '.') for x in range(N)] for y in range(N)]

def paint(cells, color, blush=BLUSH):
    """role letters → an RGBA 128px image"""
    pal = {'B': hx(color['B']), 'S': hx(color['S']), 'D': hx(color['D']), 'E': hx(EYE), 'O': hx(blush), **{k: hx(v) for k, v in WING.items()}}
    im = Image.new('RGBA', (PX, PX), (0, 0, 0, 0)); d = im.load(); s = PX / N
    for y in range(N):
        for x in range(N):
            c = pal.get(cells[y][x]);
            if not c: continue
            for yy in range(int(y * s), int((y + 1) * s)):
                for xx in range(int(x * s), int((x + 1) * s)): d[xx, yy] = c
    return im

def blank(): return [['.'] * N for _ in range(N)]
def stamp(cells, sprite, ox, oy):
    for y, row in enumerate(sprite):
        for x, ch in enumerate(row):
            if ch != '.' and 0 <= oy + y < N and 0 <= ox + x < N: cells[oy + y][ox + x] = ch
def shift(cells, dx, dy):
    out = blank(); stamp(out, cells, dx, dy); return out

# a little Mochi, 9 wide × 7 tall, same face as the big one
MINI = ['..BBBBB..',
        '.BSSBBBB.',
        'BBSBBBBBB',
        'BBEBBBEBB',
        'BOBBBBBOB',
        'BBBBBBBBB',
        '.DDDDDDD.']

def double(pair):
    """two Mochis leaning together: the left one a touch lower and in front"""
    a, b = pair
    cells = blank(); right = [r for r in MINI]; left = [r for r in MINI]
    # paint roles with per-sprite color by using distinct letters, then a two-palette paint
    stamp(cells, [r.replace('B', 'b').replace('S', 's').replace('D', 'd') for r in right], 10, 7)   # back one (right, higher)
    stamp(cells, left, 1, 9)                                                                           # front one (left, lower)
    pal_a, pal_b = COLORS[a], COLORS[b]
    im = Image.new('RGBA', (PX, PX), (0, 0, 0, 0)); d = im.load(); s = PX / N
    pal = {'B': hx(pal_a['B']), 'S': hx(pal_a['S']), 'D': hx(pal_a['D']), 'b': hx(pal_b['B']), 's': hx(pal_b['S']), 'd': hx(pal_b['D']), 'E': hx(EYE),
           'O': hx(BLUSH if a != 'pink' else '#ff5fa3')}
    for y in range(N):
        for x in range(N):
            c = pal.get(cells[y][x])
            if not c: continue
            for yy in range(int(y * s), int((y + 1) * s)):
                for xx in range(int(x * s), int((x + 1) * s)): d[xx, yy] = c
    return im

# wings: three poses (up, level, down), drawn for the left side and mirrored for the right
WINGS = {   # the left wing, tip at the top-left, base tucked under the body's shoulder; 6 wide
    'up':    ['Wo....', 'WWo...', 'WWWo..', 'wWWWo.', '.wwWWo', '..owww', '...ooo'],
    'level': ['......', 'oWo...', 'WWWo..', 'wWWWo.', '.wwWWo', '..owww', '...ooo'],
    'down':  ['......', '......', '.ooo..', 'oWWWo.', 'wwWWWo', '.owwww', '...ooo'],
}
def winged(color, pose, lift):
    body = shift(base_cells(), 0, -3 - lift)            # Mochi floats a little higher than usual; `lift` bobs it
    cells = blank()
    wl = WINGS[pose]; wr = [r[::-1] for r in wl]
    top = 4 - lift
    stamp(cells, wl, 0, top); stamp(cells, wr, N - 6, top)   # wings first, body on top
    for y in range(N):
        for x in range(N):
            if body[y][x] != '.': cells[y][x] = body[y][x]
    return paint(cells, COLORS[color], BLUSH if color != 'pink' else '#ff5fa3')

def to_gif_frames(frames):
    """RGBA frames → palette frames with index 0 transparent (the same shape as mochi-bounce.gif)"""
    out = []
    for f in frames:
        colors = sorted({f.getpixel((x, y)) for x in range(PX) for y in range(PX) if f.getpixel((x, y))[3]})
        pal = [(0, 0, 0)] + [c[:3] for c in colors]; idx = {c: i + 1 for i, c in enumerate(colors)}
        p = Image.new('P', (PX, PX), 0); flat = []
        for c in pal: flat += list(c)
        p.putpalette(flat + [0] * (768 - len(flat))); d = p.load()
        for y in range(PX):
            for x in range(PX):
                c = f.getpixel((x, y))
                if c[3]: d[x, y] = idx[c]
        out.append(p)
    return out

# devil Mochi, from the 666-downloads post: red horns, a pointy tail, a tiny pitchfork, sly eyes and a smirk.
# The post's body is 13 wide, and the fork and tail need 24 columns, so this one lives on a 24×24 grid.
DN = 24
SMALL = ['....BBBBB....', '..BBSSBBBBB..', '.BBSSBBBBBBB.', '.BSBBBBBBBBB.', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'BBBBBBBBBBBBB', 'DBBBBBBBBBBBD', 'DDDDDDDDDDDDD']
def devil(color):
    R, Q, K, G = hx('#ff5a7a'), hx('#d63a62'), hx(EYE), hx('#c9a24a')
    pal = {'B': hx(color['B']), 'S': hx(color['S']), 'D': hx(color['D'])}
    im = Image.new('RGBA', (PX, PX), (0, 0, 0, 0)); d = im.load(); s = PX / DN; ox, oy = 4, 7
    def dot(x, y, c):
        x += ox; y += oy
        for yy in range(int(y * s), int((y + 1) * s)):
            for xx in range(int(x * s), int((x + 1) * s)): d[xx, yy] = c
    for y in range(3, 11): dot(-2, y, G)                                                        # the fork's handle (her side hides the top of it)
    for x, y in [(-4, 2), (-3, 2), (-2, 2), (-1, 2), (0, 2), (-4, 1), (-4, 0), (-2, 1), (-2, 0), (-2, -1), (0, 1), (0, 0)]: dot(x, y, R)
    for x, y in [(-4, -1), (-2, -2), (0, -1)]: dot(x, y, Q)
    for x, y in [(12, 9), (13, 9), (14, 8), (15, 7), (15, 6), (16, 5), (17, 4)]: dot(x, y, R)   # the tail, low on the right, curling up to an arrowhead
    for x, y in [(18, 2), (17, 3), (18, 3), (19, 3), (18, 4)]: dot(x, y, Q)
    for y, row in enumerate(SMALL):
        for x, ch in enumerate(row):
            if ch != '.': dot(x, y, pal[ch])
    for x, y in [(2, -2), (2, -1), (3, -1), (10, -2), (10, -1), (9, -1)]: dot(x, y, R)            # horns
    dot(2, -2, Q); dot(10, -2, Q)
    for c in (3, 9): dot(c, 5, K); dot(c, 6, K)
    dot(2, 5, K); dot(10, 5, K)                                                                 # the sly slant
    for c in (2, 10): dot(c, 7, R)                                                              # red cheeks
    for x in (5, 6, 7): dot(x, 8, K)
    dot(8, 7, K)                                                                                # smirk
    return im

def main():
    made = []
    for name, color in COLORS.items():
        f = f'mochi-devil-{name}.png'; devil(color).save(os.path.join(ROOT, f)); made.append(f)
    for name, pair in [('', ('pink', 'blue')), ('-mint', ('mint', 'lilac')), ('-butter', ('butter', 'peach'))]:
        f = f'mochi-double{name}.png'; double(pair).save(os.path.join(ROOT, f)); made.append(f)
    for color in COLORS:
        f = f'mochi-wings-{color}.png'; winged(color, 'up', 0).save(os.path.join(ROOT, f)); made.append(f)
        frames = [winged(color, 'up', 1), winged(color, 'level', 1), winged(color, 'down', 0), winged(color, 'level', 0)]
        pf = to_gif_frames(frames); g = f'mochi-fly-{color}.gif'
        pf[0].save(os.path.join(ROOT, g), save_all=True, append_images=pf[1:], duration=[130, 110, 130, 110], loop=0, disposal=2, transparency=0, optimize=False)
        made.append(g)
    print('made', len(made), 'stamps:', ' '.join(made))

if __name__ == '__main__': main()
