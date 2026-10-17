# 공유 미리보기 이미지(public/og-image.png). 실행: python scripts/make_og.py <저장소 폴더> <임시 폴더>
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
root = Path(sys.argv[1]); scratch = Path(sys.argv[2])
def ttf(name):
    out = scratch / (name + '.ttf')
    f = TTFont(str(root / f'node_modules/@fontsource/jua/files/{name}.woff')); f.flavor = None; f.save(str(out)); return str(out)
latin = ttf('jua-latin-400-normal')
korean = ttf('jua-korean-400-normal')
W, H = 1200 * 2, 630 * 2
im = Image.new('RGB', (W, H), (227, 242, 217)); d = ImageDraw.Draw(im)
k = 2
def c(x, y, r, fill): d.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill=fill)
HEAD=(90,168,74); BODY=[(143,208,122),(109,187,92)]; INK=(43,43,38)
for i,(x,y,r) in enumerate([(120,330,62),(205,300,72),(300,328,82)]): c(x,y,r,BODY[i%2])
hx,hy,hr=430,290,110
for dx in (-38,38):
    d.line([(hx+dx*0.6)*k,(hy-hr*0.8)*k,(hx+dx*1.3)*k,(hy-hr*1.45)*k], fill=HEAD, width=16*k); c(hx+dx*1.3,hy-hr*1.45,17,HEAD)
c(hx,hy,hr,HEAD); c(hx-60,hy+30,19,(255,154,162)); c(hx+64,hy+30,19,(255,154,162))
for ex in (hx-36,hx+40):
    c(ex,hy-18,27,(255,255,255)); c(ex+6,hy-15,14,INK); c(ex+11,hy-22,5,(255,255,255))
d.arc([(hx-30)*k,(hy+8)*k,(hx+32)*k,(hy+58)*k], start=20, end=160, fill=INK, width=10*k)
d.text((590*k, 250*k), 'Netter', font=ImageFont.truetype(latin, 150*k), fill=(47,107,52), anchor='lm')
d.text((596*k, 380*k), '네터인을 위한 훈련 도우미', font=ImageFont.truetype(korean, 52*k), fill=(58,58,54), anchor='lm')
f3 = ImageFont.truetype(korean, 31*k); x = 596*k
for i, w in enumerate(['훈련 캘린더', '넷볼 규칙 게임', '넷볼 규칙 사전']):
    if i: c(x/k + 16, 452, 4, (90,110,80)); x += 32*k
    d.text((x, 450*k), w, font=f3, fill=(90,110,80), anchor='lm'); x += d.textlength(w, font=f3)
im.resize((1200, 630), Image.LANCZOS).save(root / 'public/og-image.png', optimize=True)
print('ok')
