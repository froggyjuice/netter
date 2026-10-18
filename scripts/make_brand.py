# 동아리 로고로 사이트 그림 만들기: 상단 로고 · 파비콘 · 앱 아이콘 · 공유 미리보기(OG)
# 실행: python scripts/make_brand.py <동아리 로고 jpg> [글꼴 ttf]
#   로고 원본: 동아리 앱 저장소의 public/netter-logo.jpg (바탕이 딥그린 #123322, 위쪽에 동그란 엠블럼)
#   글꼴: 기본은 윈도우 맑은 고딕 굵게 (OG 글자에만 쓴다)
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
FOREST = (18, 51, 34)
LIME = (199, 236, 131)
src = Image.open(sys.argv[1]).convert('RGB')
font_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/Windows/Fonts/malgunbd.ttf'

# 엠블럼(동그란 부분) 찾기: 바탕색과 다른 점들의 범위 (위쪽 1000px 안)
px = src.load()
xs, ys = [], []
for y in range(0, min(1000, src.height), 2):
    for x in range(0, src.width, 2):
        r, g, b = px[x, y]
        if abs(r - FOREST[0]) + abs(g - FOREST[1]) + abs(b - FOREST[2]) > 90:
            xs.append(x)
            ys.append(y)
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
rad = max(max(xs) - min(xs), max(ys) - min(ys)) / 2


def emblem(size, pad=0.06):
    """엠블럼을 가운데 둔 정사각형 (딥그린 바탕). pad: 가장자리 여백 비율"""
    r = rad / (1 - 2 * pad)
    box = (int(cx - r), int(cy - r), int(cx + r), int(cy + r))
    return src.crop(box).resize((size, size), Image.LANCZOS)


def circle(img):
    """동그랗게 (바깥은 투명)"""
    big = img.size[0] * 4
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, big - 1, big - 1], fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


emblem(160).save(PUB / 'logo.png', optimize=True)  # 상단 바 (CSS 로 동그랗게)
circle(emblem(64, 0.02)).save(PUB / 'favicon.png', optimize=True)
(PUB / 'icons').mkdir(exist_ok=True)
emblem(192).save(PUB / 'icons/icon-192.png', optimize=True)
emblem(512).save(PUB / 'icons/icon-512.png', optimize=True)
emblem(512, 0.16).save(PUB / 'icons/icon-maskable-512.png', optimize=True)  # 안전 영역(가운데 80%) 안에
emblem(180, 0.08).save(PUB / 'icons/apple-touch-icon.png', optimize=True)

# 공유 미리보기 1200×630: 왼쪽 엠블럼, 오른쪽 글자
W, H, k = 1200, 630, 2
og = Image.new('RGB', (W * k, H * k), FOREST)
em = circle(emblem(470 * k, 0.02))  # 동그랗게 붙여야 JPG 바탕의 미세한 색 차이(네모 테두리)가 안 보인다
og.paste(em, (70 * k, 80 * k), em)
d = ImageDraw.Draw(og)
f = lambda size: ImageFont.truetype(font_path, size * k)
x = 600 * k
d.text((x, 205 * k), 'NETTER', font=f(96), fill=(255, 255, 255), anchor='ls')
d.text((x, 300 * k), '놀이터', font=f(72), fill=LIME, anchor='ls')
d.text((x, 385 * k), '넷볼 규칙, 게임으로 익혀요', font=f(38), fill=(255, 255, 255), anchor='ls')
d.text((x, 445 * k), '존 스네이크 · 리듬 슈팅 · 패스 퍼즐', font=f(28), fill=(200, 214, 204), anchor='ls')
d.text((x, 490 * k), '넷볼 규칙 사전 · 오늘의 규칙', font=f(28), fill=(200, 214, 204), anchor='ls')
og.resize((W, H), Image.LANCZOS).save(PUB / 'og-image.png', optimize=True)
print('ok', round(cx), round(cy), round(rad))
