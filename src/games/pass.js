// 패스 퍼즐 화면(Phaser). 규칙은 pass-logic.js, 스테이지는 pass-stages.js. 이 파일은 그리기와 입력만 담당한다.
// 코트는 존 스네이크와 같은 30×15 칸 (폰 세로면 view-transform 으로 돌려 그린다).
import Phaser from 'phaser';
import { COURT, isAllowed } from '../shared/zones.js';
import { THEME, hex, FONT } from '../shared/theme.js';
import { zoneEdges, offsideEdges, CENTRE_CIRCLE } from '../shared/court-geometry.js';
import { createView } from '../shared/view-transform.js';
import { drawFace, drawGhost, drawBall } from '../shared/sprites.js';
import { modeFor } from './snake-logic.js';
import { PASS_STAGES } from './pass-stages.js';
import {
  HOLD_MS, THIRD_NAMES, createPuzzle, passTo, step, shoot, heldBall, placementProblems, playerAt, opponentAt, starsFor,
} from './pass-logic.js';

const CELL = 24;
const BIB = {
  attack: { bg: THEME.bibAttack, ink: '#ffffff' },
  defence: { bg: THEME.bibDefence, ink: '#2f5233' },
  centre: { bg: THEME.bibCentre, ink: '#4a3f10' },
};
const bibOf = (pos) => BIB[pos === 'C' ? 'centre' : modeFor(pos)];

/**
 * @param {{ parent: HTMLElement, stageId: string, orientation?: string, hooks?: object }} opts
 * hooks: onHud({ stage, index, passes, phase }) · onEvent(ev) · onResult({ win, stars, passes, reason, rule, text })
 * @returns {{ input(action), setPaused(on), isPaused(), nextQuarter(), inBreak(), setOrientation(o), destroy(), phase() }}
 *   input: 'start'(배치 끝내고 시작) · 'shoot' · 'retry'
 */
export function startPass({ parent, stageId, orientation = 'landscape', hooks = {} }) {
  const stage = PASS_STAGES.find((s) => s.id === stageId) ?? PASS_STAGES[0];
  const index = PASS_STAGES.indexOf(stage);
  let view = createView(orientation);
  let state = null;
  let phase = 'place'; // place → play → done
  let placements = {};
  let paused = false;
  let destroyed = false;
  let holdLeft = HOLD_MS;
  let flying = null; // 날아가는 공 { from, to, start, dur, ok }
  let resultPending = false;

  function reset() {
    placements = Object.fromEntries(stage.players.filter((p) => p.place).map((p) => [p.pos, { c: p.c, r: p.r }]));
    state = createPuzzle(stage, { placements });
    phase = stage.players.some((p) => p.place) ? 'place' : 'play';
    holdLeft = HOLD_MS;
    flying = null;
    resultPending = false;
    if (import.meta.env?.DEV) window.__passState = state; // 개발 모드 전용(자동 테스트용)
    hud();
  }
  const hud = () => hooks.onHud?.({ stage, index, passes: state.passes, phase, holder: state.holder });

  function finish() {
    phase = 'done';
    const o = state.over;
    const stars = o.win ? starsFor(state.passes, stage.par) : 0;
    hooks.onResult?.({ ...o, stars, passes: state.passes, par: stage.par, stage, index });
    hud();
  }

  function apply(events) {
    for (const ev of events) {
      hooks.onEvent?.(ev);
      const scene = game?.scene?.scenes?.[0];
      if (ev.type === 'pass') {
        holdLeft = HOLD_MS;
        const to = ev.ok ? ev.to : (state.over?.at ?? ev.to);
        flying = { from: ev.from, to, start: scene?.time.now ?? 0, dur: 360, ok: ev.ok };
      } else if (ev.type === 'goal') {
        scene?.goal(ev.at);
      }
    }
    if (state.over && !resultPending && phase !== 'done') {
      // 공이 날아간 뒤에 결과를 알린다
      resultPending = true;
      const scene = game?.scene?.scenes?.[0];
      const show = () => {
        resultPending = false;
        finish();
        game?.scene?.scenes?.[0]?.result(state.over);
      };
      if (scene) scene.time.delayedCall(flying ? 420 : 150, show);
      else show();
    }
    hud();
  }

  function input(action) {
    if (destroyed || paused) return;
    if (action === 'retry') {
      reset();
      game?.scene?.scenes?.[0]?.redraw();
      return;
    }
    if (action === 'start' && phase === 'place') {
      const problems = placementProblems(stage, placements);
      if (problems.length) {
        hooks.onEvent?.({ type: 'placeError', problems });
        game?.scene?.scenes?.[0]?.markProblems(problems);
        return;
      }
      state = createPuzzle(stage, { placements });
      if (import.meta.env?.DEV) window.__passState = state;
      phase = 'play';
      holdLeft = HOLD_MS;
      hooks.onEvent?.({ type: 'placed' });
      game?.scene?.scenes?.[0]?.redraw();
      hud();
      return;
    }
    if (action === 'shoot' && phase === 'play' && !flying) apply(shoot(state));
  }

  // 화면 칸 ↔ 코트 칸
  const at = (x, y) => {
    const s = view.toScreen(x, y);
    return { x: s.x * CELL, y: s.y * CELL };
  };
  const center = (c, r) => at(c + 0.5, r + 0.5);
  function cellFromScreen(px, py) {
    for (let r = 0; r < COURT.rows; r++) {
      for (let c = 0; c < COURT.cols; c++) {
        const o = view.cellOrigin(c, r);
        if (px >= o.x * CELL && px < (o.x + 1) * CELL && py >= o.y * CELL && py < (o.y + 1) * CELL) return { c, r };
      }
    }
    return null;
  }

  class PassScene extends Phaser.Scene {
    constructor() {
      super('pass');
    }

    create() {
      this.W = view.cols * CELL;
      this.H = view.rows * CELL;
      this.courtG = this.add.graphics();
      this.dynG = this.add.graphics().setDepth(2);
      this.fxG = this.add.graphics().setDepth(6);
      this.labels = [];
      this.thirdTexts = [0, 1, 2].map((t) => {
        const p = at(t * 10 + 5, 0.75);
        return this.add
          .text(p.x, p.y, THIRD_NAMES[t], { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: hex(THEME.ink) })
          .setOrigin(0.5)
          .setAlpha(0.45);
      });
      this.banner = this.add
        .text(this.W / 2, this.H / 2, '', {
          fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: hex(THEME.ink), align: 'center',
          backgroundColor: 'rgba(251,254,249,0.94)', padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setVisible(false);
      this.problems = [];
      this.hover = null;
      this.drag = null;
      this.drawCourt();
      this.setupInput();
      hud();
    }

    redraw() {
      this.banner.setVisible(false);
      this.problems = [];
      this.drawCourt();
    }

    label(i, size) {
      while (this.labels.length <= i) {
        this.labels.push(
          this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(5),
        );
      }
      return this.labels[i].setVisible(true);
    }

    /** 코트: 바탕 · 구역 경계 · 골 서클(공격 쪽 황금색) · 배치 중이면 끄는 선수의 오프사이드 선 */
    drawCourt() {
      const g = this.courtG;
      g.clear();
      g.fillStyle(THEME.allowed, 1);
      g.fillRect(0, 0, this.W, this.H);
      // 공격 골 서클 (슛하는 곳)
      for (let r = 0; r < COURT.rows; r++) {
        for (let c = 20; c < COURT.cols; c++) {
          if (!isAllowed('GS', c, r) || isAllowed('WA', c, r)) continue;
          const o = view.cellOrigin(c, r);
          g.fillStyle(THEME.goalZone, 1);
          g.fillRect(o.x * CELL, o.y * CELL, CELL, CELL);
        }
      }
      const seg = ([x1, y1, x2, y2]) => {
        const a = at(x1, y1);
        const b = at(x2, y2);
        g.lineBetween(a.x, a.y, b.x, b.y);
      };
      g.lineStyle(3, THEME.line, 1);
      zoneEdges().forEach(seg);
      const cc = at(CENTRE_CIRCLE.c, CENTRE_CIRCLE.r);
      g.strokeCircle(cc.x, cc.y, CENTRE_CIRCLE.radius * CELL);
      if (this.drag) {
        // 끄는 선수가 설 수 없는 칸은 빗금, 경계는 빨간 선 (Rule 14)
        for (let r = 0; r < COURT.rows; r++) {
          for (let c = 0; c < COURT.cols; c++) {
            if (isAllowed(this.drag.pos, c, r)) continue;
            const o = view.cellOrigin(c, r);
            g.fillStyle(THEME.forbidden, 0.55);
            g.fillRect(o.x * CELL, o.y * CELL, CELL, CELL);
          }
        }
        g.lineStyle(4, THEME.offside, 1);
        offsideEdges(this.drag.pos).forEach(seg);
      }
      g.lineStyle(4, THEME.border, 1);
      g.strokeRect(2, 2, this.W - 4, this.H - 4);
      const ring = at(COURT.cols - 0.6, COURT.rows / 2);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(ring.x, ring.y, CELL * 0.42);
      g.lineStyle(3, THEME.goalRing, 1);
      g.strokeCircle(ring.x, ring.y, CELL * 0.42);
    }

    setupInput() {
      this.input.on('pointermove', (p) => {
        const cell = cellFromScreen(p.x, p.y);
        if (this.drag && cell) {
          const pl = state.players.find((x) => x.pos === this.drag.pos);
          if (!playerAt(state, cell.c, cell.r) && !opponentAt(state, cell.c, cell.r)) {
            pl.c = cell.c;
            pl.r = cell.r;
            placements[pl.pos] = { c: cell.c, r: cell.r };
          }
          return;
        }
        this.hover = cell;
      });
      this.input.on('pointerdown', (p) => {
        if (paused || destroyed) return;
        const cell = cellFromScreen(p.x, p.y);
        if (!cell) return;
        if (phase === 'place') {
          const pl = playerAt(state, cell.c, cell.r);
          if (pl?.place) {
            this.drag = { pos: pl.pos };
            this.problems = [];
            this.drawCourt();
          } else if (pl) {
            hooks.onEvent?.({ type: 'fixed', pos: pl.pos });
          }
          return;
        }
        if (phase !== 'play' || flying || state.over) return;
        const target = playerAt(state, cell.c, cell.r);
        if (target && target.pos !== state.holder) {
          apply(passTo(state, target.pos));
          return;
        }
        if (!target && !opponentAt(state, cell.c, cell.r)) {
          const h = state.players.find((x) => x.pos === state.holder);
          if (Math.max(Math.abs(h.c - cell.c), Math.abs(h.r - cell.r)) === 1) apply(step(state, cell.c, cell.r));
        }
      });
      this.input.on('pointerup', () => {
        if (!this.drag) return;
        this.drag = null;
        this.drawCourt();
        hooks.onEvent?.({ type: 'moved' });
      });
    }

    update(_t, delta) {
      this.renderDynamic(this.time.now);
      if (paused || destroyed) return;
      const dt = Math.max(0, Math.min(delta, 100));
      if (flying && this.time.now - flying.start >= flying.dur) flying = null;
      // 3초 스테이지: 공을 든 동안 시간이 줄어든다 (공이 날아가는 중에는 멈춤)
      if (state.timer && phase === 'play' && !state.over && !flying) {
        holdLeft -= dt;
        if (holdLeft <= 0) apply(heldBall(state));
      }
    }

    renderDynamic(t) {
      const g = this.dynG;
      g.clear();
      this.fxG.clear();
      this.labels.forEach((l) => l.setVisible(false));
      let li = 0;
      const holder = state.players.find((p) => p.pos === state.holder);

      // 마우스를 올린 동료까지 공의 길 (판정 힌트는 주지 않고 길만)
      if (phase === 'play' && !state.over && !flying && this.hover) {
        const tp = playerAt(state, this.hover.c, this.hover.r);
        if (tp && tp.pos !== state.holder) {
          const a = center(holder.c, holder.r);
          const b = center(tp.c, tp.r);
          g.lineStyle(2, THEME.cue, 0.5);
          const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
          for (let i = 0; i < n; i += 2) {
            const k1 = i / n;
            const k2 = Math.min(1, (i + 1) / n);
            g.lineBetween(a.x + (b.x - a.x) * k1, a.y + (b.y - a.y) * k1, a.x + (b.x - a.x) * k2, a.y + (b.y - a.y) * k2);
          }
        }
      }
      // 피벗 가능한 칸 표시 (피벗 스테이지, 아직 안 디뎠을 때)
      if (phase === 'play' && state.pivot && !state.stepped && !state.over && !flying) {
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const c = holder.c + dc;
            const r = holder.r + dr;
            if ((!dc && !dr) || c < 0 || r < 0 || c >= COURT.cols || r >= COURT.rows) continue;
            if (playerAt(state, c, r) || opponentAt(state, c, r)) continue;
            const o = view.cellOrigin(c, r);
            g.lineStyle(1.5, 0x6b7280, 0.6);
            g.strokeRect(o.x * CELL + 3, o.y * CELL + 3, CELL - 6, CELL - 6);
          }
        }
      }

      // 상대 (보라 유령)
      for (const o of state.opponents) {
        const p = center(o.c, o.r);
        drawGhost(g, p.x, p.y + Math.sin(t / 170 + o.c) * 1.2, CELL * 0.45, 0, 0, THEME.opp);
        this.label(li++, 9).setText(o.pos).setPosition(p.x, p.y + CELL * 0.14);
      }

      // 우리 선수 (파란 머리 애벌레 · 공을 든 선수는 주황)
      for (const pl of state.players) {
        const p = center(pl.c, pl.r);
        const has = pl.pos === state.holder && !(flying && flying.ok);
        const bad = this.problems.some((x) => x.pos === pl.pos);
        if (phase === 'place' && pl.place) {
          g.lineStyle(3, bad ? THEME.danger : THEME.hot, 1);
          g.strokeCircle(p.x, p.y, CELL * 0.62);
        }
        const [fx, fy] = view.screenVec('right');
        drawFace(g, p.x, p.y, CELL * 0.46, fx, fy, t + pl.c * 97, { color: has ? THEME.snakeHead : THEME.pass, mouth: has ? 0x7a2e05 : 0x0b2e6b, open: has });
        const bib = bibOf(pl.pos);
        g.fillStyle(bib.bg, 1);
        g.fillRoundedRect(p.x - 11, p.y + CELL * 0.32, 22, 12, 4);
        this.label(li++, 9).setText(pl.pos).setColor(bib.ink).setPosition(p.x, p.y + CELL * 0.32 + 6);
        if (has && !flying) drawBall(g, p.x + fx * CELL * 0.45, p.y + fy * CELL * 0.45, CELL * 0.2, 0);
      }

      // 3초 링
      if (state.timer && phase === 'play' && !state.over && !flying) {
        const p = center(holder.c, holder.r);
        const left = Math.max(0, holdLeft) / HOLD_MS;
        g.lineStyle(3, left > 0.33 ? THEME.pass : THEME.danger, 0.95);
        g.beginPath();
        g.arc(p.x, p.y, CELL * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
        g.strokePath();
      }

      // 날아가는 공
      if (flying) {
        const k = Math.min(1, Math.max(0, (t - flying.start) / flying.dur));
        const a = center(flying.from.c, flying.from.r);
        const b = center(flying.to.c, flying.to.r);
        drawBall(this.fxG, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * CELL * 0.8, CELL * 0.22, k * 8);
      }
    }

    markProblems(problems) {
      this.problems = problems;
    }

    goal(cell) {
      const p = center(cell.c, cell.r);
      const colors = [THEME.hot, THEME.goalRing, THEME.good, THEME.cue, 0xffb3bb, 0xffffff];
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = CELL * (1.5 + Math.random() * 2.5);
        const bit = this.add.rectangle(p.x, p.y, 5, 8, colors[i % colors.length]).setDepth(9);
        this.tweens.add({ targets: bit, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, alpha: 0, angle: 360, duration: 800, onComplete: () => bit.destroy() });
      }
    }

    result(over) {
      if (over.win) {
        const stars = starsFor(state.passes, stage.par);
        this.banner.setText(`${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}\n골! 패스 ${state.passes}번 (기준 ${stage.par}번)`).setColor('#86602a');
      } else {
        this.banner.setText(`🚨 ${over.reason === 'intercept' ? '인터셉트' : '반칙'}! 상대에게 공이 넘어가요\n${over.rule}`).setColor('#b54a4a');
      }
      this.banner.setPosition(this.W / 2, this.H / 2).setVisible(true);
    }
  }

  let game = null;
  function teardown() {
    game.destroy(true);
    game.canvas?.remove();
  }
  function build() {
    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      width: view.cols * CELL,
      height: view.rows * CELL,
      backgroundColor: hex(THEME.allowed),
      scene: PassScene,
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    if (import.meta.env?.DEV) window.__passGame = game;
  }
  reset();
  build();

  return {
    input,
    setPaused(on) {
      if (destroyed || phase === 'done') return false;
      paused = on;
      const scene = game?.scene?.scenes?.[0];
      if (scene?.time) scene.time.paused = on;
      return true;
    },
    isPaused: () => paused,
    nextQuarter() {},
    inBreak: () => false,
    phase: () => phase,
    setOrientation(o) {
      if (destroyed || o === view.orientation) return;
      view = createView(o);
      teardown();
      build();
    },
    destroy() {
      destroyed = true;
      teardown();
    },
  };
}

