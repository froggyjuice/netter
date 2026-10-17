# 앱 아이콘: 초록 애벌레 + Netter (Jua 글꼴). 2배로 그린 뒤 줄여서 매끈하게.
# 실행: python scripts/make_icons.py <저장소 폴더> <임시 폴더>  (Pillow · fontTools 필요)
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(sys.argv[1])
SCRATCH = Path(sys.argv[2])
woff = ROOT / 'node_modules/@fontsource/jua/files/jua-latin-400-normal.woff'
ttf = SCRATCH / 'jua-latin.ttf'
f = TTFont(str(woff))
f.flavor = None
f.save(str(ttf))

BG = (227, 242, 217)
HEAD = (90, 168, 74)
BODY = [(143, 208, 122), (109, 187, 92)]
INK = (43, 43, 38)
TEXT = (47, 107, 52)
CHEEK = (255, 154, 162)


def draw(size, scale=1.0, text=True):
    S = size * 2
    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    k = S / 512 * scale
    ox = S / 2 - 256 * k
    oy = S / 2 - 256 * k
    P = lambda x, y: (ox + x * k, oy + y * k)
    def circle(x, y, r, fill):
        cx, cy = P(x, y)
        d.ellipse([cx - r * k, cy - r * k, cx + r * k, cy + r * k], fill=fill)
    top = 0 if text else 40  # 글자가 없으면 애벌레를 가운데로
    # 몸 마디 (꼬리부터)
    segs = [(92, 262, 46), (158, 236, 54), (232, 256, 62)]
    for i, (x, y, r) in enumerate(segs):
        circle(x, y + top, r, BODY[i % 2])
    # 더듬이
    hx, hy, hr = 340, 220 + top, 84
    for dx in (-30, 30):
        x0, y0 = P(hx + dx * 0.6, hy - hr * 0.8)
        x1, y1 = P(hx + dx * 1.3, hy - hr * 1.45)
        d.line([x0, y0, x1, y1], fill=HEAD, width=int(12 * k))
        circle(hx + dx * 1.3, hy - hr * 1.45, 13, HEAD)
    # 머리
    circle(hx, hy, hr, HEAD)
    # 볼
    circle(hx - 46, hy + 22, 15, CHEEK)
    circle(hx + 50, hy + 22, 15, CHEEK)
    # 눈
    for ex in (hx - 28, hx + 30):
        circle(ex, hy - 14, 21, (255, 255, 255))
        circle(ex + 5, hy - 12, 11, INK)
        circle(ex + 9, hy - 17, 4, (255, 255, 255))
    # 웃는 입
    x0, y0 = P(hx - 22, hy + 6)
    x1, y1 = P(hx + 24, hy + 44)
    d.arc([x0, y0, x1, y1], start=20, end=160, fill=INK, width=int(8 * k))
    if text:
        font = ImageFont.truetype(str(ttf), int(118 * k))
        cx, cy = P(256, 418)
        d.text((cx, cy), 'Netter', font=font, fill=TEXT, anchor='mm')
    return im.resize((size, size), Image.LANCZOS)


out = ROOT / 'public/icons'
draw(512).save(out / 'icon-512.png', optimize=True)
draw(192).save(out / 'icon-192.png', optimize=True)
draw(180).save(out / 'apple-touch-icon.png', optimize=True)
draw(512, scale=0.78).save(out / 'icon-maskable-512.png', optimize=True)  # 가운데 80% 안에 들어가게
draw(512).save(SCRATCH / 'icon-preview.png')
draw(64, text=False).save(SCRATCH / 'favicon-preview.png')
print('ok')
