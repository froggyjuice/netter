// 오늘의 규칙 한 줄: 규칙이 적용된 장면을 애벌레로 그린 멈춘 그림 (캔버스 2D, 720×360).
// 장면 이름은 shared/daily-rule.js 의 scene 과 같다.
import { THEME, hex, FONT } from '../shared/theme.js';
import { drawGhost, drawBall } from '../shared/sprites.js';
import { W, H, graphics, label as kitLabel, verdict, arrow, rr, caterpillar, bib, bubble as kitBubble, ME, TEAM, UMPIRE } from './canvas-kit.js';

// 폰에서는 그림이 절반 가까이 줄어드니 글씨를 크게
const TEXT = 1.3;
const label = (ctx, t, x, y, o = {}) => kitLabel(ctx, t, x, y, { ...o, size: Math.round((o.size ?? 15) * TEXT) });
const bubble = (ctx, t, x, y, o = {}) => kitBubble(ctx, t, x, y, { ...o, size: Math.round((o.size ?? 16) * TEXT) });

const COURT_W = 30.5;
const COURT_H = 15.25;
const SURROUND = '#ebe6d6'; // 코트 밖

/** 코트를 (mx0, my0) m 부터 1m = cell px 로 그린다 → m 좌표를 px 로 바꾸는 함수 */
function courtView(ctx, { mx0 = -0.9, my0 = -0.45, cell = 22.3, forbid = null } = {}) {
  const P = (mx, my) => [(mx - mx0) * cell, (my - my0) * cell];
  ctx.fillStyle = SURROUND;
  ctx.fillRect(0, 0, W, H);
  const [x0, y0] = P(0, 0);
  const [x1, y1] = P(COURT_W, COURT_H);
  ctx.fillStyle = hex(THEME.allowed);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // 갈 수 없는 구역 (오프사이드 장면): [mx 시작, mx 끝]
  if (forbid) {
    const [fa] = P(forbid[0], 0);
    const [fb] = P(forbid[1], 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fa, y0, fb - fa, y1 - y0);
    ctx.clip();
    ctx.fillStyle = hex(THEME.forbidden);
    ctx.fillRect(fa, y0, fb - fa, y1 - y0);
    ctx.strokeStyle = 'rgba(111,122,111,0.35)';
    ctx.lineWidth = 2;
    for (let d = -H; d < W + H; d += 16) {
      ctx.beginPath();
      ctx.moveTo(fa + d, y0);
      ctx.lineTo(fa + d - (y1 - y0), y1);
      ctx.stroke();
    }
    ctx.restore();
  }
  const midY = (y0 + y1) / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  // 골 서클 (반지름 4.9m 반원)
  for (const [gx, a, b] of [[x0, -Math.PI / 2, Math.PI / 2], [x1, Math.PI / 2, Math.PI * 1.5]]) {
    ctx.fillStyle = hex(THEME.goalZone);
    ctx.beginPath();
    ctx.arc(gx, midY, 4.9 * cell, a, b);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx, midY, 4.9 * cell, a, b);
    ctx.stroke();
  }
  // 서드 선 · 센터 서클 · 바깥 선
  for (const t of [COURT_W / 3, (COURT_W * 2) / 3]) {
    const [x] = P(t, 0);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
  const [cx, cy] = P(COURT_W / 2, COURT_H / 2);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, 0.45 * cell), 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // 골대 링 (골라인 가운데)
  ctx.strokeStyle = hex(THEME.goalRing);
  ctx.lineWidth = Math.max(2, cell * 0.08);
  for (const [gx, s] of [[x0, 1], [x1, -1]]) {
    ctx.beginPath();
    ctx.arc(gx + s * 0.34 * cell, midY, Math.max(4, 0.19 * cell), 0, Math.PI * 2);
    ctx.stroke();
  }
  return P;
}

// 자주 쓰는 확대 화면
const GOAL_END = { mx0: 13.5, my0: 3.125, cell: 40 }; // 오른쪽 골 서드
const CENTRE = { mx0: 6.25, my0: 3.125, cell: 40 }; // 센터 서드
const SIDELINE = { mx0: 4, my0: 8.3, cell: 40 }; // 아래 사이드라인

/** 공 가진 애벌레 (공은 얼굴 앞) */
function holder(g, x, y, { fx = 1, fy = 0, R = 18, look = ME } = {}) {
  caterpillar(g, x, y, { R, fx, fy, look });
  const n = Math.hypot(fx, fy) || 1;
  drawBall(g, x + (fx / n) * R * 1.35, y + (fy / n) * R * 1.35, R * 0.48, 0.3);
}
const ghost = (g, x, y, { R = 18, lx = -1, ly = 0, color = THEME.opp } = {}) => drawGhost(g, x, y, R, lx, ly, color);

/** 팔 벌린 유령 (수비 · 장애) */
function arms(ctx, x, y, R, color = THEME.opp) {
  ctx.strokeStyle = hex(color);
  ctx.lineWidth = R * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - R * 0.2, y - R * 0.2);
  ctx.lineTo(x - R * 1.15, y - R * 0.9);
  ctx.moveTo(x - R * 0.2, y + R * 0.2);
  ctx.lineTo(x - R * 1.15, y + R * 0.9);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** 쾅! 부딪힘 표시 */
function bump(ctx, x, y, r = 22) {
  ctx.strokeStyle = hex(THEME.danger);
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
}

/** 발자국 */
function foot(ctx, x, y, color, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 줄자 (점선 + 거리 글씨) */
function measure(ctx, x1, y1, x2, y2, text, ok) {
  ctx.strokeStyle = ok ? hex(THEME.good) : hex(THEME.danger);
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
  }
  label(ctx, text, (x1 + x2) / 2, (y1 + y2) / 2 - 18, { size: 15, color: ok ? hex(THEME.good) : hex(THEME.danger) });
}

/** 휘슬 부는 심판 */
function umpire(ctx, g, x, y, { fx = 0, fy = -1, R = 17, call = '삐익!' } = {}) {
  caterpillar(g, x, y, { R, fx, fy, look: UMPIRE, segs: 2, open: true });
  if (call) bubble(ctx, call, x + 40, y - 50, { size: 15, tailX: x + 10, tailY: y - 22 });
}

/** 큰 카드 (단계 · 기록지) */
function card(ctx, x, y, w, h, text, { bg = '#ffffff', border = '#c9d8c6', size: size0 = 15, color = hex(THEME.ink) } = {}) {
  const size = Math.round(size0 * 1.15);
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.5;
  rr(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = String(text).split('\n');
  lines.forEach((t, i) => ctx.fillText(t, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.25 + 1));
}

// ---------------- 장면들 ----------------

/** Rule 1: 코트 지도 */
function courtMap(ctx) {
  const P = courtView(ctx);
  const [, top] = P(0, 0);
  for (const [mx, t] of [[5.1, '골 서드'], [15.25, '센터 서드'], [25.4, '골 서드']]) label(ctx, t, P(mx, 0)[0], top + 22, { size: 14 });
  const [cx, cy] = P(15.25, 7.6);
  arrow(ctx, cx + 60, cy + 70, cx + 8, cy + 8, { color: hex(THEME.ink), width: 2.5, head: 10 });
  label(ctx, '센터 서클 지름 0.9m', cx + 80, cy + 86, { size: 14 });
  const [gx, gy] = P(30.5, 7.6);
  arrow(ctx, gx - 30, gy, gx - 96, gy, { color: hex(THEME.goalRing), width: 3, head: 10 });
  label(ctx, '골 서클 반지름 4.9m', gx - 120, gy - 40, { size: 14 });
  label(ctx, '30.5m × 15.25m', P(15.25, 15.25)[0], P(0, 15.25)[1] - 20, { size: 13, bg: 'rgba(255,255,255,0.75)' });
}

/** Rule 1 · 14: 선 위는 그 구역 안 */
function onLine(ctx, g) {
  const P = courtView(ctx, { ...CENTRE, forbid: [20.33, 31] });
  const [lx] = P(20.33, 0);
  caterpillar(g, lx - 6, 180, { R: 22, fx: 1, fy: 0 });
  bib(ctx, 'WD', lx - 60, 150, 'defence');
  label(ctx, '선 위 = 아직 내 구역', lx - 40, 250, { size: 15 });
  verdict(ctx, lx - 6, 110, true);
  label(ctx, '못 들어가는 골 서드', W - 16, 50, { size: 13, bg: 'rgba(255,255,255,0.85)', align: 'right' });
}

/** Rule 2: 4쿼터 · 진영 바꾸기 */
function quarters(ctx, g) {
  const P = courtView(ctx);
  const [, cy] = P(15.25, 7.6);
  ['1Q', '2Q', '3Q', '4Q'].forEach((q, i) => card(ctx, 140 + i * 115, 40, 100, 54, `${q}\n15분`, { size: 15, bg: i % 2 ? '#eef4fb' : '#fff8e6' }));
  caterpillar(g, 250, cy + 10, { R: 18, fx: 1, fy: 0 });
  arrow(ctx, 285, cy + 10, 520, cy + 10, { color: hex(THEME.cue), width: 4 });
  label(ctx, '1·3쿼터: 이쪽 골로 →', 400, cy - 20, { size: 14 });
  caterpillar(g, 470, cy + 100, { R: 18, fx: -1, fy: 0 });
  arrow(ctx, 435, cy + 100, 200, cy + 100, { color: hex(THEME.opp), width: 4, dash: [8, 6] });
  label(ctx, '← 2·4쿼터: 진영 바꿔요', 320, cy + 135, { size: 14 });
}

/** Rule 3: 7 포지션, C는 꼭 */
function team(ctx, g) {
  courtView(ctx, { ...CENTRE });
  const pos = [['GS', 'attack'], ['GA', 'attack'], ['WA', 'attack'], ['C', 'centre'], ['WD', 'defence'], ['GD', 'defence'], ['GK', 'defence']];
  pos.forEach(([p, k], i) => {
    const x = 75 + i * 95;
    const y = 190 + (i % 2 ? 30 : -10);
    caterpillar(g, x, y, { R: 19, fx: 0, fy: -1, segs: 2 });
    bib(ctx, p, x, y + 42, k);
  });
  label(ctx, '코트 위 최대 7명', W / 2, 50, { size: 18 });
  ctx.strokeStyle = hex(THEME.hot);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(75 + 3 * 95, 220, 48, 0, Math.PI * 2);
  ctx.stroke();
  label(ctx, 'C(센터)는 꼭 있어야 해요!', 75 + 3 * 95, 305, { size: 14, color: '#7a5a00' });
}

/** Rule 4: 심판 두 명, 휘슬 순서 */
function umpires(ctx, g) {
  const P = courtView(ctx);
  const [x0, y0] = P(0, 0);
  const [x1, y1] = P(30.5, 15.25);
  umpire(ctx, g, (x0 + x1) / 2 - 150, y0 + 22, { fx: 0, fy: 1, R: 15, call: null });
  bubble(ctx, '삐익!', (x0 + x1) / 2 - 80, y0 + 80, { size: 15, tailX: (x0 + x1) / 2 - 140, tailY: y0 + 40 });
  umpire(ctx, g, (x0 + x1) / 2 + 150, y1 - 22, { fx: 0, fy: -1, R: 15, call: null });
  label(ctx, '심판 두 명이 코트를 반씩', (x0 + x1) / 2 + 120, y1 - 70, { size: 13, bg: 'rgba(255,255,255,0.8)' });
  arrow(ctx, x0 + 40, y0 + 22, (x0 + x1) / 2 - 180, y0 + 22, { color: hex(THEME.ink), width: 2, dash: [6, 5], head: 8 });
  arrow(ctx, (x0 + x1) / 2 + 180, y1 - 22, x1 - 40, y1 - 22, { color: hex(THEME.ink), width: 2, dash: [6, 5], head: 8 });
  ['① 휘슬', '② 반칙 이름', '③ 수신호', '④ 다시 할 곳'].forEach((t, i) => card(ctx, 70 + i * 150, 150, 132, 52, t, { size: 15, bg: '#fffdf6' }));
}

/** Rule 5: 기록원 */
function scorer(ctx, g) {
  ctx.fillStyle = '#f4efe1';
  ctx.fillRect(0, 0, W, H);
  card(ctx, 250, 40, 260, 280, '', { bg: '#ffffff' });
  ctx.fillStyle = '#cfc6ad';
  ctx.fillRect(345, 30, 70, 22);
  const rows = [['골', '●  ●  ●'], ['빗나간 슛', '○  ○'], ['다음 센터 패스', '파랑 팀']];
  rows.forEach(([a, b], i) => {
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = hex(THEME.ink);
    ctx.fillText(a, 275, 110 + i * 70);
    ctx.textAlign = 'right';
    ctx.fillStyle = i === 2 ? hex(THEME.cue) : hex(THEME.goalRing);
    ctx.fillText(b, 490, 110 + i * 70);
    ctx.strokeStyle = '#e4dcc6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(270, 135 + i * 70);
    ctx.lineTo(490, 135 + i * 70);
    ctx.stroke();
  });
  caterpillar(g, 170, 200, { R: 24, fx: 1, fy: -0.2, look: UMPIRE });
  label(ctx, '기록원', 150, 260, { size: 15 });
  caterpillar(g, 600, 160, { R: 20, fx: -1, fy: 0, look: UMPIRE, segs: 2 });
  label(ctx, '⏱️ 계시원', 610, 215, { size: 14 });
}

/** Rule 6: 프리 패스로는 슛 금지 */
function freePass(ctx, g) {
  const P = courtView(ctx, GOAL_END);
  const [rx, ry] = P(30.16, 7.625);
  holder(g, 470, 160, { fx: 1, fy: 0.1 });
  bib(ctx, 'GA', 470, 205);
  arrow(ctx, 500, 150, rx - 14, ry - 8, { color: hex(THEME.danger), width: 3, dash: [7, 6], bend: -30 });
  verdict(ctx, 590, 110, false, 20);
  caterpillar(g, 300, 260, { R: 17, fx: -1, fy: 0.2, segs: 2 });
  bib(ctx, 'WA', 300, 295);
  arrow(ctx, 450, 185, 330, 250, { color: hex(THEME.good), width: 4 });
  verdict(ctx, 380, 255, true, 18);
  label(ctx, '프리 패스 → 슛은 안 돼요, 패스!', 220, 50, { size: 16 });
}

/** Rule 6: 페널티 패스 때 반칙한 선수는 옆에 비켜서기 */
function penaltyAside(ctx, g) {
  courtView(ctx, CENTRE);
  holder(g, 330, 190, { fx: 1, fy: 0 });
  ghost(g, 330, 120, { R: 18, lx: 0, ly: 1, color: THEME.oppOut });
  label(ctx, '반칙한 선수: 옆에서 꼼짝 마', 330, 70, { size: 14 });
  caterpillar(g, 560, 160, { R: 17, fx: -1, fy: 0.3, segs: 2 });
  arrow(ctx, 365, 190, 530, 165, { color: hex(THEME.good), width: 4 });
  label(ctx, '페널티 패스', 450, 220, { size: 14, color: hex(THEME.good) });
  ghost(g, 610, 260, { R: 16, lx: -1, ly: -0.5 });
}

/** Rule 6 · 15: 스로인 */
function throwIn(ctx, g) {
  const P = courtView(ctx, SIDELINE);
  const [, ly] = P(0, 15.25);
  foot(ctx, 330, ly + 12, hex(THEME.snakeHead), 0);
  label(ctx, '한 발은 라인 가까이 (15cm 안)', 500, ly + 40, { size: 13 });
  holder(g, 330, ly + 34, { fx: 0, fy: -1, R: 17 });
  caterpillar(g, 420, ly - 130, { R: 17, fx: -0.4, fy: 1, segs: 2 });
  arrow(ctx, 335, ly - 10, 410, ly - 100, { color: hex(THEME.good), width: 4 });
  ghost(g, 230, ly - 110, { R: 16, lx: 1, ly: 1 });
  label(ctx, '공이 나간 곳에서 스로인', 200, 40, { size: 16 });
  label(ctx, '코트 밖', 80, ly + 40, { size: 12, bg: 'rgba(255,255,255,0.7)' });
}

/** Rule 7: 어드밴티지 */
function advantage(ctx, g) {
  const P = courtView(ctx, GOAL_END);
  ghost(g, 260, 190, { R: 17, lx: 1, ly: 0, color: THEME.oppOut });
  bump(ctx, 290, 175, 18);
  holder(g, 420, 170, { fx: 1, fy: 0.05 });
  arrow(ctx, 450, 175, 560, 175, { color: hex(THEME.good), width: 4, dash: [8, 6] });
  void P;
  const by = 330;
  caterpillar(g, 150, by - 20, { R: 16, fx: 1, fy: -1, look: UMPIRE, segs: 2, open: true });
  bubble(ctx, '어드밴티지!', 200, by - 85, { size: 16, tailX: 165, tailY: by - 45 });
  ctx.strokeStyle = hex(UMPIRE.color);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(165, by - 30);
  ctx.lineTo(220, by - 50);
  ctx.stroke();
  ctx.lineCap = 'butt';
  label(ctx, '반칙 당했지만 더 좋은 기회 → 계속!', 360, 40, { size: 15 });
}

/** Rule 8: 센터 패스 */
function centrePass(ctx, g) {
  const P = courtView(ctx, CENTRE);
  const [cx, cy] = P(15.25, 7.625);
  holder(g, cx, cy, { fx: 1, fy: 0.2, R: 16 });
  bib(ctx, 'C', cx, cy + 34, 'centre');
  ghost(g, cx + 60, cy - 70, { R: 16, lx: -1, ly: 0.5 });
  const [tx] = P(20.33, 0);
  caterpillar(g, tx + 40, 110, { R: 16, fx: -1, fy: 0.3, segs: 2 });
  bib(ctx, 'WA', tx + 40, 145);
  arrow(ctx, tx + 20, 115, tx - 50, 140, { color: hex(THEME.cue), width: 3, dash: [6, 5], head: 9 });
  arrow(ctx, cx + 30, cy - 10, tx - 50, 150, { color: hex(THEME.good), width: 4, bend: -20 });
  label(ctx, '한 발 이상은 센터 서클 안', cx, cy + 75, { size: 14 });
  label(ctx, '휘슬 뒤 3초 안에 패스', W / 2, 40, { size: 16 });
}

/** Rule 8: 휘슬 전에 센터 서드로 들어가면 브레이킹 */
function breaking(ctx, g) {
  const P = courtView(ctx, CENTRE);
  const [cx, cy] = P(15.25, 7.625);
  holder(g, cx, cy, { fx: 1, fy: 0, R: 15 });
  bib(ctx, 'C', cx, cy + 32, 'centre');
  const [tx] = P(20.33, 0);
  caterpillar(g, tx - 22, 110, { R: 17, fx: -1, fy: 0 });
  bib(ctx, 'WA', tx + 30, 80);
  verdict(ctx, tx - 22, 60, false, 20);
  caterpillar(g, tx + 30, 260, { R: 16, fx: -1, fy: 0, segs: 2 });
  bib(ctx, 'GA', tx + 30, 296);
  verdict(ctx, tx + 75, 260, true, 16);
  label(ctx, '휘슬 전에 센터 서드 들어가기 → 브레이킹 반칙', 280, 330, { size: 14 });
}

/** Rule 9: 골 서클 안에서 슛 = 골 */
function goalShot(ctx, g, { inside = true, touched = false } = {}) {
  const P = courtView(ctx, GOAL_END);
  const [rx, ry] = P(30.16, 7.625);
  const [cx] = P(30.5 - 4.9, 0);
  const sx = inside ? cx + 70 : cx - 40;
  holder(g, sx, 200, { fx: 1, fy: -0.3 });
  bib(ctx, inside ? 'GS' : 'GA', sx, 245);
  arrow(ctx, sx + 30, 185, rx - 6, ry - 6, { color: inside ? hex(THEME.good) : hex(THEME.danger), width: 3.5, dash: [8, 6], bend: 60 });
  if (touched) {
    ghost(g, sx + 100, 110, { R: 16, lx: 0, ly: 1 });
    ctx.strokeStyle = hex(THEME.opp);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx + 110, 120);
    ctx.lineTo(sx + 130, 135);
    ctx.stroke();
    ctx.lineCap = 'butt';
    bump(ctx, sx + 135, 140, 14);
  }
  if (!inside) {
    foot(ctx, sx - 10, 270, 'rgba(217,100,100,0.6)', 0.1);
    label(ctx, '골 서클 밖', sx - 10, 310, { size: 13, color: hex(THEME.danger) });
  }
  drawBall(graphics(ctx), rx, ry, 8, 0);
  verdict(ctx, rx - 40, ry - 60, inside, 22);
  label(ctx, inside ? (touched ? '수비가 건드려도 들어가면 골!' : '골 서클 안에서 쏘면 골!') : '밖을 밟고 쏜 슛은 골 아님', 230, 40, { size: 16 });
}
const goalIn = (ctx, g) => goalShot(ctx, g, { inside: true });
const goalOut = (ctx, g) => goalShot(ctx, g, { inside: false });
const goalTouched = (ctx, g) => goalShot(ctx, g, { inside: true, touched: true });

/** Rule 10: 골 직후 교체 */
function subs(ctx, g) {
  const P = courtView(ctx, SIDELINE);
  const [, ly] = P(0, 15.25);
  caterpillar(g, 300, ly - 50, { R: 17, fx: 0, fy: 1, segs: 2 });
  arrow(ctx, 300, ly - 25, 300, ly + 40, { color: hex(THEME.danger), width: 4, head: 10 });
  caterpillar(g, 400, ly + 50, { R: 17, fx: 0, fy: -1, segs: 2, look: { ...TEAM, color: THEME.sub } });
  arrow(ctx, 400, ly + 25, 400, ly - 40, { color: hex(THEME.good), width: 4, head: 10 });
  label(ctx, '골 직후 · 쉬는 시간 · 부상 때 교체', W / 2, 40, { size: 16 });
  label(ctx, '횟수 제한 없음!', W / 2, 80, { size: 14, color: hex(THEME.good) });
}

/** Rule 11: 3초 안에 패스 */
function held3s(ctx, g) {
  courtView(ctx, CENTRE);
  holder(g, 260, 200, { fx: 1, fy: 0 });
  ['1', '2', '3'].forEach((t, i) => {
    ctx.fillStyle = i === 2 ? hex(THEME.danger) : '#ffffff';
    ctx.strokeStyle = hex(THEME.ink);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(200 + i * 55, 110, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 2 ? '#ffffff' : hex(THEME.ink);
    ctx.font = `bold 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 200 + i * 55, 111);
  });
  label(ctx, '초 안에!', 395, 110, { size: 15 });
  caterpillar(g, 540, 200, { R: 17, fx: -1, fy: 0, segs: 2 });
  arrow(ctx, 295, 200, 510, 200, { color: hex(THEME.good), width: 4 });
  verdict(ctx, 410, 240, true, 18);
  label(ctx, '공을 잡으면 3초 안에 패스나 슛', W / 2, 320, { size: 15 });
}

/** Rule 11: 놓은 공을 혼자 다시 잡기 금지 */
function replay(ctx, g) {
  courtView(ctx, CENTRE);
  caterpillar(g, 330, 245, { R: 20, fx: 0, fy: -1, look: ME });
  ctx.strokeStyle = hex(THEME.danger);
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.ellipse(330, 165, 26, 62, 0, Math.PI * 0.6, Math.PI * 2.4);
  ctx.stroke();
  ctx.setLineDash([]);
  drawBall(g, 330, 104, 10, 0.5);
  verdict(ctx, 400, 140, false, 22);
  label(ctx, '던져 놓고 혼자 다시 잡기 ✗', W / 2, 40, { size: 16 });
  label(ctx, '다른 선수나 골대에 닿은 뒤면 OK', W / 2, 320, { size: 14, color: hex(THEME.good) });
}

/** Rule 12: 한 서드를 건너뛰는 패스 */
function overThird(ctx, g) {
  const P = courtView(ctx);
  const [ax, ay] = P(7, 10);
  const [bx, by] = P(23.5, 5);
  holder(g, ax, ay, { fx: 1, fy: -0.3, R: 15 });
  caterpillar(g, bx, by, { R: 15, fx: -1, fy: 0.3, segs: 2 });
  arrow(ctx, ax + 20, ay - 10, bx - 22, by + 6, { color: hex(THEME.danger), width: 4, dash: [9, 6], bend: 70 });
  const [cx, cy] = P(15.25, 7.6);
  label(ctx, '센터 서드에서 아무도 안 잡음', cx, cy + 90, { size: 14, color: hex(THEME.danger) });
  verdict(ctx, cx, cy - 10, false, 24);
}

/** Rule 12: 숏 패스 */
function shortPass(ctx, g) {
  courtView(ctx, CENTRE);
  holder(g, 300, 190, { fx: 1, fy: 0 });
  caterpillar(g, 375, 190, { R: 18, fx: -1, fy: 0, segs: 2 });
  ghost(g, 340, 100, { R: 16, lx: 0, ly: 1 });
  bubble(ctx, '끼어들 틈이 없어!', 450, 80, { size: 14, tailX: 360, tailY: 95 });
  verdict(ctx, 337, 260, false, 22);
  label(ctx, '상대가 가로챌 수 있는 거리에서 패스해요', W / 2, 325, { size: 14 });
}

/** Rule 13: 착지 발 · 디딤 · 피벗 */
function footOk(ctx, g) {
  courtView(ctx, CENTRE);
  foot(ctx, 280, 200, hex(THEME.snakeHead), -0.15);
  label(ctx, '① 착지 발', 280, 245, { size: 13 });
  foot(ctx, 360, 165, hex(THEME.pass), 0.25);
  label(ctx, '② 다른 발 디딤', 380, 120, { size: 13 });
  ctx.strokeStyle = hex(THEME.good);
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(280, 200, 48, Math.PI * 0.9, Math.PI * 2.1);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, '③ 착지 발로 피벗', 180, 140, { size: 13 });
  holder(g, 520, 190, { fx: -1, fy: 0, R: 18 });
  verdict(ctx, 600, 120, true, 22);
}

/** Rule 13: 깡충 · 끌기 */
function footBad(ctx) {
  courtView(ctx, CENTRE);
  foot(ctx, 230, 210, hex(THEME.snakeHead), -0.1);
  ctx.strokeStyle = 'rgba(217,100,100,0.6)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(230, 232);
  ctx.lineTo(300, 240);
  ctx.stroke();
  foot(ctx, 310, 238, 'rgba(224,122,79,0.5)', 0.1);
  label(ctx, '착지 발 끌기', 270, 290, { size: 14 });
  foot(ctx, 450, 230, hex(THEME.snakeHead), 0);
  arrow(ctx, 455, 205, 545, 205, { color: hex(THEME.danger), width: 3, bend: -50, head: 10 });
  foot(ctx, 550, 230, 'rgba(224,122,79,0.5)', 0);
  label(ctx, '깡충 뛰기', 500, 290, { size: 14 });
  verdict(ctx, 270, 120, false, 22);
  verdict(ctx, 500, 120, false, 22);
  label(ctx, '풋워크 반칙 → 프리 패스', W / 2, 40, { size: 16 });
}

/** Rule 14: 오프사이드 */
function offside(ctx, g) {
  const P = courtView(ctx, { ...CENTRE, forbid: [20.33, 31] });
  const [lx] = P(20.33, 0);
  caterpillar(g, lx + 40, 180, { R: 22, fx: 1, fy: 0 });
  bib(ctx, 'WD', lx - 30, 140, 'defence');
  ctx.strokeStyle = hex(THEME.offside);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(lx, 20);
  ctx.lineTo(lx, H - 20);
  ctx.stroke();
  verdict(ctx, lx + 40, 110, false, 22);
  label(ctx, '공을 안 건드려도 오프사이드 → 프리 패스', W / 2, 325, { size: 14 });
  label(ctx, 'WD는 골 서드에 못 들어가요', lx - 140, 50, { size: 14, bg: 'rgba(255,255,255,0.9)' });
}

/** Rule 15: 선 위에 떨어진 공은 인 */
function ballOnLine(ctx, g) {
  const P = courtView(ctx, SIDELINE);
  const [, ly] = P(0, 15.25);
  drawBall(g, 330, ly, 11, 0.4);
  ctx.strokeStyle = hex(THEME.cue);
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(330, ly, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  verdict(ctx, 390, ly - 40, true, 20);
  caterpillar(g, 240, ly - 120, { R: 16, fx: 1, fy: 1 });
  ghost(g, 440, ly - 110, { R: 16, lx: -1, ly: 1 });
  label(ctx, '선 위에 떨어진 공 = 아직 코트 안!', W / 2, 40, { size: 16 });
}

/** Rule 15: 뛰어올라 밖에 떨어지기 전에 패스 */
function jumpPass(ctx, g) {
  const P = courtView(ctx, SIDELINE);
  const [, ly] = P(0, 15.25);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(320, ly + 40, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  holder(g, 320, ly - 10, { fx: 0.3, fy: -1, R: 18 });
  arrow(ctx, 300, ly - 60, 300, ly + 25, { color: hex(THEME.ink), width: 2, dash: [5, 5], head: 8 });
  caterpillar(g, 470, ly - 160, { R: 16, fx: -1, fy: 1, segs: 2 });
  arrow(ctx, 335, ly - 40, 450, ly - 140, { color: hex(THEME.good), width: 4 });
  verdict(ctx, 420, ly - 60, true, 18);
  label(ctx, '착지하기 전에 패스하면 OK', W / 2, 40, { size: 16 });
}

/** Rule 16: 0.9m */
function distance(ctx, g, ok) {
  courtView(ctx, CENTRE);
  holder(g, 250, 200, { fx: 1, fy: 0 });
  foot(ctx, 250, 245, hex(THEME.snakeHead), 0);
  const gx = ok ? 470 : 380;
  ghost(g, gx, 200, { R: 19, lx: -1, ly: 0 });
  if (!ok) arms(ctx, gx, 200, 19);
  else {
    ctx.strokeStyle = hex(THEME.opp);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx - 5, 185);
    ctx.lineTo(gx - 10, 140);
    ctx.moveTo(gx + 5, 185);
    ctx.lineTo(gx + 12, 140);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  measure(ctx, 250, 290, gx - 10, 290, ok ? '0.9m 이상' : '0.9m 안!', ok);
  verdict(ctx, gx + 60, 120, ok, 22);
  label(ctx, ok ? '0.9m 떨어져서 팔 들기 OK' : '가까이서 팔 뻗어 막기 → 장애 반칙, 페널티 패스', W / 2, 40, { size: 15 });
}
const distOk = (ctx, g) => distance(ctx, g, true);
const distBad = (ctx, g) => distance(ctx, g, false);

/** Rule 17: 접촉 */
function contact(ctx, g) {
  courtView(ctx, CENTRE);
  holder(g, 330, 190, { fx: 1, fy: 0 });
  ghost(g, 300, 150, { R: 19, lx: 1, ly: 1 });
  bump(ctx, 318, 168, 26);
  umpire(ctx, g, 560, 260, { fx: -1, fy: -0.5, R: 16, call: '삐익! 접촉 반칙' });
  label(ctx, '밀기 · 잡기 · 기대기 → 페널티 패스', W / 2, 40, { size: 16 });
}

/** Rule 18: 단계별 조치 */
function sanctions(ctx, g) {
  ctx.fillStyle = '#f4efe1';
  ctx.fillRect(0, 0, W, H);
  const steps = [['말로 주의', '#ffffff'], ['패스 자리\n앞당기기', '#ffffff'], ['경고', '#fff3c4'], ['일시 퇴장\n2분', '#ffd9b8'], ['퇴장', '#f6b8b8']];
  steps.forEach(([t, bg], i) => {
    card(ctx, 30 + i * 136, 150, 118, 76, t, { bg, size: 15 });
    if (i < steps.length - 1) arrow(ctx, 30 + i * 136 + 120, 188, 30 + (i + 1) * 136 - 4, 188, { width: 2.5, head: 8 });
  });
  umpire(ctx, g, 110, 280, { fx: 1, fy: 0, R: 18, call: null });
  label(ctx, '심각하면 바로 높은 단계도 가능', 420, 285, { size: 14 });
  label(ctx, '심판의 경기 관리 단계', W / 2, 60, { size: 17 });
}

/** Rule 19: 항의 */
function dissent(ctx, g) {
  courtView(ctx, CENTRE);
  ghost(g, 290, 200, { R: 20, lx: 1, ly: 0 });
  bubble(ctx, '그게 왜 반칙이에요?!', 260, 110, { size: 15, tailX: 285, tailY: 170 });
  umpire(ctx, g, 470, 210, { fx: -1, fy: 0, R: 18, call: null });
  bubble(ctx, '페널티 패스, 자리 앞당김!', 520, 120, { size: 15, tailX: 480, tailY: 180 });
  verdict(ctx, 370, 280, false, 20);
  label(ctx, '판정에 항의 = 불공정 플레이', W / 2, 330, { size: 14 });
}

/** Rule 20: 동시에 잡기 → 포제션 */
function together(ctx, g) {
  courtView(ctx, CENTRE);
  caterpillar(g, 300, 200, { R: 19, fx: 1, fy: 0, look: ME });
  ghost(g, 420, 200, { R: 19, lx: -1, ly: 0 });
  drawBall(g, 360, 200, 11, 0.2);
  bump(ctx, 360, 200, 30);
  label(ctx, '동시에 잡았다!', 360, 120, { size: 16 });
  card(ctx, 230, 260, 260, 56, '바로 전에 공 가진 팀 공\n(포제션)', { size: 14, bg: '#fffdf6' });
  label(ctx, '동시 반칙', W / 2, 40, { size: 15 });
}

/** Rule 21: 다른 수준의 경기 */
function kids(ctx, g) {
  courtView(ctx, GOAL_END);
  caterpillar(g, 330, 190, { R: 13, fx: 1, fy: 0, look: ME, segs: 2 });
  drawBall(g, 350, 190, 5, 0);
  caterpillar(g, 260, 260, { R: 12, fx: 1, fy: -0.4, segs: 2 });
  card(ctx, 440, 70, 230, 60, '낮은 골대 · 작은 공', { size: 16, bg: '#fffdf6' });
  label(ctx, '어린이 · 다른 수준 경기는 바꿔서 해도 돼요', W / 2, 325, { size: 14 });
}

export const SCENES = {
  courtMap, onLine, quarters, team, umpires, scorer, freePass, penaltyAside, throwIn, advantage, centrePass, breaking,
  goalIn, goalOut, goalTouched, subs, held3s, replay, overThird, shortPass, footOk, footBad, offside, ballOnLine,
  jumpPass, distOk, distBad, contact, sanctions, dissent, together, kids,
};

/** 장면을 그린다 (그릴 장면이 없으면 false) */
export function drawRuleScene(canvas, name) {
  const scene = SCENES[name];
  if (!scene) return false;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  scene(ctx, graphics(ctx));
  // 테두리 + 사이트 이름 (공유 그림에도 남게)
  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(58,58,54,0.5)';
  ctx.fillText('🏐 Netter', W - 12, H - 10);
  return true;
}

/**
 * 글꼴을 먼저 받아 두고 그린다: 캔버스 글씨는 아직 안 받은 글꼴을 기다려 주지 않으므로,
 * 한 번 몰래 그려서 쓰인 글자를 모은 뒤 그 글자의 글꼴(보통 · 굵게)을 받고 진짜로 그린다 (느리면 1.5초 뒤 그냥).
 */
export async function drawRuleSceneReady(canvas, name) {
  if (!SCENES[name]) return false;
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  const used = [];
  const fill = pctx.fillText.bind(pctx);
  pctx.fillText = (t, ...rest) => {
    used.push(String(t));
    return fill(t, ...rest);
  };
  drawRuleScene(probe, name);
  const chars = [...new Set(used.join(''))].join('');
  if (document.fonts?.load && chars) {
    await Promise.race([
      Promise.all([document.fonts.load(`700 16px ${FONT}`, chars), document.fonts.load(`400 16px ${FONT}`, chars)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]).catch(() => {});
  }
  return drawRuleScene(canvas, name);
}
