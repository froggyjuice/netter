// 리듬 슈팅 화면(Phaser). 규칙은 rhythm-logic.js(공격 GS·GA) · rhythm-defence-logic.js(수비 GK·GD),
// 이 파일은 그리기와 입력만 담당한다.
// 골 서드를 골라인이 위에 오도록 보여준다 (가로·세로 화면 모두 같은 모양, 15.25m × 10.17m).
import Phaser from 'phaser';
import { THEME, hex, FONT } from '../shared/theme.js';
import { drawFace, drawGhost, drawBall } from '../shared/sprites.js';
import {
  GOAL_THIRD, WINDOWS, HOLD_MS, RHYTHM_QUARTER_MS, REBOUND_WINDOW,
  createRhythm, advance, shoot, pass, rhythmStats, windowScale,
} from './rhythm-logic.js';
import {
  DEFENDERS, DEFENCE_GAP, createDefence, advanceDefence, stopDefence, blockDefence, defenceStats, defenderAt, currentGap,
} from './rhythm-defence-logic.js';
import {
  createMatch, advanceClock, endQuarter, startNextQuarter, addStats, matchClock, swapEndsFor, ourCentrePass,
} from './match-logic.js';

const M = 40; // 1m = 40px
const W = Math.round(GOAL_THIRD.w * M);
const H = Math.round(GOAL_THIRD.h * M);
const RING_R = 0.5 * M; // 링을 실제(지름 38cm)보다 조금 크게 그린다

// e.code 를 쓰므로 한글 입력기가 켜져 있어도 동작한다
const KEY_ACTION = {
  ArrowUp: 'shoot', KeyW: 'shoot', KeyJ: 'shoot', Enter: 'shoot',
  ArrowDown: 'pass', KeyS: 'pass', KeyK: 'pass',
};

const GRADE_TEXT = { perfect: 'Perfect!', great: 'Great!', good: 'Good', miss: 'Miss' };
const GRADE_COLOR = { perfect: '#c0613a', great: '#3f63a8', good: '#4a8559', miss: '#6b7280' };
const BIB = { bg: THEME.bibAttack, ink: '#ffffff' }; // 공격 포지션 조끼 (존 스네이크와 같은 진한 초록)
const BIB_DEF = { bg: THEME.bibDefence, ink: '#2f5233' }; // 수비 포지션 조끼 (연한 초록)
const STOP_TEXT = { perfect: '0.9m Perfect!', great: '0.9m Great!', good: '0.9m Good', far: '너무 멀어요' };

/** 모드별 규칙 함수: 공격(슛·패스) · 수비(블록·멈춤). 버튼은 같은 두 개(↑ shoot · ↓ pass) */
const LOGIC = {
  attack: { create: createRhythm, advance, up: shoot, down: pass, stats: rhythmStats },
  defence: { create: createDefence, advance: advanceDefence, up: blockDefence, down: stopDefence, stats: defenceStats },
};

const px = (p) => ({ x: p.x * M, y: p.y * M });

/** 리바운드: 공이 떨어지는 박까지 그 자리 바로 옆(공 앞 0.35m)으로 달려간다 (m 좌표) */
function reboundRun(from, rb, t) {
  const k = Math.min(1, Math.max(0, (t - rb.start) / Math.max(1, rb.landAt - rb.start)));
  const d = Math.hypot(from.x - rb.at.x, from.y - rb.at.y) || 1;
  const stop = Math.min(0.35, d);
  const to = { x: rb.at.x + ((from.x - rb.at.x) / d) * stop, y: rb.at.y + ((from.y - rb.at.y) / d) * stop };
  const e = 1 - (1 - k) * (1 - k); // 처음엔 빠르게, 도착할 때 천천히
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * @param {{ parent: HTMLElement, position: 'GS'|'GA'|'GK'|'GD', difficulty?: 'easy'|'normal'|'hard', hooks?: object }} opts
 * GS·GA = 공격(슛), GK·GD = 수비(0.9m 멈춤 · 블록) 모드
 * hooks: onHud(snapshot) · onClock({ quarter, clock }) · onWhistle({ quarter }) · onCatch(ev) · onShot(ev) · onIncorrect(ev)
 *        · onHeld(ev) · onFeed(ev) · onCirclePass(ev) · onLate() · onNoBall() · onBeat(n) · onRebound(ev) · onReboundLost(ev)
 *        · 수비: onOppCatch · onStop · onObstruction · onBlock · onEarlyJump · onTooFar · onNotYet · onOutOfPlay
 *          · onInterference · onConceded · onOppMiss
 *        · onQuarterEnd(info) · onBreakTick(ms) · onQuarterStart(info) · onOver(result)
 * @returns 존 스네이크와 같은 컨트롤러 ({ input(action), setPaused, isPaused, nextQuarter, inBreak, setOrientation, destroy })
 */
export function startRhythm({ parent, position, difficulty = 'normal', hooks = {} }) {
  const match = createMatch({ quarterMs: RHYTHM_QUARTER_MS });
  const mode = DEFENDERS.includes(position) ? 'defence' : 'attack';
  const L = LOGIC[mode];
  let state = null;
  let destroyed = false;
  let paused = false;
  let whistled = false;
  let quarterDone = false;
  let playMs = 0;
  let lastClock = '';

  function newQuarter() {
    state = L.create(position, Math.random, { quarter: match.quarter, difficulty });
    whistled = false;
    quarterDone = false;
    lastClock = '';
    if (import.meta.env?.DEV) window.__rhythmState = state; // 개발 모드 전용(자동 테스트용)
  }
  newQuarter();

  const snapshot = () => ({
    ...(quarterDone ? match.totals : addStats(match.totals, L.stats(state))),
    position,
    mode,
    difficulty,
    combo: state.combo,
    quarter: match.quarter,
    clock: matchClock(match.leftMs, match.quarterMs),
    bpm: Math.round(60_000 / state.beatMs),
  });

  function emitClock() {
    const clock = matchClock(match.leftMs, match.quarterMs);
    if (clock === lastClock) return;
    lastClock = clock;
    hooks.onClock?.({ quarter: match.quarter, clock });
  }

  function finishQuarter(reason) {
    if (quarterDone || destroyed) return;
    const stats = L.stats(state);
    endQuarter(match, stats, reason);
    quarterDone = true;
    const scene = game?.scene?.scenes?.[0];
    if (scene) {
      scene.finished = true;
      scene.hint?.setVisible(false);
    }
    if (match.phase === 'over') {
      hooks.onOver?.({
        ...match.totals,
        position,
        mode,
        difficulty,
        quarters: [...match.quarters],
        reason: 'fulltime',
        durationMs: Math.round(playMs),
      });
    } else {
      const next = match.quarter + 1;
      hooks.onQuarterEnd?.({
        quarter: match.quarter,
        reason,
        quarterScore: stats.score,
        totalScore: match.totals.score,
        breakMs: match.breakLeftMs,
        next,
        nextSwap: swapEndsFor(next),
        nextOurCentre: ourCentrePass(next),
      });
    }
  }

  function nextQuarter() {
    if (destroyed || match.phase !== 'break') return;
    startNextQuarter(match);
    newQuarter();
    teardown();
    build();
    hooks.onQuarterStart?.({ quarter: match.quarter, bpm: Math.round(60_000 / state.beatMs) });
  }

  /** action: 'shoot' | 'pass' */
  function input(action) {
    if (destroyed || paused || !whistled || quarterDone) return;
    const events = action === 'shoot' ? L.up(state) : action === 'pass' ? L.down(state) : [];
    game?.scene?.scenes?.[0]?.handle(events);
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (t instanceof HTMLButtonElement && e.code === 'Enter') return; // 버튼 위의 Enter는 버튼이 처리
    const action = KEY_ACTION[e.code];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) input(action);
  };
  window.addEventListener('keydown', onKey);

  class RhythmScene extends Phaser.Scene {
    constructor() {
      super('rhythm');
    }

    create() {
      this.courtG = this.add.graphics();
      this.dynG = this.add.graphics().setDepth(2);
      this.fxG = this.add.graphics().setDepth(6); // 날아가는 공
      const label = (size, depth, color = '#ffffff') =>
        this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
          .setOrigin(0.5)
          .setDepth(depth)
          .setVisible(false);
      this.bibLabel = label(11, 5);
      this.mateLabel = label(10, 5, '#3f63a8').setStroke('#ffffff', 3);
      this.feederLabel = label(10, 5, '#3f63a8').setStroke('#ffffff', 3);
      this.oppLabel = label(10, 5);
      this.gapLabel = label(10, 3, '#6b7280').setText('0.9m');
      this.reboundLabel = label(12, 8, '#3f63a8').setText('리바운드! 아무 버튼').setStroke('#ffffff', 4);
      this.hint = this.add
        .text(W / 2, H * 0.62, '', {
          fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: hex(THEME.ink),
          backgroundColor: 'rgba(251,254,249,0.92)', padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setVisible(false);
      this.flying = null; // 슛·패스 뒤 날아가는 공 { from, to, start, dur, kind }
      this.beatAt = -1e9; // 마지막 박자 시각 (링이 살짝 빛난다)
      this.finished = quarterDone;
      lastClock = '';
      emitClock();
      this.drawCourt();
      if (!whistled && !quarterDone) this.countdown();
      hooks.onHud?.(snapshot());
    }

    countdown() {
      const steps = [`${match.quarter}쿼터 · ${Math.round(60_000 / state.beatMs)} BPM… 3`, '2', '1'];
      steps.forEach((s, i) => this.time.delayedCall(i * 700, () => this.hint.setText(s).setVisible(true)));
      this.time.delayedCall(steps.length * 700, () => {
        whistled = true;
        this.hint.setText('삐! 패스가 와요').setVisible(true);
        this.time.delayedCall(900, () => this.hint.setVisible(false));
        hooks.onWhistle?.({ quarter: match.quarter });
      });
    }

    drawCourt() {
      const g = this.courtG;
      g.clear();
      g.fillStyle(THEME.allowed, 1);
      g.fillRect(0, 0, W, H);
      // 골 서클 (황금색, 반지름 4.9m) — 여기서만 슛할 수 있다
      const post = px({ x: GOAL_THIRD.postX, y: 0 });
      g.fillStyle(THEME.goalZone, 1);
      g.beginPath();
      g.arc(post.x, post.y, GOAL_THIRD.circleR * M, 0, Math.PI, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(3, THEME.line, 1);
      g.beginPath();
      g.arc(post.x, post.y, GOAL_THIRD.circleR * M, 0, Math.PI, false);
      g.strokePath();
      // 테두리: 위 = 골라인, 아래 = 센터 서드와의 경계선
      g.lineStyle(4, THEME.border, 1);
      g.strokeRect(2, 2, W - 4, H - 4);
      // 골대
      const ring = px({ x: GOAL_THIRD.postX, y: GOAL_THIRD.ringY });
      g.fillStyle(0x4b5563, 1);
      g.fillCircle(post.x, post.y + 3, 5);
      g.lineStyle(3, THEME.goalRing, 1);
      g.lineBetween(post.x, post.y + 3, ring.x, ring.y);
      this.add
        .text(post.x + GOAL_THIRD.circleR * M * 0.72, 16, '골 서클', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7a5a00' })
        .setOrigin(0.5)
        .setAlpha(0.8);
      this.add
        .text(46, H - 14, '↓ 센터 서드', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: hex(THEME.ink) })
        .setOrigin(0.5)
        .setAlpha(0.35);
      // 초록 영역 = 골 서드 (골 서클 밖)
      this.add
        .text(W - 14, H - 14, '골 서드', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: hex(THEME.border) })
        .setOrigin(1, 1)
        .setAlpha(0.7);
    }

    update(_time, delta) {
      const now = this.time.now;
      this.renderDynamic(now);
      if (paused) return;
      const dt = Math.max(0, Math.min(delta, 100)); // 탭이 멈췄다 돌아와도 한꺼번에 많이 가지 않도록
      if (match.phase === 'break') {
        if (advanceClock(match, dt) === 'breakOver') nextQuarter();
        else hooks.onBreakTick?.(match.breakLeftMs);
        return;
      }
      if (this.finished || match.phase !== 'play' || !whistled) return;
      playMs += dt;
      if (advanceClock(match, dt) === 'timeUp') {
        finishQuarter('time');
        return;
      }
      emitClock();
      this.handle(L.advance(state, dt));
    }

    handle(events) {
      if (!events?.length) return;
      const ring = px({ x: GOAL_THIRD.postX, y: GOAL_THIRD.ringY });
      for (const ev of events) {
        if (ev.type === 'beat') {
          this.beatAt = this.time.now;
          hooks.onBeat?.(ev.n);
        } else if (ev.type === 'catch') {
          const p = px(ev.at);
          if (ev.penalty) this.popText(p.x, p.y - 26, '페널티 패스!', '#3f63a8');
          else if (ev.line === 'on') this.popText(p.x, p.y - 26, '선 위 = 서클 안!', '#4a8559');
          else if (ev.line === 'out') this.popText(p.x, p.y - 26, '선 밖에서 잡음!', '#b54a4a');
          else if (!ev.inCircle) this.popText(p.x, p.y - 26, '서클 밖!', '#b54a4a');
          hooks.onCatch?.(ev);
        } else if (ev.type === 'shot') {
          const from = px(ev.at);
          // 골 · 링에 맞음(리바운드) · 에어볼(링까지 못 감) · 그 밖의 빗나감
          const kind = ev.goal ? 'goal' : ev.miss === 'rim' ? 'rim' : ev.miss === 'air' ? 'air' : 'miss';
          const to = kind === 'air' ? { x: lerp(from.x, ring.x, 0.72), y: lerp(from.y, ring.y, 0.72) } : ring;
          this.flying = { from, to, start: this.time.now, dur: 380, kind, grade: ev.grade };
          this.time.delayedCall(380, () => {
            const when = ev.err < 0 ? '빨랐어요' : '늦었어요';
            const label = ev.goal
              ? `${GRADE_TEXT[ev.grade]} 골! +${ev.points}`
              : kind === 'rim' ? `링에 맞음 · ${when} → 리바운드!` : kind === 'air' ? `에어볼 · ${when}` : `Miss · ${when}`;
            this.popText(ring.x, ring.y + 44, label, GRADE_COLOR[ev.grade]);
            if (ev.goal) this.confetti(ring.x, ring.y + 10);
            if (ev.interference) this.interference(ring);
          });
          hooks.onShot?.(ev);
        } else if (ev.type === 'incorrectShot') {
          const from = px(ev.at);
          this.flying = { from, to: ring, start: this.time.now, dur: 380, kind: 'miss' };
          this.popText(from.x, from.y - 26, '서클 밖 슛!', '#b54a4a');
          this.time.delayedCall(380, () => {
            this.popText(ring.x, ring.y + 44, '골 무효 · Incorrect shot', '#b54a4a');
            this.cameras.main.shake(120, 0.004);
          });
          hooks.onIncorrect?.(ev);
        } else if (ev.type === 'feed' || ev.type === 'circlePass') {
          const from = px(ev.from);
          const to = px(ev.to);
          this.flying = { from, to, start: this.time.now, dur: 300, kind: 'pass' };
          if (ev.type === 'feed') this.popText(from.x, from.y - 26, ev.combo >= 5 ? `패스! +${ev.points} (${ev.combo}연속)` : `패스! +${ev.points}`, '#3f63a8');
          (ev.type === 'feed' ? hooks.onFeed : hooks.onCirclePass)?.(ev);
        } else if (ev.type === 'held') {
          const p = px(ev.at);
          this.popText(p.x, p.y - 26, '3초 지남', '#6b7280');
          hooks.onHeld?.(ev);
        } else if (ev.type === 'rebound') {
          const p = px(ev.at);
          this.popText(p.x, p.y - 26, ev.combo >= 5 ? `리바운드! +${ev.points} (${ev.combo}연속)` : `리바운드! +${ev.points}`, '#3f63a8');
          hooks.onRebound?.(ev);
        } else if (ev.type === 'reboundLost') {
          const p = px(ev.at);
          this.popText(p.x, p.y - 26, `상대 ${ev.who} 리바운드`, '#6f55a8');
          hooks.onReboundLost?.(ev);
        } else if (ev.type === 'oppCatch') {
          hooks.onOppCatch?.(ev);
        } else if (ev.type === 'stop') {
          const me = px(defenderAt(state));
          this.popText(me.x, me.y - 26, ev.points ? `${STOP_TEXT[ev.grade]} +${ev.points}` : STOP_TEXT[ev.grade], ev.grade === 'far' ? '#6b7280' : GRADE_COLOR[ev.grade]);
          hooks.onStop?.(ev);
        } else if (ev.type === 'obstruction') {
          const p = px(ev.at);
          this.popText(p.x, p.y - 30, '장애 반칙! 0.9m 안', '#b54a4a');
          this.cameras.main.shake(120, 0.004);
          hooks.onObstruction?.(ev);
        } else if (ev.type === 'block') {
          const from = px(ev.at);
          this.flying = { from, to: { x: from.x + (from.x < W / 2 ? -1 : 1) * M * 2, y: from.y - M * 0.5 }, start: this.time.now, dur: 320, kind: 'pass' };
          this.popText(from.x, from.y - 34, ev.combo >= 5 ? `블록! +${ev.points} (${ev.combo}연속)` : `블록! +${ev.points}`, '#c0613a');
          this.confetti(from.x, from.y - M * 0.6);
          hooks.onBlock?.(ev);
        } else if (ev.type === 'interference') {
          this.popText(ring.x, ring.y + 44, '슛 방해! 떨어지는 공', '#b54a4a');
          this.cameras.main.shake(120, 0.004);
          hooks.onInterference?.(ev);
        } else if (ev.type === 'conceded') {
          this.popText(ring.x, ring.y + 44, `실점 · 상대 ${ev.who} 골`, '#6f55a8');
          hooks.onConceded?.(ev);
        } else if (ev.type === 'oppMiss') {
          this.popText(ring.x, ring.y + 44, '빗나감 → 리바운드!', '#3f63a8');
          hooks.onOppMiss?.(ev);
        } else if (ev.type === 'earlyJump') {
          hooks.onEarlyJump?.(ev);
        } else if (ev.type === 'tooFar') {
          hooks.onTooFar?.(ev);
        } else if (ev.type === 'notYet') {
          hooks.onNotYet?.(ev);
        } else if (ev.type === 'outOfPlay') {
          hooks.onOutOfPlay?.(ev);
        } else if (ev.type === 'late') {
          hooks.onLate?.();
        } else if (ev.type === 'noBall') {
          hooks.onNoBall?.();
        }
      }
      if (events.some((e) => e.type !== 'beat')) hooks.onHud?.(snapshot());
    }

    renderDynamic(t) {
      const g = this.dynG;
      g.clear();
      this.fxG.clear();
      this.reboundLabel.setVisible(false);
      if (mode === 'defence') {
        this.renderDefence(g, t);
        return;
      }
      const st = state;
      const p = st.play;
      const phase = st.phase;
      // 박자: 링 둘레가 박마다 살짝 빛난다
      const beatGlow = Math.min(1, Math.max(0, 1 - (t - this.beatAt) / 180)); // 0~1 (시계가 거꾸로 가도 안전하게)
      const ring = px({ x: GOAL_THIRD.postX, y: GOAL_THIRD.ringY });

      // 진행: 0(패스 출발) → 1(잡음)
      const flightK = p && phase === 'flight' ? Math.min(1, Math.max(0, (st.t - p.start) / (p.catchAt - p.start))) : 1;
      let me = p ? { x: lerp(p.meFrom.x, p.at.x, flightK), y: lerp(p.meFrom.y, p.at.y, flightK) } : st.me;
      if (phase === 'rebound' && st.rebound) me = reboundRun(me, st.rebound, st.t); // 리바운드하러 달려간다
      const meP = px(me);
      const ringDir = (from) => {
        const d = Math.hypot(ring.x - from.x, ring.y - from.y) || 1;
        return [(ring.x - from.x) / d, (ring.y - from.y) / d];
      };

      // 공을 가진 동안: 0.9m 표시 (수비가 지켜야 하는 거리, Rule 16.1)
      const holding = phase === 'hold';
      this.gapLabel.setVisible(holding);
      if (holding) {
        g.lineStyle(1.5, 0x6b7280, 0.55);
        g.strokeCircle(meP.x, meP.y, 0.9 * M);
        this.gapLabel.setPosition(meP.x - 0.9 * M + 14, meP.y + 0.9 * M * 0.55);
      }

      // 링 (박자에 맞춰 빛남)
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(ring.x, ring.y, RING_R);
      g.lineStyle(4 + beatGlow * 3, THEME.goalRing, 1);
      g.strokeCircle(ring.x, ring.y, RING_R);

      // 줄어드는 링: 잡은 뒤 2박에 걸쳐 링 크기까지 줄어든다 → 딱 겹칠 때 슛!
      if (holding && p.inCircle) {
        const span = p.approachBeats * st.beatMs;
        const k = (p.perfectAt - st.t) / span; // 1 → 0
        const late = st.t - p.perfectAt > WINDOWS.good * windowScale(p.dist) * st.windowK;
        if (!late) {
          const r = RING_R * (1 + Math.max(-0.15, k) * 3.2);
          const near = Math.abs(st.t - p.perfectAt) <= WINDOWS.great * windowScale(p.dist) * st.windowK;
          g.lineStyle(near ? 5 : 3, near ? THEME.hot : THEME.cue, near ? 1 : 0.8);
          g.strokeCircle(ring.x, ring.y, r);
        }
      }

      // 서클 선 근처에서 받았다: 발밑 표시 (선 위 = 초록, 선 밖 = 빨강)
      if (p?.line && (holding || phase === 'flight')) {
        const foot = px(p.at);
        g.fillStyle(p.line === 'on' ? THEME.good : THEME.danger, 0.55);
        g.fillEllipse(foot.x - 7, foot.y + M * 0.32, 9, 14);
        g.fillEllipse(foot.x + 7, foot.y + M * 0.32, 9, 14);
      }

      // 리바운드: 링에 맞은 공이 튕겨 떨어지는 자리 + 줄어드는 원 (떨어지는 박에 누르기)
      const rb = phase === 'rebound' ? st.rebound : null;
      if (rb) this.drawRebound(g, rb, ring);

      // 동료들
      this.drawMate(g, t, px(st.feeder), this.feederLabel, '');
      this.drawMate(g, t, px(st.mate), this.mateLabel, st.partner);
      // 상대 수비 (GS↔GK, GA↔GD). 아웃 오브 플레이면 흐리게
      const d = px(st.defender);
      const [lx, ly] = [(meP.x - d.x) / (Math.hypot(meP.x - d.x, meP.y - d.y) || 1), (meP.y - d.y) / (Math.hypot(meP.x - d.x, meP.y - d.y) || 1)];
      const out = st.defender.out;
      drawGhost(g, d.x, d.y + (out ? 0 : Math.sin(t / 170) * 1.5), M * 0.42, lx, ly, out ? THEME.oppOut : THEME.opp);
      if (rb && !out) {
        // 리바운드는 0.9m 안에서도 팔을 뻗어 잡으려 한다 (Rule 16.8b)
        const spot = px(rb.at);
        const dd = Math.hypot(spot.x - d.x, spot.y - d.y) || 1;
        g.fillStyle(THEME.opp, 1);
        g.fillCircle(d.x + ((spot.x - d.x) / dd) * M * 0.75, d.y + ((spot.y - d.y) / dd) * M * 0.75, 6);
      } else if (!out && holding) {
        // 팔 벌려 막는 손
        g.fillStyle(THEME.opp, 1);
        g.fillCircle(d.x - M * 0.5, d.y - M * 0.42, 5);
        g.fillCircle(d.x + M * 0.5, d.y - M * 0.42, 5);
      }
      this.oppLabel.setText(out ? 'OUT' : st.defenderPos).setPosition(d.x, d.y + 3).setVisible(true);

      // 나: 주황 애벌레 (몸 한 마디 + 머리), 링을 바라본다
      const [fx, fy] = ringDir(meP);
      g.fillStyle(THEME.snakeBody, 1);
      g.fillCircle(meP.x - fx * M * 0.42, meP.y - fy * M * 0.42, M * 0.3);
      drawFace(g, meP.x, meP.y, M * 0.34, fx, fy, t, { color: THEME.snakeHead, mouth: 0x7a2e05, open: holding });
      const neck = { x: meP.x - fx * M * 0.42, y: meP.y - fy * M * 0.42 };
      g.fillStyle(BIB.bg, 1);
      g.fillRoundedRect(neck.x - 11, neck.y - 7, 22, 14, 4);
      this.bibLabel.setText(position).setColor(BIB.ink).setPosition(neck.x, neck.y).setVisible(true);

      // 3초 링 (공을 잡고 있는 동안 줄어든다)
      if (holding) {
        const left = Math.max(0, p.holdEnd - st.t) / HOLD_MS;
        g.lineStyle(3, left > 0.33 ? THEME.pass : THEME.danger, 0.9);
        g.beginPath();
        g.arc(meP.x, meP.y, M * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
        g.strokePath();
        drawBall(g, meP.x + fx * M * 0.4, meP.y + fy * M * 0.4, M * 0.17, 0);
      }

      // 날아오는 패스
      if (p && phase === 'flight' && !p.penalty) {
        const a = px(p.from);
        const b = px(p.at);
        const lift = Math.sin(flightK * Math.PI) * M * 0.8;
        drawBall(this.fxG, lerp(a.x, b.x, flightK), lerp(a.y, b.y, flightK) - lift, M * 0.2, flightK * 6);
      }
      if (p && phase === 'flight' && p.penalty) {
        drawBall(g, meP.x + fx * M * 0.4, meP.y + fy * M * 0.4, M * 0.17, 0); // 페널티 패스: 공을 받아 든다
      }

      // 슛·패스한 공
      const f = this.flying;
      if (f) {
        const k = Math.min(1, Math.max(0, (t - f.start) / f.dur));
        const lift = f.kind === 'pass' ? Math.sin(k * Math.PI) * M * 0.6 : Math.sin(k * Math.PI) * M * 1.6;
        let x = lerp(f.from.x, f.to.x, k);
        let y = lerp(f.from.y, f.to.y, k) - lift;
        if (k >= 1) {
          // 골이면 링을 통과해 아래로, 아니면 림에 맞고 옆으로 튕긴다
          const after = Math.min(1, Math.max(0, (t - f.start - f.dur) / 260));
          if (f.kind === 'goal') y = f.to.y + after * 10;
          else if (f.kind === 'rim') this.flying = null;
          else if (f.kind === 'air') y = f.to.y + after * M * 0.6;
          else if (f.kind === 'miss') {
            x = f.to.x + (f.from.x < f.to.x ? 1 : -1) * after * M * 1.2;
            y = f.to.y - Math.sin(after * Math.PI) * M * 0.5 + after * M * 0.4;
          }
          if (after >= 1) this.flying = null;
        }
        if (this.flying) drawBall(this.fxG, x, y, M * 0.2, k * 8);
      }
    }

    /** 리바운드: 떨어지는 자리의 줄어드는 원 + 링에서 튕겨 나오는 공. delay: 슛 공이 링에 닿기까지(공격 380ms) */
    drawRebound(g, rb, ring, delay = 380) {
      const st = state;
      const spot = px(rb.at);
      const k = (rb.landAt - st.t) / Math.max(1, rb.landAt - rb.start); // 1 → 0
      const near = Math.abs(st.t - rb.landAt) <= REBOUND_WINDOW;
      g.lineStyle(near ? 5 : 3, near ? THEME.hot : THEME.cue, near ? 1 : 0.8);
      g.strokeCircle(spot.x, spot.y, M * 0.22 + Math.max(0, k) * M * 1.2);
      // 안내 글씨는 원 옆(골대 바깥쪽)에: 달려오는 애벌레와 겹치지 않게
      const side = rb.at.x <= GOAL_THIRD.postX ? -1 : 1;
      this.reboundLabel.setOrigin(side < 0 ? 1 : 0, 0.5).setPosition(spot.x + side * M * 0.9, spot.y).setVisible(true);
      if (st.t - rb.start >= delay) {
        const air = Math.min(1, Math.max(0, (st.t - rb.start - delay) / Math.max(1, rb.landAt - rb.start - delay)));
        const lift = Math.sin(air * Math.PI) * M * 0.9;
        drawBall(this.fxG, lerp(ring.x, spot.x, air), lerp(ring.y, spot.y, air) - lift, M * 0.2, air * 8);
      }
    }

    /** 나(주황 애벌레) + 조끼. target 쪽을 본다 */
    drawMe(g, t, meP, target, bib, { open = false, faded = false } = {}) {
      const d = Math.hypot(target.x - meP.x, target.y - meP.y) || 1;
      const [fx, fy] = [(target.x - meP.x) / d, (target.y - meP.y) / d];
      g.fillStyle(THEME.snakeBody, 1);
      g.fillCircle(meP.x - fx * M * 0.42, meP.y - fy * M * 0.42, M * 0.3);
      drawFace(g, meP.x, meP.y, M * 0.34, fx, fy, t, { color: THEME.snakeHead, mouth: 0x7a2e05, open });
      const neck = { x: meP.x - fx * M * 0.42, y: meP.y - fy * M * 0.42 };
      g.fillStyle(bib.bg, 1);
      g.fillRoundedRect(neck.x - 13, neck.y - 7, 26, 14, 4);
      if (faded) {
        g.fillStyle(0xffffff, 0.55);
        g.fillCircle(meP.x, meP.y, M * 0.5);
      }
      this.bibLabel.setText(faded ? 'OUT' : position).setColor(bib.ink).setPosition(neck.x, neck.y).setVisible(true);
      return [fx, fy];
    }

    /** 수비 모드: 상대 슈터(보라 유령)에게 0.9m까지 다가가 멈추고, 공이 올라갈 때 블록 */
    renderDefence(g, t) {
      const st = state;
      const p = st.play;
      const phase = st.phase;
      const ring = px({ x: GOAL_THIRD.postX, y: GOAL_THIRD.ringY });
      const beatGlow = Math.min(1, Math.max(0, 1 - (t - this.beatAt) / 180));
      this.gapLabel.setVisible(false);

      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(ring.x, ring.y, RING_R);
      g.lineStyle(4 + beatGlow * 3, THEME.goalRing, 1);
      g.strokeCircle(ring.x, ring.y, RING_R);

      const shooter = px(p ? p.at : st.shooter);
      const win = (w) => WINDOWS[w] * st.windowK;

      // 0.9m 원: 다가가는 동안 딱 맞는 박 근처에서 노랗게, 멈춘 뒤에는 지켰으면 초록 · 안으로 들어갔으면 빨강
      if (p && (phase === 'approach' || phase === 'block') && !p.out) {
        let color = THEME.cue;
        let width = 2;
        if (phase === 'approach' && Math.abs(st.t - p.markAt) <= win('great')) {
          color = THEME.hot;
          width = 5;
        } else if (p.stopGap != null) {
          color = p.stopGap >= DEFENCE_GAP - 1e-6 ? THEME.good : THEME.danger;
          width = 3;
        } else if (currentGap(st) < DEFENCE_GAP) {
          color = THEME.danger;
          width = 4;
        }
        g.lineStyle(width, color, 0.9);
        g.strokeCircle(shooter.x, shooter.y, DEFENCE_GAP * M);
        this.gapLabel.setPosition(shooter.x - DEFENCE_GAP * M + 14, shooter.y + DEFENCE_GAP * M * 0.55).setVisible(true);
      }

      // 블록 타이밍: 슈터 머리 위의 원이 공을 놓는 박에 맞춰 줄어든다
      if (p && phase === 'block' && !p.out && !p.jumped && st.t <= p.releaseAt + win('good')) {
        const k = (p.releaseAt - st.t) / st.beatMs;
        const near = Math.abs(st.t - p.releaseAt) <= win('great');
        g.lineStyle(near ? 5 : 3, near ? THEME.hot : THEME.goalRing, near ? 1 : 0.8);
        g.strokeCircle(shooter.x, shooter.y - M * 0.55, M * 0.25 * (1 + Math.max(0, k) * 3));
      }

      // 동료들 · 상대 슈터
      this.drawMate(g, t, px(st.mate), this.mateLabel, st.partner);
      const feeder = px(st.feeder);
      drawGhost(g, feeder.x, feeder.y + Math.sin(t / 170) * 1.5, M * 0.32, 0, -1, THEME.opp);
      this.feederLabel.setVisible(false);
      const meP = px(phase === 'rebound' && st.rebound ? reboundRun(defenderAt(st), st.rebound, st.t) : defenderAt(st));
      const dd = Math.hypot(meP.x - shooter.x, meP.y - shooter.y) || 1;
      drawGhost(g, shooter.x, shooter.y + Math.sin(t / 170) * 1.5, M * 0.42, (ring.x - shooter.x) / dd, (ring.y - shooter.y) / dd, THEME.opp);
      this.oppLabel.setText(st.shooterPos).setPosition(shooter.x, shooter.y + 3).setVisible(true);

      // 나: 슈터를 바라본다. 페널티 패스 중이면 옆에 비켜서서 흐리게 (Rule 6.4)
      this.drawMe(g, t, meP, shooter, BIB_DEF, { open: phase === 'block', faded: Boolean(p?.out && phase !== 'gap') });

      // 공: 패스가 날아옴 → 슈터가 들고 있음 → 링으로 → (빗나가면) 리바운드
      if (p && phase === 'flight') {
        const k = Math.min(1, Math.max(0, (st.t - p.start) / (p.catchAt - p.start)));
        const a = px(p.from);
        drawBall(this.fxG, lerp(a.x, shooter.x, k), lerp(a.y, shooter.y, k) - Math.sin(k * Math.PI) * M * 0.8, M * 0.2, k * 6);
      } else if (p && (phase === 'approach' || (phase === 'block' && st.t < p.releaseAt))) {
        drawBall(g, shooter.x, shooter.y - M * 0.5, M * 0.18, 0);
      } else if (p && phase === 'block') {
        const k = Math.min(1, Math.max(0, (st.t - p.releaseAt) / (p.landAt - p.releaseAt)));
        drawBall(this.fxG, lerp(shooter.x, ring.x, k), lerp(shooter.y - M * 0.5, ring.y, k) - Math.sin(k * Math.PI) * M * 1.4, M * 0.2, k * 8);
      }
      if (phase === 'rebound' && st.rebound) this.drawRebound(g, st.rebound, ring, 0);

      // 블록·패스로 튕겨 나간 공
      const f = this.flying;
      if (f) {
        const k = Math.min(1, Math.max(0, (t - f.start) / f.dur));
        drawBall(this.fxG, lerp(f.from.x, f.to.x, k), lerp(f.from.y, f.to.y, k) - Math.sin(k * Math.PI) * M * 0.6, M * 0.2, k * 8);
        if (k >= 1) this.flying = null;
      }
    }

    drawMate(g, t, p, labelText, name) {
      const hop = Math.abs(Math.sin(t / 160)) * 2;
      const R = M * 0.3;
      g.fillStyle(THEME.passBody, 1);
      g.fillCircle(p.x, p.y + R * 0.9 - hop * 0.5, R * 0.7);
      drawFace(g, p.x, p.y - hop, R, 0, -1, t + 900, { color: THEME.pass, mouth: 0x0b2e6b, open: true });
      labelText.setText(name).setPosition(p.x, p.y + R + 12).setVisible(Boolean(name));
    }

    /** 수비 방해 (Rule 9.7): 상대 수비가 링 위로 뛰어올라 공을 건드린다 */
    interference(ring) {
      const ghost = this.add.graphics().setDepth(7);
      drawGhost(ghost, 0, 0, M * 0.42, 0, -1, THEME.opp);
      ghost.setPosition(ring.x + M * 0.9, ring.y + M * 1.4);
      this.tweens.add({
        targets: ghost, x: ring.x + M * 0.5, y: ring.y + M * 0.3, duration: 160, yoyo: true, hold: 220,
        onComplete: () => ghost.destroy(),
      });
      this.popText(ring.x, ring.y + 74, `상대 ${state.defenderPos} 슛 방해!`, '#6f55a8');
      this.cameras.main.shake(120, 0.004);
    }

    confetti(x, y) {
      const colors = [THEME.hot, THEME.goalRing, THEME.good, THEME.cue, 0xffb3bb, 0xffffff];
      for (let i = 0; i < 24; i++) {
        const a = Math.PI * (0.1 + Math.random() * 0.8); // 아래쪽(코트 안)으로 퍼진다
        const dd = M * (1 + Math.random() * 2);
        const bit = this.add.rectangle(x, y, 5, 8, colors[i % colors.length]).setDepth(9).setAngle(Math.random() * 180);
        this.tweens.add({
          targets: bit, x: x + Math.cos(a) * dd, y: y + Math.sin(a) * dd, angle: bit.angle + 360, alpha: 0,
          duration: 700 + Math.random() * 400, ease: 'Cubic.easeOut', onComplete: () => bit.destroy(),
        });
      }
    }

    popText(x, y, label, color) {
      const txt = this.add
        .text(x, y, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color, stroke: '#ffffff', strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(8);
      this.tweens.add({ targets: txt, y: y - 26, alpha: 0, duration: 800, onComplete: () => txt.destroy() });
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
      width: W,
      height: H,
      backgroundColor: hex(THEME.allowed),
      scene: RhythmScene,
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    if (import.meta.env?.DEV) window.__rhythmGame = game;
  }
  build();

  return {
    input,
    setPaused(on) {
      if (destroyed || quarterDone || match.phase !== 'play') return false;
      paused = on;
      const scene = game?.scene?.scenes?.[0];
      if (scene?.time) scene.time.paused = on;
      if (scene?.tweens) (on ? scene.tweens.pauseAll() : scene.tweens.resumeAll());
      return true;
    },
    isPaused: () => paused,
    nextQuarter,
    inBreak: () => match.phase === 'break',
    setOrientation() {}, // 골 서드 화면은 가로·세로 모양이 같다
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      teardown();
    },
  };
}
