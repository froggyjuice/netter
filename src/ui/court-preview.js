// 포지션을 고를 때 보여주는 미니 코트: 갈 수 있는 구역은 밝게, 갈 수 없는 구역은 빗금으로 표시
// orientation 'portrait' 이면 게임 화면과 똑같이 세로로(공격 방향이 위) 그린다.
import { COURT, ZONE_NAMES, isAllowed, zoneOf } from '../shared/zones.js';
import { cellColor } from '../shared/court-colors.js';
import { THEME, hex, FONT } from '../shared/theme.js';
import { zoneEdges, offsideEdges, ZONE_LABELS, CENTRE_CIRCLE } from '../shared/court-geometry.js';
import { createView } from '../shared/view-transform.js';

// 우리 골 서클(1구역) 칸: 반짝임에 쓴다
const OUR_CIRCLE = [];
for (let r = 0; r < COURT.rows; r++) for (let c = 0; c < COURT.cols; c++) if (zoneOf(c, r) === 1) OUR_CIRCLE.push({ c, r });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * 우리 골(우리가 슛하는 골)을 반짝이게: 골 서클 칸을 금빛으로 덮었다 걷고, 링이 커졌다 작아진다 + '우리 골' 글씨.
 * 게임 화면(snake.js drawOurGoal)과 같은 효과. t: 시각(ms)
 */
export function drawGoalGlow(ctx, orientation, t, cell = 24) {
  const view = createView(orientation);
  const at = (x, y) => {
    const s = view.toScreen(x, y);
    return [s.x * cell, s.y * cell];
  };
  const pulse = reduceMotion.matches ? 0.6 : 0.5 + 0.5 * Math.sin(t / 260);
  ctx.save();
  ctx.fillStyle = hex(THEME.hot);
  ctx.globalAlpha = 0.08 + 0.22 * pulse;
  for (const { c, r } of OUR_CIRCLE) {
    const o = view.cellOrigin(c, r);
    ctx.fillRect(o.x * cell, o.y * cell, cell, cell);
  }
  const [rx, ry] = at(COURT.cols - 0.6, COURT.rows / 2);
  const rr = cell * (0.75 + 0.25 * pulse);
  ctx.globalAlpha = 0.25 + 0.35 * pulse;
  ctx.beginPath();
  ctx.arc(rx, ry, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = hex(THEME.goalRing);
  ctx.lineWidth = 3;
  ctx.stroke();
  const [lx, ly] = at(COURT.cols - 1.9, COURT.rows / 2 - 2.9); // 링 위쪽 (1구역 숫자 · 이름과 겹치지 않게)
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.font = `bold ${Math.round(cell * 0.8)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('우리 골', lx, ly);
  ctx.fillStyle = '#7a5a00';
  ctx.fillText('우리 골', lx, ly);
  ctx.restore();
}

/**
 * 미니 코트를 그린다. 화면에 붙어 있는 캔버스면 우리 골 반짝임까지 계속 그린다(화면에서 빠지거나 다시 그리면 멈춤).
 * 맛보기처럼 바탕만 필요한 캔버스(화면 밖)는 바탕만 그린다.
 */
export function drawCourtPreview(canvas, position, orientation = 'landscape') {
  cancelAnimationFrame(canvas._glowRaf ?? 0);
  drawCourtBase(canvas, position, orientation);
  if (!canvas.isConnected) return;
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  base.getContext('2d').drawImage(canvas, 0, 0);
  const ctx = canvas.getContext('2d');
  const frame = (t) => {
    if (!canvas.isConnected) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    drawGoalGlow(ctx, orientation, t);
    if (!reduceMotion.matches) canvas._glowRaf = requestAnimationFrame(frame);
  };
  frame(performance.now());
}

function drawCourtBase(canvas, position, orientation) {
  const view = createView(orientation);
  const cell = 24; // 캔버스 해상도 (CSS로 크기 조절)
  canvas.width = view.cols * cell;
  canvas.height = view.rows * cell;
  const ctx = canvas.getContext('2d');
  const at = (x, y) => {
    const s = view.toScreen(x, y);
    return [s.x * cell, s.y * cell];
  };

  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const o = view.cellOrigin(c, r);
      const ok = isAllowed(position, c, r);
      ctx.fillStyle = hex(cellColor(position, c, r, ok));
      ctx.fillRect(o.x * cell, o.y * cell, cell, cell);
    }
  }

  // 갈 수 없는 구역 빗금 (색만으로 구분하지 않도록)
  ctx.strokeStyle = hex(THEME.hatch);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      if (isAllowed(position, c, r)) continue;
      const o = view.cellOrigin(c, r);
      ctx.moveTo(o.x * cell + 4, (o.y + 1) * cell - 4);
      ctx.lineTo((o.x + 1) * cell - 4, o.y * cell + 4);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  const strokeEdges = (edges, color, width) => {
    ctx.strokeStyle = hex(color);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of edges) {
      ctx.moveTo(...at(x1, y1));
      ctx.lineTo(...at(x2, y2));
    }
    ctx.stroke();
  };
  strokeEdges(zoneEdges(), THEME.line, 3);
  ctx.beginPath();
  ctx.arc(...at(CENTRE_CIRCLE.c, CENTRE_CIRCLE.r), CENTRE_CIRCLE.radius * cell, 0, Math.PI * 2);
  ctx.stroke();
  // 오프사이드 경계 (게임 화면과 같은 빨간 선)
  strokeEdges(offsideEdges(position), THEME.offside, 4);

  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  // 골대 링
  ctx.lineWidth = 3;
  for (const [lineX, ringX] of [[0, 0.6], [COURT.cols, COURT.cols - 0.6]]) {
    ctx.strokeStyle = hex(THEME.goalRing);
    ctx.beginPath();
    ctx.moveTo(...at(lineX, COURT.rows / 2));
    ctx.lineTo(...at(ringX, COURT.rows / 2));
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(...at(ringX, COURT.rows / 2), cell * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = hex(THEME.ink);
  ctx.globalAlpha = 0.32;
  ctx.font = `bold ${cell * 1.8}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of ZONE_LABELS) ctx.fillText(String(l.zone), ...at(l.c, l.r));
  ctx.globalAlpha = 1;

  // 구역 이름 (숫자 아래) · 센터 서클 이름
  ctx.font = `bold ${cell * 0.92}px ${FONT}`;
  ctx.fillStyle = hex(THEME.ink);
  ctx.globalAlpha = 0.7;
  // 화면에서 '아래쪽'으로 d칸: 가로 코트는 폭 방향(+y), 세로 코트는 길이 방향(−x)
  const below = (x, y, d) => (view.orientation === 'portrait' ? at(x - d, y) : at(x, y + d));
  for (const l of ZONE_LABELS) ctx.fillText(ZONE_NAMES[l.zone], ...below(l.c, l.r, 1.75));
  ctx.fillText('센터 서클', ...below(CENTRE_CIRCLE.c, CENTRE_CIRCLE.r, 1.3));
  ctx.globalAlpha = 1;
}
