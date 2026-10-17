// 캔버스 2D 그림 도구: 게임 캐릭터(애벌레 · 유령 · 공, shared/sprites.js)를 Phaser 없이 그린다.
// 개발 중 게임 미리보기(dev-preview.js)와 오늘의 규칙 장면(rule-scenes.js)이 함께 쓴다.
import { THEME, hex, FONT } from '../shared/theme.js';
import { drawFace } from '../shared/sprites.js';

export const W = 720;
export const H = 360;

/** sprites.js 가 쓰는 Phaser Graphics 메서드를 캔버스 2D로 */
export function graphics(ctx) {
  const col = (c, a = 1) => {
    const h = hex(c);
    return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
  };
  return {
    fillStyle(c, a) {
      ctx.fillStyle = col(c, a);
    },
    lineStyle(w, c, a) {
      ctx.lineWidth = w;
      ctx.strokeStyle = col(c, a);
    },
    fillCircle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    strokeCircle(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    fillRect(x, y, w, h) {
      ctx.fillRect(x, y, w, h);
    },
    lineBetween(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
  };
}

/** 둥근 네모 경로 */
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** 글씨 띠 (흰 바탕 둥근 네모 위 글씨) */
export function label(ctx, text, x, y, { size = 15, color = hex(THEME.ink), bg = 'rgba(255,255,255,0.92)', align = 'center' } = {}) {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 16;
  const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w + 8 : x - 8;
  if (bg) {
    ctx.fillStyle = bg;
    rr(ctx, bx, y - size * 0.85, w, size * 1.7, 8);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 1);
}

/** ⭕/❌ 판정 동그라미 (이모지 글꼴 없이 선으로) */
export function verdict(ctx, x, y, ok, r = 22) {
  ctx.fillStyle = ok ? hex(THEME.good) : hex(THEME.danger);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.48, y - r * 0.35);
  } else {
    ctx.moveTo(x - r * 0.38, y - r * 0.38);
    ctx.lineTo(x + r * 0.38, y + r * 0.38);
    ctx.moveTo(x + r * 0.38, y - r * 0.38);
    ctx.lineTo(x - r * 0.38, y + r * 0.38);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** 화살표 (bend: 휘는 정도, 양수면 왼쪽으로 볼록) */
export function arrow(ctx, x1, y1, x2, y2, { color = hex(THEME.ink), width = 3, dash = null, bend = 0, head = 12 } = {}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx - ((y2 - y1) / len) * bend;
  const cy = my + ((x2 - x1) / len) * bend;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  const a = Math.atan2(y2 - cy, x2 - cx);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

/** 잔디(코트) 바탕 + 테두리 */
export function grass(ctx, color = THEME.allowed) {
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, W, H);
}
export function frame(ctx) {
  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

/** 흰 코트 선 */
export function courtLine(ctx, x1, y1, x2, y2, width = 4) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export const TEAM = { color: THEME.pass, body: THEME.passBody, mouth: 0x0b2e6b }; // 우리 팀 (파랑)
export const ME = { color: THEME.snakeHead, body: THEME.snakeBody, mouth: 0x7a2e12 }; // 공 가진 나 (주황)
export const UMPIRE = { color: 0x8f948c, body: 0xdcdfd6, mouth: 0x3a3a36 }; // 심판 (회색)

/** 애벌레: 몸 마디(꼬리부터) + 얼굴. (fx, fy) 바라보는 방향 */
export function caterpillar(g, x, y, { R = 16, fx = 1, fy = 0, look = TEAM, segs = 3, open = false } = {}) {
  const n = Math.hypot(fx, fy) || 1;
  const [ux, uy] = [fx / n, fy / n];
  for (let i = segs; i >= 1; i--) {
    const wob = Math.sin(i * 1.7) * R * 0.12;
    g.fillStyle(i % 2 ? look.body : look.color, i % 2 ? 1 : 0.55);
    g.fillCircle(x - ux * R * 1.1 * i - uy * wob, y - uy * R * 1.1 * i + ux * wob, R * (0.86 - i * 0.05));
  }
  drawFace(g, x, y, R, ux, uy, 1000, { color: look.color, mouth: look.mouth, open });
}

/** 조끼 글자 (GS · C …) */
export function bib(ctx, text, x, y, kind = 'attack') {
  const bg = kind === 'centre' ? THEME.bibCentre : kind === 'defence' ? THEME.bibDefence : THEME.bibAttack;
  label(ctx, text, x, y, { size: 12, bg: hex(bg), color: kind === 'attack' ? '#ffffff' : hex(THEME.ink) });
}

/** 말풍선 */
export function bubble(ctx, text, x, y, { size = 16, tailX = x - 20, tailY = y + 30 } = {}) {
  ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + 22;
  const h = size * 1.9;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = hex(THEME.ink);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + h / 2 - 2);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(x + 8, y + h / 2 - 2);
  ctx.fill();
  ctx.stroke();
  rr(ctx, x - w / 2, y - h / 2, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 7, y + h / 2 - 3, 14, 4);
  ctx.fillStyle = hex(THEME.ink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}
