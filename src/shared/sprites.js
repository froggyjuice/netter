// 게임 캐릭터 그리기 (Phaser Graphics). 존 스네이크·리듬 슈팅이 함께 쓴다.
import { THEME } from './theme.js';

/**
 * 애벌레 얼굴 (머리·볼·눈·입). (fx, fy): 바라보는 방향 단위 벡터
 * opts: { color, mouth, open } open이면 입을 크게 벌린다
 */
export function drawFace(g, x, y, R, fx, fy, t, { color, mouth, open = false }) {
  const [px, py] = [-fy, fx]; // 옆 방향
  const pt = (f, p) => ({ x: x + fx * R * f + px * R * p, y: y + fy * R * f + py * R * p });

  g.fillStyle(color, 1);
  g.fillCircle(x, y, R);

  // 볼 터치
  g.fillStyle(0xff9aa2, 0.75);
  for (const side of [-1, 1]) {
    const c = pt(0.05, 0.62 * side);
    g.fillCircle(c.x, c.y, R * 0.16);
  }

  // 눈 (가끔 깜빡임)
  const blink = t % 3400 < 130;
  for (const side of [-1, 1]) {
    const e = pt(0.28, 0.36 * side);
    if (blink) {
      g.lineStyle(2, 0x2b2a26, 1);
      g.lineBetween(e.x - px * R * 0.2, e.y - py * R * 0.2, e.x + px * R * 0.2, e.y + py * R * 0.2);
    } else {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(e.x, e.y, R * 0.28);
      g.fillStyle(0x2b2a26, 1);
      g.fillCircle(e.x + fx * R * 0.1, e.y + fy * R * 0.1, R * 0.14);
    }
  }

  const m = pt(0.68, 0);
  g.fillStyle(mouth, 1);
  g.fillCircle(m.x, m.y, R * (open ? 0.22 : 0.1));
}

/** 보라색 꼬마 유령(맞수). (lx, ly): 눈동자가 보는 방향 */
export function drawGhost(g, x, y, R, lx, ly, color) {
  g.fillStyle(color, 1);
  g.fillCircle(x, y - R * 0.15, R * 0.85);
  g.fillRect(x - R * 0.85, y - R * 0.15, R * 1.7, R * 0.8);
  for (const k of [-0.57, 0, 0.57]) g.fillCircle(x + R * k, y + R * 0.62, R * 0.28); // 물결 치마
  for (const side of [-1, 1]) {
    const ex = x + side * R * 0.35;
    const ey = y - R * 0.25;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex, ey, R * 0.27);
    g.fillStyle(0x2b2a26, 1);
    g.fillCircle(ex + lx * R * 0.1, ey + ly * R * 0.1, R * 0.13);
    g.lineStyle(2, 0x2b2a26, 1);
    g.lineBetween(ex - side * R * 0.3, ey - R * 0.42, ex + side * R * 0.05, ey - R * 0.3); // 찌푸린 눈썹
  }
}

/** 넷볼 공 (angle: 무늬 회전) */
export function drawBall(g, x, y, r, angle) {
  g.fillStyle(THEME.ball, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(Math.max(1.5, r * 0.18), THEME.ballEdge, 1);
  g.strokeCircle(x, y, r);
  g.lineStyle(Math.max(1, r * 0.14), THEME.ballEdge, 0.9);
  const [ca, sa] = [Math.cos(angle) * r, Math.sin(angle) * r];
  g.lineBetween(x - ca, y - sa, x + ca, y + sa);
  g.lineBetween(x + sa, y - ca, x - sa, y + ca);
}
