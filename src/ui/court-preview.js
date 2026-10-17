// 포지션을 고를 때 보여주는 미니 코트: 갈 수 있는 구역은 밝게, 갈 수 없는 구역은 빗금으로 표시
// orientation 'portrait' 이면 게임 화면과 똑같이 세로로(공격 방향이 위) 그린다.
import { COURT, ZONE_NAMES, isAllowed } from '../shared/zones.js';
import { cellColor } from '../shared/court-colors.js';
import { THEME, hex, FONT } from '../shared/theme.js';
import { zoneEdges, offsideEdges, ZONE_LABELS, CENTRE_CIRCLE } from '../shared/court-geometry.js';
import { createView } from '../shared/view-transform.js';

export function drawCourtPreview(canvas, position, orientation = 'landscape') {
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

  // 말풍선: 1구역(공격 골 서클)이 우리 팀이 슛하는 골이라는 표시
  drawBubble(ctx, cell, at(COURT.cols - 6.8, 2.2), at(COURT.cols - 2.6, 5.6), '이쪽이 우리 팀 골! 🏐');
}

/** 말풍선: center에 글상자, 꼬리는 tip을 가리킨다 (좌표는 캔버스 픽셀) */
function drawBubble(ctx, cell, [cx, cy], [tx, ty], text) {
  ctx.font = `bold ${cell * 0.78}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + cell * 1.1;
  const h = cell * 1.5;
  const x = Math.min(Math.max(cx - w / 2, 4), ctx.canvas.width - w - 4); // 캔버스 밖으로 나가지 않게
  const y = Math.min(Math.max(cy - h / 2, 4), ctx.canvas.height - h - 4);
  const mx = x + w / 2;
  const my = y + h / 2;
  // 꼬리: 글상자 가운데에서 tip 쪽으로
  const ang = Math.atan2(ty - my, tx - mx);
  const base = cell * 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = hex(THEME.border);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(mx + Math.cos(ang + Math.PI / 2) * base, my + Math.sin(ang + Math.PI / 2) * base);
  ctx.lineTo(tx, ty);
  ctx.lineTo(mx + Math.cos(ang - Math.PI / 2) * base, my + Math.sin(ang - Math.PI / 2) * base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hex(THEME.border);
  ctx.fillText(text, mx, my + 1);
}
