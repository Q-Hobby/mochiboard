# the Beta app's icon: the real icon with a little pink "β" badge, built into an .icns
import sys, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; here = os.path.dirname(os.path.abspath(__file__)); im = Image.open(os.path.join(here, '..', 'assets', 'icon.png')).convert('RGBA')
S = im.size[0]; d = ImageDraw.Draw(im); r = int(S * .19); cx, cy = S - r - int(S * .06), S - r - int(S * .06)
d.ellipse([cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10], fill=(255, 255, 255, 255)); d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(242, 122, 168, 255))
try: f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', int(r * 1.5))
except Exception: f = ImageFont.load_default()
bb = d.textbbox((0, 0), 'β', font=f); d.text((cx - (bb[2] + bb[0]) / 2, cy - (bb[3] + bb[1]) / 2 - r * .08), 'β', font=f, fill=(255, 255, 255, 255))
t = tempfile.mkdtemp(); iset = os.path.join(t, 'icon.iconset'); os.mkdir(iset)
for sz in [16, 32, 64, 128, 256, 512, 1024]:
    im.resize((sz, sz), Image.LANCZOS).save(os.path.join(iset, f'icon_{sz}x{sz}.png'))
    if sz > 16: im.resize((sz, sz), Image.LANCZOS).save(os.path.join(iset, f'icon_{sz // 2}x{sz // 2}@2x.png'))
subprocess.run(['iconutil', '-c', 'icns', iset, '-o', out], check=True); print(out)
