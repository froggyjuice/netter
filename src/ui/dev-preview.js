// 개발 중인 게임의 미리보기(예상 화면). 실제 게임이 아니라 계획을 보여주는 그림이다.
// 게임 캐릭터(애벌레 · 유령 · 공)는 shared/sprites.js 를 캔버스 2D로 그대로 쓴다.
import { THEME, hex, FONT } from '../shared/theme.js';
import { drawFace, drawGhost, drawBall } from '../shared/sprites.js';
import { W, H, graphics, label } from './canvas-kit.js';

/** 코트 일부(가로 x0~x1 칸, 1칸 = cell px): 바탕 · 서드 선 · 골 서클 */
function court(ctx, { cell = 24, x0 = 0, showGoal = true } = {}) {
  ctx.fillStyle = hex(THEME.allowed);
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (const t of [10, 20]) {
    const x = (t - x0) * cell;
    if (x > 0 && x < W) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
  }
  if (showGoal) {
    const gx = (30 - x0) * cell;
    ctx.fillStyle = hex(THEME.goalZone);
    ctx.beginPath();
    ctx.arc(gx, H / 2, 4.9 * cell, Math.PI / 2, Math.PI * 1.5);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

/** 화면 아래 선택 버튼 줄 (게임에서 고를 것) */
function choices(ctx, items, y, hot = -1) {
  const gap = 8;
  ctx.font = `bold 14px ${FONT}`;
  const widths = items.map((t) => ctx.measureText(t).width + 22);
  let x = (W - widths.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2;
  items.forEach((t, i) => {
    ctx.fillStyle = i === hot ? hex(THEME.hot) : '#ffffff';
    ctx.strokeStyle = i === hot ? hex(THEME.goalRing) : '#c9d8c6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - 16, widths[i], 32, 10);
    else ctx.rect(x, y - 16, widths[i], 32);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hex(THEME.ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x + widths[i] / 2, y + 1);
    x += widths[i] + gap;
  });
}

const me = (g, x, y, R = 16, fx = 1, fy = 0) => drawFace(g, x, y, R, fx, fy, 1000, { color: THEME.pass, mouth: 0x0b2e6b, open: true });

/** 휘슬을 불어라: 접촉 장면 → 휘슬 → 판정 고르기 */
function whistle(ctx, g) {
  court(ctx, { cell: 36, x0: 10 });
  // 공을 가진 우리 선수(파랑)에게 상대(보라)가 부딪힘
  me(g, 330, 160, 20, 1, 0);
  drawBall(g, 352, 160, 8, 0);
  drawGhost(g, 372, 168, 20, -1, 0, THEME.opp);
  ctx.strokeStyle = hex(THEME.danger);
  ctx.lineWidth = 3;
  for (const [dx, dy] of [[-10, -32], [6, -36], [20, -30]]) {
    ctx.beginPath();
    ctx.moveTo(352 + dx, 140 + dy / 3);
    ctx.lineTo(352 + dx * 1.4, 140 + dy);
    ctx.stroke();
  }
  me(g, 520, 90, 15, -1, 0);
  drawGhost(g, 200, 250, 15, 1, 0, THEME.opp);
  label(ctx, '📣 삐익! 무슨 반칙일까?', W / 2, 40, { size: 18 });
  label(ctx, '⏱️ 3', W - 60, 40, { size: 16 });
  choices(ctx, ['프리 패스', '페널티 패스', '스로인', '포제션', '플레이 온', '반칙 아님'], H - 70, 1);
  label(ctx, '정답! 접촉 → 상대에게 페널티 패스 · 다음: 어디서 다시 할까?', W / 2, H - 28, { size: 13, color: '#4a8559' });
}

/** 라인 저지 & 스로인: 사이드라인 근처의 공 → 인/아웃 → 스로인 */
function throwin(ctx, g) {
  court(ctx, { cell: 36, x0: 14, showGoal: false });
  // 아래쪽 사이드라인 바깥(코트 밖) 띠
  ctx.fillStyle = '#e9e4d4';
  ctx.fillRect(0, H - 70, W, 70);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, H - 70);
  ctx.lineTo(W, H - 70);
  ctx.stroke();
  label(ctx, '사이드라인', 70, H - 86, { size: 12, bg: 'rgba(255,255,255,0.75)' });
  // 라인 위에 떨어지는 공 (확대 원)
  drawBall(g, 330, H - 70, 10, 0.4);
  ctx.strokeStyle = hex(THEME.cue);
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(330, H - 70, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  me(g, 250, 170, 16, 1, 1);
  drawGhost(g, 420, 190, 16, -1, 1, THEME.opp);
  // 던질 선수 자리 (라인 밖)
  ctx.strokeStyle = hex(THEME.good);
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(500, H - 60, 44, 44);
  ctx.setLineDash([]);
  label(ctx, '스로인 자리?', 522, H - 26, { size: 12 });
  label(ctx, '🚩 공이 선 위에 떨어졌어요. 인일까, 아웃일까?', W / 2, 40, { size: 17 });
  choices(ctx, ['✅ 인 (계속)', '🚩 아웃'], 100, 0);
  label(ctx, '선 위에 떨어진 공은 아직 코트 안! (Rule 15)', W / 2, 150, { size: 13, color: '#4a8559' });
}

/** 스텝 마스터: 발자국 퍼즐 + 동작 카드 */
function steps(ctx, g) {
  ctx.fillStyle = hex(THEME.allowed);
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  const foot = (x, y, color, rot = 0, text = '') => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (text) label(ctx, text, x, y + 38, { size: 12 });
  };
  // 착지 발(주황) · 디딘 발(파랑) · 반칙(빨강 X)
  foot(250, 170, hex(THEME.snakeHead), -0.15, '① 착지 발');
  foot(320, 150, hex(THEME.pass), 0.2, '② 디딤 OK');
  foot(250, 250, 'rgba(217,100,100,0.55)', -0.15, '③ 착지 발 다시 딛기?');
  ctx.strokeStyle = hex(THEME.danger);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(236, 234);
  ctx.lineTo(264, 266);
  ctx.moveTo(264, 234);
  ctx.lineTo(236, 266);
  ctx.stroke();
  me(g, 160, 120, 18, 1, 0.3);
  drawBall(g, 182, 128, 8, 0);
  label(ctx, '👣 한 발 착지! 다음에 할 수 있는 동작은?', W / 2, 40, { size: 17 });
  // 오른쪽 동작 카드
  const cards = [['🦶 다른 발 디디기', true], ['🔄 착지 발로 피벗', true], ['🐇 깡충 뛰기', false], ['🦵 착지 발 끌기', false]];
  cards.forEach(([t, ok], i) => {
    const y = 110 + i * 56;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = ok ? hex(THEME.good) : hex(THEME.danger);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(440, y - 20, 230, 40, 10);
    else ctx.rect(440, y - 20, 230, 40);
    ctx.fill();
    ctx.stroke();
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = hex(THEME.ink);
    ctx.fillText(t, 456, y + 1);
    ctx.textAlign = 'right';
    ctx.fillText(ok ? '⭕' : '❌', 658, y + 1);
  });
}

const SCENES = { whistle, throwin, steps };

/** 개발 중인 게임 미리보기를 그린다. 그릴 장면이 없으면 false */
export function drawDevPreview(canvas, id) {
  const scene = SCENES[id];
  if (!scene) return false;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  scene(ctx, graphics(ctx));
  // '예상 화면' 표시
  ctx.save();
  ctx.translate(W - 70, H - 18);
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(58,58,54,0.45)';
  ctx.fillText('예상 화면 · 개발 중', 0, 0);
  ctx.restore();
  return true;
}
