// 홈 화면 존 스네이크 '맛보기': 미니 코트(포지션 미리보기 캔버스) 위에서 애벌레를 직접 움직여 본다.
// 규칙은 games/snake-taste-logic.js. Phaser 없이 캔버스 2D로 가볍게 그린다.
import { POSITIONS, ZONE_NAMES } from '../shared/zones.js';
import { THEME, hex } from '../shared/theme.js';
import { createView } from '../shared/view-transform.js';
import { drawCourtPreview } from './court-preview.js';
import { createTaste, steer, tasteStep, TASTE_MS, TASTE_TICK_MS } from '../games/snake-taste-logic.js';

const CELL = 24; // drawCourtPreview 와 같은 해상도
const KEY_DIR = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

/**
 * @param {{ canvas: HTMLCanvasElement, position: string, orientation: 'landscape'|'portrait',
 *           onMessage?: (text: string, kind?: 'good'|'bad'|'info') => void, onEnd?: (summary: object) => void }} opts
 * @returns {{ stop(): void, input(screenDir): void }}
 */
export function startSnakeTaste({ canvas, position, orientation, onMessage = () => {}, onEnd = () => {} }) {
  const view = createView(orientation);
  const bg = document.createElement('canvas');
  drawCourtPreview(bg, position, orientation); // 배경(구역·빨간 선)은 한 번만 그린다
  canvas.width = bg.width;
  canvas.height = bg.height;
  const ctx = canvas.getContext('2d');
  const state = createTaste(position);
  const startAt = performance.now();
  let last = startAt;
  let acc = 0;
  let raf = 0;
  let stopped = false;
  let flash = null; // { cell, color, until }
  let facing = 'right';

  const at = (x, y) => {
    const s = view.toScreen(x, y);
    return [s.x * CELL, s.y * CELL];
  };

  function input(screenDir) {
    if (stopped) return;
    if (!steer(state, view.dirFromScreen(screenDir))) onMessage('반대 방향으로는 바로 돌 수 없어요', 'info');
  }

  const onKey = (e) => {
    const dir = KEY_DIR[e.code];
    if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    input(dir);
  };
  let origin = null;
  const onDown = (e) => {
    origin = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e) => {
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
    input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    origin = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    origin = null;
  };
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.style.touchAction = 'none';

  function handle(events) {
    for (const ev of events) {
      if (ev.type === 'offside') {
        flash = { cell: ev.cell, color: THEME.danger, until: performance.now() + 450 };
        onMessage(`오프사이드! ${position}는 ${ZONE_NAMES[ev.zone]}(${ev.zone}구역)에 들어갈 수 없어요 — 옆으로 튕겨요`, 'bad');
      } else if (ev.type === 'wall') {
        flash = { cell: ev.cell, color: THEME.border, until: performance.now() + 300 };
        onMessage('벽이에요! 옆으로 튕겨요', 'info');
      } else if (ev.type === 'ball') {
        onMessage(ev.goal ? '골 서클에서 슛 성공! 🎯 (GS·GA만)' : '공을 먹었어요! 🏐', 'good');
      } else if (ev.type === 'crash') {
        onMessage('내 몸에 막혔어요. 다른 방향으로!', 'info');
      }
    }
  }

  function draw(now) {
    ctx.drawImage(bg, 0, 0);
    if (flash && now < flash.until) {
      const c = Math.min(29, Math.max(0, flash.cell.c));
      const r = Math.min(14, Math.max(0, flash.cell.r));
      const o = view.cellOrigin(c, r);
      ctx.fillStyle = hex(flash.color);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(o.x * CELL, o.y * CELL, CELL, CELL);
      ctx.globalAlpha = 1;
    }
    // 공
    if (state.item) {
      const [x, y] = at(state.item.c + 0.5, state.item.r + 0.5);
      const r = CELL * 0.38 * (1 + 0.08 * Math.sin(now / 150));
      ctx.fillStyle = hex(THEME.ball);
      ctx.strokeStyle = hex(THEME.ballEdge);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
    }
    // 애벌레 (꼬리부터)
    const body = state.snake;
    for (let i = body.length - 1; i >= 1; i--) {
      const [x, y] = at(body[i].c + 0.5, body[i].r + 0.5);
      ctx.fillStyle = hex(i % 2 ? THEME.snakeBody : THEME.snakeBody2);
      ctx.beginPath();
      ctx.arc(x, y, CELL * 0.44, 0, Math.PI * 2);
      ctx.fill();
    }
    facing = state.dir ?? state.queued ?? facing;
    const [fx, fy] = view.screenVec(facing);
    const [hx, hy] = at(body[0].c + 0.5, body[0].r + 0.5);
    const R = CELL * 0.55;
    ctx.fillStyle = hex(THEME.snakeHead);
    ctx.beginPath();
    ctx.arc(hx, hy, R, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = hx + fx * R * 0.3 - fy * R * 0.38 * side;
      const ey = hy + fy * R * 0.3 + fx * R * 0.38 * side;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, R * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hex(THEME.ink);
      ctx.beginPath();
      ctx.arc(ex + fx * R * 0.1, ey + fy * R * 0.1, R * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
    // 남은 시간 · 처음 안내
    const left = Math.max(0, Math.ceil((TASTE_MS - (now - startAt)) / 1000));
    ctx.font = `bold ${CELL * 0.8}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const label = state.dir || state.queued ? `🐍 ${position} 맛보기 ${left}초` : `🐍 ${position} · 방향키·스와이프로 출발! ${left}초`;
    const w = ctx.measureText(label).width;
    ctx.fillRect(6, 6, w + 14, CELL * 1.1);
    ctx.fillStyle = hex(THEME.ink);
    ctx.fillText(label, 13, 9);
  }

  function frame(now) {
    if (stopped) return;
    if (!canvas.isConnected) return stop(); // 홈 화면을 떠났다
    const dt = Math.min(200, Math.max(0, now - last));
    last = now;
    acc += dt;
    while (acc >= TASTE_TICK_MS) {
      acc -= TASTE_TICK_MS;
      handle(tasteStep(state));
    }
    draw(now);
    if (now - startAt >= TASTE_MS) {
      const summary = { position, name: POSITIONS[position].name, balls: state.balls, goals: state.goals, offsides: state.offsides };
      stop();
      onEnd(summary);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    canvas.style.touchAction = '';
  }

  raf = requestAnimationFrame(frame);
  return { stop, input };
}
