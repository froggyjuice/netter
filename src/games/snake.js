// 존 스네이크 화면(Phaser). 규칙은 snake-logic.js, 이 파일은 그리기와 입력만 담당한다.
// 화면 방향(가로/세로)은 view-transform.js 로 바꾼다: 게임 좌표는 항상 30×15, 그릴 때만 변환.
import Phaser from 'phaser';
import { COURT, isAllowed } from '../shared/zones.js';
import { cellColor } from '../shared/court-colors.js';
import { THEME, hex, FONT } from '../shared/theme.js';
import { zoneEdges, offsideEdges, ZONE_LABELS, CENTRE_CIRCLE } from '../shared/court-geometry.js';
import { createView } from '../shared/view-transform.js';
import { drawFace, drawGhost, drawBall } from '../shared/sprites.js';
import { createGame, setDirection, step, tickMs, modeFor } from './snake-logic.js';
import {
  createMatch, advanceClock, endQuarter, startNextQuarter, addStats, matchClock, swapEndsFor, ourCentrePass,
} from './match-logic.js';

const CELL = 24;

// e.code 를 쓰므로 한글 입력기가 켜져 있어도 WASD가 동작한다. (화면 기준 방향)
const KEY_DIR = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

// 포지션 표(조끼) 색: 공격 진한 초록 · 수비 연한 초록 · 센터 노랑 (style.css 의 --attack/--defence/--centre 와 같음)
const BIB = {
  attack: { bg: THEME.bibAttack, ink: '#ffffff' },
  defence: { bg: THEME.bibDefence, ink: '#2f5233' },
  centre: { bg: THEME.bibCentre, ink: '#4a3f10' },
};
const bibOf = (pos) => BIB[pos === 'C' ? 'centre' : modeFor(pos)];

/**
 * @param {{ parent: HTMLElement, position: string, mode?: 'attack'|'defence', orientation?: 'landscape'|'portrait', hooks?: object }} opts
 * hooks: onHud(snapshot) · onBall(ev) · onSub(ev) · onWall() · onOffside(info) · onConceded(info) · onBadTurn()
 *        · onWhistle({ centre }) · onBreaking() · onClock({ quarter, clock })
 *        · onQuarterEnd(info) · onBreakTick(ms) · onQuarterStart(info) · onPenaltyRelease(ev) · onUnfreeze()
 *        · onPassStart(ev) · onPass(ev) · onHeld(ev) · onOppEnter(ev) · onFoul(ev) · onPenalty(ev) · onIntercept(ev) · onOver(result)
 * @returns {{ input(dir): void, setPaused(on): boolean, isPaused(): boolean, setOrientation(o): void,
 *            nextQuarter(): void, inBreak(): boolean, destroy(): void }}
 * 경기는 4쿼터(match-logic.js). 쿼터마다 새 판(createGame)으로 센터 패스부터, 기록은 쿼터마다 더한다.
 *   input(dir)의 dir은 화면 기준 방향(방향 버튼·방향키). 세로 화면이면 게임 방향으로 바꿔서 넣는다.
 */
export function startSnake({ parent, position, mode, orientation = 'landscape', hooks = {} }) {
  const match = createMatch();
  let orient = orientation;
  let state = null;
  let view = null;
  let destroyed = false;
  let paused = false;
  let facing = 'right'; // 멈춰 있을 때 머리가 바라보는 방향
  let whistled = false; // 센터 패스 휘슬 전에는 움직일 수 없다 (브레이킹)
  let quarterDone = false; // 이 쿼터 기록을 이미 더했는가
  let playMs = 0; // 휘슬 뒤 실제로 경기한 시간 (점수 등록 때 서버 검증용)
  let lastClock = '';

  /** 새 쿼터: 같은 포지션(교체됐으면 바뀐 포지션)으로 센터 패스부터. 2·4쿼터는 진영 교대 */
  function newQuarter() {
    const pos = state ? state.position : position;
    const md = state ? state.mode : mode;
    state = createGame(pos, Math.random, { mode: md, ourCentrePass: ourCentrePass(match.quarter) });
    view = createView(orient, swapEndsFor(match.quarter));
    whistled = false;
    quarterDone = false;
    facing = 'right';
    lastClock = '';
    if (import.meta.env?.DEV) window.__snakeState = state; // 개발 모드 전용(자동 테스트용). 빌드에서는 제거된다.
  }
  newQuarter();

  const quarterStats = () => ({
    score: state.score,
    balls: state.balls,
    offsides: state.offsides,
    conceded: state.conceded,
    passes: state.passes,
    bestChain: state.bestChain,
    goals: state.goals,
    circleBlocks: state.circleBlocks,
    blocks: state.blocks,
    played: [...state.played],
    contacts: state.contacts,
    penaltiesWon: state.penaltiesWon,
    intercepts: state.intercepts,
    ballsVsOpp: state.ballsVsOpp,
  });
  /** HUD·결과용: 지난 쿼터 합계 + 이번 쿼터 */
  const snapshot = () => ({
    ...(quarterDone ? match.totals : addStats(match.totals, quarterStats())),
    position: state.position,
    mode: state.mode,
    quarter: match.quarter,
    clock: matchClock(match.leftMs),
    quarterScore: state.score,
  });

  function emitClock() {
    const clock = matchClock(match.leftMs);
    if (clock === lastClock) return;
    lastClock = clock;
    hooks.onClock?.({ quarter: match.quarter, clock });
  }

  /** 쿼터 끝: 기록을 더하고, 4쿼터면 경기 종료, 아니면 쉬는 시간 */
  function finishQuarter(reason) {
    if (quarterDone || destroyed) return;
    const stats = quarterStats();
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
        position: state.position,
        mode: state.mode,
        quarters: [...match.quarters],
        reason: reason === 'time' ? 'fulltime' : reason,
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

  /** 쉬는 시간이 끝났거나 '다음 쿼터 시작'을 눌렀다 */
  function nextQuarter() {
    if (destroyed || match.phase !== 'break') return;
    startNextQuarter(match);
    newQuarter();
    teardown();
    build();
    hooks.onQuarterStart?.({ quarter: match.quarter, swapEnds: view.swapEnds, ourCentre: ourCentrePass(match.quarter) });
  }

  function input(screenDir) {
    if (destroyed || paused) return; // 일시정지 중 입력은 무시 (다시 시작했을 때 갑자기 꺾이지 않게)
    if (!whistled) {
      hooks.onBreaking?.(); // 휘슬 전에 움직이려 함
      return;
    }
    if (!setDirection(state, view.dirFromScreen(screenDir)) && !state.over) {
      hooks.onBadTurn?.(); // 정반대 방향(몸 쪽)으로는 바로 돌 수 없다
    }
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return; // 닉네임 입력 중
    const dir = KEY_DIR[e.code];
    if (!dir) return;
    e.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    input(dir);
  };
  window.addEventListener('keydown', onKey);

  // ---------- 좌표 도우미 (게임 좌표 → 화면 픽셀) ----------
  const at = (x, y) => {
    const s = view.toScreen(x, y);
    return { x: s.x * CELL, y: s.y * CELL };
  };
  const center = (c, r) => at(c + 0.5, r + 0.5);

  class SnakeScene extends Phaser.Scene {
    constructor() {
      super('snake');
    }

    create() {
      this.W = view.cols * CELL;
      this.H = view.rows * CELL;
      this.courtG = this.add.graphics();
      this.zoneTexts = ZONE_LABELS.map((l) => {
        const p = at(l.c, l.r);
        return this.add
          .text(p.x, p.y, String(l.zone), { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: hex(THEME.ink) })
          .setOrigin(0.5)
          .setAlpha(0.14);
      });
      this.dynG = this.add.graphics().setDepth(2);
      const label = (size, depth) =>
        this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff' })
          .setOrigin(0.5)
          .setDepth(depth)
          .setVisible(false);
      this.subLabel = label(16, 3).setText('⇄');
      this.passLabel = label(10, 3).setText('패스').setColor('#3f63a8').setStroke('#ffffff', 3);
      this.oppLabel = label(9, 4);
      this.bibLabel = label(10, 5);
      this.centreLabels = [label(9, 5), label(9, 5)]; // 센터 패스 연출용 'C' 이름표 (우리 팀 · 상대 팀)
      this.hint = this.add
        .text(this.W / 2, 30, '방향키 · 스와이프로 출발!', {
          // 코트 가운데의 구역 경계선을 가리지 않도록 위쪽에 둔다
          fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: hex(THEME.ink),
          backgroundColor: 'rgba(251,254,249,0.92)', padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5)
        .setDepth(10)
        .setVisible(!state.over && !state.dir && !state.queuedDir);

      this.acc = 0;
      this.gulpAt = -1e9; // 공을 먹은 시각 (머리가 잠깐 커진다)
      // 쿼터 첫 공: 휘슬 뒤 센터 서클 → 센터 서드로 날아가 내려앉기 전까지는 숨긴다
      this.centreLanded = whistled || !state.centreBall;
      if (!whistled && !state.over) this.countdown();
      lastClock = '';
      emitClock();
      this.finished = state.over; // 화면을 다시 만들 때(회전) 이미 끝난 경기면 종료 처리를 반복하지 않는다
      this.drawCourt();
      this.setupSwipe();
      hooks.onHud?.(snapshot());
    }

    // 센터 패스 준비: 3·2·1 뒤 휘슬. 그 전에는 움직일 수 없다 (Rule 8.11)
    countdown() {
      const ours = ourCentrePass(match.quarter); // 이번 쿼터 센터 패스가 우리 팀인지 (Rule 8.1 번갈아)
      const mine = state.position === 'C' && ours;
      const first = mine ? '센터 패스! 내가 C예요… 3' : ours ? '센터 패스 준비… 3' : '상대 팀 센터 패스… 3';
      const steps = [`${match.quarter}쿼터 · ${first}`, '2', '1'];
      steps.forEach((label, i) => this.time.delayedCall(i * 700, () => this.hint.setText(label).setVisible(true)));
      this.time.delayedCall(steps.length * 700, () => {
        whistled = true;
        this.hint.setText('삐! 방향키 · 스와이프로 출발!').setVisible(true);
        // 위쪽 안내가 패스 대상(동료)을 가리지 않도록 잠깐만 보여준다
        this.time.delayedCall(1500, () => {
          if (whistled && this.hint.text.startsWith('삐!')) this.hint.setVisible(false);
        });
        if (state.position !== 'C') {
          // 센터 패스를 하고 두 C가 사라진다
          const cc = at(COURT.cols / 2, COURT.rows / 2);
          this.popText(cc.x, cc.y - CELL, '센터 패스!', '#3f63a8');
        }
        this.flyCentreBall();
        hooks.onWhistle?.({ centre: mine, ours });
      });
    }

    /** 센터 패스 공: 센터 서클 → 센터 서드(받는 자리) → (내가 못 가는 곳이면) 내 구역의 첫 공 자리 */
    flyCentreBall() {
      const cb = state.centreBall;
      if (!cb || this.centreLanded) return;
      const ballG = this.add.graphics().setDepth(6);
      drawBall(ballG, 0, 0, CELL * 0.32, 0);
      const start = at(cb.from.x, cb.from.y);
      const via = center(cb.via.c, cb.via.r);
      const to = center(cb.to.c, cb.to.r);
      ballG.setPosition(start.x, start.y);
      const land = () => {
        ballG.destroy();
        this.centreLanded = true;
      };
      this.tweens.add({
        targets: ballG,
        x: via.x,
        y: via.y,
        duration: 420,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.popText(via.x, via.y - CELL / 2, '센터 서드!', '#3f63a8');
          if (cb.to.c === cb.via.c && cb.to.r === cb.via.r) return land();
          this.tweens.add({ targets: ballG, x: to.x, y: to.y, duration: 420, ease: 'Sine.easeOut', onComplete: land });
        },
      });
    }

    /** 휘슬 전, C가 아닌 포지션: 센터 서클에 우리 팀 C(파란 애벌레)와 상대 C(보라 유령) (Rule 8.8·8.9) */
    drawCentrePair(g, t) {
      const show = !whistled && state.position !== 'C' && !state.over;
      this.centreLabels.forEach((l) => l.setVisible(show));
      if (!show) return;
      const R = CELL * 0.42;
      const ours = center(COURT.cols / 2 - 1, Math.floor(COURT.rows / 2)); // 서클 왼쪽(수비 쪽) 칸
      const theirs = center(COURT.cols / 2, Math.floor(COURT.rows / 2)); // 서클 오른쪽 칸
      const [fx, fy] = view.screenVec('right'); // 우리 C는 공격 방향을 본다
      drawFace(g, ours.x, ours.y, R, fx, fy, t, { color: THEME.pass, mouth: 0x0b2e6b, open: true });
      drawGhost(g, theirs.x, theirs.y + Math.sin(t / 170) * 1.2, R, -fx, -fy, THEME.opp);
      // 이번 쿼터 센터 패스를 하는 팀의 C가 공을 들고 있다
      if (ourCentrePass(match.quarter)) drawBall(g, ours.x + fx * R * 1.05, ours.y + fy * R * 1.05, CELL * 0.2, 0);
      else drawBall(g, theirs.x - fx * R * 1.05, theirs.y - fy * R * 1.05, CELL * 0.2, 0);
      this.centreLabels[0].setText('C').setPosition(ours.x, ours.y + R + 6);
      this.centreLabels[1].setText('C').setPosition(theirs.x, theirs.y + R * 0.32);
    }

    setupSwipe() {
      let origin = null;
      this.input.on('pointerdown', (p) => {
        origin = { x: p.x, y: p.y };
      });
      this.input.on('pointermove', (p) => {
        if (!p.isDown || !origin) return;
        const dx = p.x - origin.x;
        const dy = p.y - origin.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
        input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
        origin = { x: p.x, y: p.y }; // 이어서 연속 스와이프 가능
      });
      this.input.on('pointerup', () => {
        origin = null;
      });
    }

    // 현재 포지션 기준으로 코트를 칠한다. 교체 아이템으로 포지션이 바뀌면 다시 그린다.
    drawCourt() {
      const g = this.courtG;
      g.clear();
      for (let r = 0; r < COURT.rows; r++) {
        for (let c = 0; c < COURT.cols; c++) {
          const o = view.cellOrigin(c, r);
          const x = o.x * CELL;
          const y = o.y * CELL;
          const ok = isAllowed(state.position, c, r);
          g.fillStyle(cellColor(state.position, c, r, ok), 1);
          g.fillRect(x, y, CELL, CELL);
          if (!ok) {
            g.lineStyle(1, THEME.hatch, 0.3);
            g.lineBetween(x + 4, y + CELL - 4, x + CELL - 4, y + 4);
          }
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
      // 오프사이드 경계는 빨간 선으로 눈에 띄게
      g.lineStyle(4, THEME.offside, 1);
      offsideEdges(state.position).forEach(seg);
      g.lineStyle(4, THEME.border, 1);
      g.strokeRect(2, 2, this.W - 4, this.H - 4);

      // 양쪽 골라인 가운데의 골대 링 (골라인에서 코트 안쪽으로 살짝)
      for (const [lineX, ringX] of [[0, 0.6], [COURT.cols, COURT.cols - 0.6]]) {
        const post = at(lineX, COURT.rows / 2);
        const ring = at(ringX, COURT.rows / 2);
        g.lineStyle(3, THEME.goalRing, 1);
        g.lineBetween(post.x, post.y, ring.x, ring.y);
        g.fillStyle(0xffffff, 0.75);
        g.fillCircle(ring.x, ring.y, CELL * 0.42);
        g.lineStyle(3, THEME.goalRing, 1);
        g.strokeCircle(ring.x, ring.y, CELL * 0.42);
      }
    }

    update(_time, delta) {
      this.renderDynamic(this.time.now);
      if (paused) return; // 일시정지: 그리기만 하고 시간은 멈춘다
      const dt = Math.min(delta, 100); // 탭이 멈췄다 돌아와도 한꺼번에 많이 가지 않도록
      if (match.phase === 'break') {
        if (advanceClock(match, dt) === 'breakOver') nextQuarter();
        else hooks.onBreakTick?.(match.breakLeftMs);
        return;
      }
      if (state.over || this.finished || match.phase !== 'play') return;
      // 경기 시계는 휘슬 뒤부터 흐른다 (뱀이 멈춰 있어도 흐름: 실제 경기처럼)
      if (whistled) {
        playMs += dt;
        if (advanceClock(match, dt) === 'timeUp') {
          finishQuarter('time');
          return;
        }
        emitClock();
      }

      // 첫 입력(또는 튕길 곳이 없어 멈춘 뒤 재개 입력) 전에는 시간을 모으지 않는다.
      if (!state.dir && !state.queuedDir && !state.frozen) {
        this.acc = 0;
        return;
      }
      this.hint.setVisible(false);

      this.acc += dt;
      let guard = 0;
      while (this.acc >= tickMs(state.balls) && guard++ < 5 && !state.over) {
        this.acc -= tickMs(state.balls);
        this.handle(step(state));
      }
    }

    handle(events) {
      for (const ev of events) {
        const pos = ev.cell ? center(ev.cell.c, ev.cell.r) : null;
        if (ev.type === 'ball') {
          this.gulpAt = this.time.now;
          this.popText(pos.x, pos.y - CELL / 2, ev.goal ? `골! +${ev.points}` : `+${ev.points}`, ev.goal ? '#c0613a' : '#2b2a26');
          if (ev.goal) this.confetti(pos.x, pos.y);
          hooks.onBall?.(ev);
        } else if (ev.type === 'sub') {
          this.drawCourt();
          hooks.onSub?.(ev);
        } else if (ev.type === 'block') {
          this.gulpAt = this.time.now;
          const label = ev.circle ? `차단! +${ev.points}` : `+${ev.points}`;
          this.popText(pos.x, pos.y - CELL / 2, label, ev.circle ? '#c0613a' : '#2b2a26');
          hooks.onBall?.(ev);
        } else if (ev.type === 'pass') {
          const label = ev.chain > 1 ? `패스 ${ev.chain}연속! +${ev.points}` : `패스! +${ev.points}`;
          this.popText(pos.x, pos.y - CELL / 2, label, '#3f63a8');
          hooks.onPass?.(ev);
        } else if (ev.type === 'held') {
          this.popText(pos.x, pos.y - CELL / 2, '3초 지남', '#6b7280');
          hooks.onHeld?.(ev);
        } else if (ev.type === 'oppEnter') {
          this.popText(pos.x, pos.y - CELL / 2, `맞수 ${ev.who} 등장!`, '#6f55a8');
          hooks.onOppEnter?.(ev);
        } else if (ev.type === 'foul') {
          // 내 접촉 반칙 → 공이 상대에게
          this.bump(ev.cell, THEME.opp);
          this.popHead('접촉 반칙!', '#b54a4a');
          this.cameras.main.shake(120, 0.004);
          hooks.onFoul?.(ev);
        } else if (ev.type === 'penaltyRelease') {
          if (ev.cell) this.popText(pos.x, pos.y - CELL / 2, '패스!', '#6f55a8');
          hooks.onPenaltyRelease?.(ev);
        } else if (ev.type === 'unfreeze') {
          hooks.onUnfreeze?.(ev);
        } else if (ev.type === 'bump') {
          this.bump(ev.cell, THEME.oppOut); // 아웃 오브 플레이 맞수: 반칙 없이 튕김
        } else if (ev.type === 'penalty') {
          // 맞수 장애 반칙 → 페널티 패스, 맞수는 아웃 오브 플레이
          this.popHead('페널티 패스!', '#3f63a8');
          hooks.onPenalty?.(ev);
        } else if (ev.type === 'intercept') {
          this.popText(pos.x, pos.y - CELL / 2, ev.legal ? '정당한 인터셉트!' : '가로채기!', '#6f55a8');
          hooks.onIntercept?.(ev);
        } else if (ev.type === 'passStart') {
          hooks.onPassStart?.(ev);
        } else if (ev.type === 'wall') {
          this.bump(ev.cell, THEME.border);
          hooks.onWall?.();
        } else if (ev.type === 'offside') {
          this.bump(ev.cell, THEME.danger);
          this.cameras.main.shake(120, 0.004);
          if (ev.penalty) this.popHead(`−${ev.penalty}`, '#b54a4a');
          hooks.onOffside?.({ position: state.position, zone: ev.zone, cell: ev.cell, penalty: ev.penalty });
        } else if (ev.type === 'conceded') {
          this.flash(ev.cell.c, ev.cell.r, THEME.danger, 0.7);
          this.cameras.main.shake(160, 0.007);
          hooks.onConceded?.({ position: state.position });
        } else if (ev.type === 'crash') {
          const head = state.snake[0];
          this.flash(head.c, head.r, THEME.danger, 0.7);
          this.cameras.main.shake(180, 0.008);
        }
      }
      if (events.length) hooks.onHud?.(snapshot());
      // 튕길 곳이 없어 멈췄으면 다시 출발하라고 알려준다
      if (!state.over && !state.dir && !state.queuedDir) this.hint.setText('방향키로 다시 출발!').setVisible(true);

      if (state.over && !this.finished) {
        this.finished = true;
        this.hint.setVisible(false);
        const reason = state.overReason;
        this.time.delayedCall(700, () => finishQuarter(reason));
      }
    }

    renderDynamic(t) {
      const g = this.dynG;
      g.clear();
      this.subLabel.setVisible(false);
      this.passLabel.setVisible(false);

      this.drawPass(g);
      this.drawShot(g, t);
      this.drawItem(g, t);
      this.drawCaterpillar(g, t);
      this.drawOpponent(g, t);
      this.drawCentrePair(g, t);
    }

    // 패스 대상: 같은 팀 표시 + 남은 시간 링 (3초 → 0)
    drawPass(g) {
      const p = state.pass;
      if (!p) return;
      const { x, y } = center(p.c, p.r);
      const left = Math.max(0, p.deadline - state.ticks - (state.dir ? this.acc / tickMs(state.balls) : 0)) / p.total;
      g.lineStyle(3, left > 0.33 ? THEME.pass : THEME.danger, 0.9);
      g.beginPath();
      g.arc(x, y, CELL * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      g.strokePath();

      // 동료: 파란 꼬마 애벌레. 내 머리 쪽을 바라보며 손짓하듯 들썩인다
      const head = state.snake[0] ? center(state.snake[0].c, state.snake[0].r) : { x, y: y - 1 };
      const d = Math.hypot(head.x - x, head.y - y) || 1;
      const [fx, fy] = [(head.x - x) / d, (head.y - y) / d];
      const hop = Math.abs(Math.sin(this.time.now / 160)) * 2;
      const R = CELL * 0.42;
      g.fillStyle(THEME.passBody, 1);
      g.fillCircle(x - fx * R * 0.95, y - fy * R * 0.95 - hop * 0.5, R * 0.7); // 몸통 한 마디
      drawFace(g, x, y - hop, R, fx, fy, this.time.now + 900, { color: THEME.pass, mouth: 0x0b2e6b, open: true });
      this.passLabel.setPosition(x, y + R + 6).setVisible(true);
    }

    /** 골 서클 페널티 패스의 슛 칸 (Rule 6.6): 골대 앞 황금 링 + '슛' */
    drawShot(g, t) {
      const s = state.shot;
      this.shotLabel ??= this.add
        .text(0, 0, '슛', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#86602a', stroke: '#ffffff', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(4);
      this.shotLabel.setVisible(Boolean(s));
      if (!s) return;
      const { x, y } = center(s.c, s.r);
      const pulse = 1 + 0.12 * Math.sin(t / 120);
      g.fillStyle(THEME.hot, 0.55);
      g.fillCircle(x, y, CELL * 0.48 * pulse);
      g.lineStyle(3, THEME.goalRing, 1);
      g.strokeCircle(x, y, CELL * 0.48 * pulse);
      this.shotLabel.setPosition(x, y);
    }

    drawItem(g, t) {
      const it = state.item;
      if (!it) return;
      if (state.centreBall && !this.centreLanded && it.c === state.centreBall.to.c && it.r === state.centreBall.to.r) return; // 아직 날아오는 중
      const { x, y } = center(it.c, it.r);
      const pulse = 1 + 0.09 * Math.sin(t / 150);
      if (it.type === 'sub') {
        const s = CELL * 0.84 * pulse;
        g.fillStyle(THEME.sub, 1);
        g.fillRoundedRect(x - s / 2, y - s / 2, s, s, 6);
        this.subLabel.setPosition(x, y).setVisible(true);
        return;
      }
      const r = CELL * 0.4 * (it.type === 'roll' ? 1 : pulse);
      if (it.type === 'roll') {
        // 굴러오는 쪽(게임 오른쪽 = 상대 공격 방향) 뒤에 속도선
        const [vx, vy] = view.screenVec('right');
        g.lineStyle(2, THEME.ballEdge, 0.45);
        for (const [k, len] of [[-0.45, 0.5], [0, 0.8], [0.45, 0.5]]) {
          const sx = x + vx * (r + 3) - vy * r * k;
          const sy = y + vy * (r + 3) + vx * r * k;
          g.lineBetween(sx, sy, sx + vx * CELL * len, sy + vy * CELL * len);
        }
      }
      drawBall(g, x, y, r, it.type === 'roll' ? -t / 160 : 0);
    }

    // 애벌레 친구: 꼬리부터 그려서 머리가 맨 위
    drawCaterpillar(g, t) {
      const body = state.snake;
      const n = body.length;
      for (let i = n - 1; i >= 1; i--) {
        const { x, y } = center(body[i].c, body[i].r);
        const r = CELL * Math.max(0.34, 0.48 - (0.12 * i) / n);
        g.fillStyle(i % 2 ? THEME.snakeBody : THEME.snakeBody2, 1);
        g.fillCircle(x, y, r);
        g.fillStyle(0xffffff, 0.35);
        g.fillCircle(x - r * 0.3, y - r * 0.35, r * 0.25); // 반짝임
      }

      facing = state.dir ?? state.queuedDir ?? facing;
      const [fx, fy] = view.screenVec(facing); // 앞 방향
      const h = center(body[0].c, body[0].r);
      const gulp = Math.min(1, Math.max(0, 1 - (t - this.gulpAt) / 220)); // 0~1 (시계가 거꾸로 가도 안전하게)
      const R = CELL * 0.58 * (1 + 0.18 * gulp);
      // 입: 공이 가까우면 크게 벌린다
      const it = state.item;
      const near = it && it.type !== 'sub' && Math.abs(it.c - body[0].c) + Math.abs(it.r - body[0].r) <= 2;
      drawFace(g, h.x, h.y, R, fx, fy, t, { color: THEME.snakeHead, mouth: 0x7a2e05, open: near });

      // 공을 잡고 있으면 입 앞에 작은 공
      if (state.pass) drawBall(g, h.x + fx * R * 1.05, h.y + fy * R * 1.05, CELL * 0.22, 0);

      // 포지션 표(조끼): 목 칸 위에 작은 이름표
      const neck = body[1] ? center(body[1].c, body[1].r) : h;
      const bib = bibOf(state.position);
      const w = 20;
      g.fillStyle(bib.bg, 1);
      g.fillRoundedRect(neck.x - w / 2, neck.y - 7, w, 14, 4);
      g.lineStyle(1, 0xffffff, 0.9);
      g.strokeRoundedRect(neck.x - w / 2, neck.y - 7, w, 14, 4);
      // 아웃 오브 플레이(내 접촉 반칙 뒤): 흐리게 덮고 이름표에 OUT
      const out = state.frozen > 0;
      if (out) {
        g.fillStyle(0xffffff, 0.55);
        for (const seg of body) {
          const p = center(seg.c, seg.r);
          g.fillCircle(p.x, p.y, CELL * 0.6);
        }
      }
      this.bibLabel.setText(out ? 'OUT' : state.position).setColor(bib.ink).setPosition(neck.x, neck.y).setVisible(true);
    }

    // 맞수: 보라색 꼬마 유령. 찌푸린 눈썹, 눈동자는 쫓는 쪽을 본다, 통통 튄다
    drawOpponent(g, t) {
      const o = state.opp;
      if (!o) {
        this.oppLabel.setVisible(false);
        return;
      }
      const c = center(o.c, o.r);
      const R = CELL * 0.5;
      const x = c.x;
      const out = Boolean(o.out); // 아웃 오브 플레이: 흐리게, 움직이지 않음
      const y = c.y + (out ? 0 : Math.sin(t / 170) * 1.5);
      const target = state.mode === 'attack' ? (state.pass ?? state.item) : state.snake[0];
      let [lx, ly] = [0, 0];
      if (target) {
        const tp = center(target.c, target.r);
        const d = Math.hypot(tp.x - x, tp.y - y) || 1;
        [lx, ly] = [(tp.x - x) / d, (tp.y - y) / d];
      }
      drawGhost(g, x, y, R, lx, ly, out ? THEME.oppOut : THEME.opp);
      if (o.taking) drawBall(g, x + R * 0.95, y - R * 0.55, CELL * 0.22, 0); // 페널티 패스할 공을 들고 있다
      this.oppLabel.setText(out ? 'OUT' : o.position).setPosition(x, y + R * 0.32).setVisible(true);
    }

    // 골 이펙트: 색종이가 터진다
    confetti(x, y) {
      const colors = [THEME.hot, THEME.goalRing, THEME.good, THEME.cue, 0xffb3bb, 0xffffff];
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = CELL * (1.5 + Math.random() * 2.5);
        const bit = this.add
          .rectangle(x, y, 5, 8, colors[i % colors.length])
          .setDepth(9)
          .setAngle(Math.random() * 180);
        this.tweens.add({
          targets: bit,
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d + CELL, // 살짝 아래로 떨어진다
          angle: bit.angle + 360,
          alpha: 0,
          duration: 700 + Math.random() * 400,
          ease: 'Cubic.easeOut',
          onComplete: () => bit.destroy(),
        });
      }
      this.cameras.main.flash(120, 255, 236, 140);
    }

    popText(x, y, label, color) {
      const txt = this.add
        .text(x, y, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color, stroke: '#ffffff', strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(8);
      this.tweens.add({ targets: txt, y: y - 28, alpha: 0, duration: 700, onComplete: () => txt.destroy() });
    }

    popHead(label, color) {
      const h = state.snake[0];
      const p = center(h.c, h.r);
      this.popText(p.x, p.y - CELL / 2, label, color);
    }

    // 막힌 칸(코트 밖이면 코트 가장자리 칸)에 부딪힌 표시
    bump(cell, color) {
      const c = Math.min(COURT.cols - 1, Math.max(0, cell.c));
      const r = Math.min(COURT.rows - 1, Math.max(0, cell.r));
      this.flash(c, r, color, cell.c === c && cell.r === r ? 0.45 : 0);
    }

    // fillAlpha 0 이면 테두리만 깜빡인다.
    flash(c, r, color, fillAlpha) {
      const p = center(c, r);
      const rect = this.add.rectangle(p.x, p.y, CELL, CELL, color, fillAlpha).setDepth(7);
      rect.setStrokeStyle(3, color, 1);
      this.tweens.add({ targets: rect, alpha: 0, duration: 450, onComplete: () => rect.destroy() });
    }
  }

  let game = null;
  // Phaser는 다음 프레임에 캔버스를 지운다. 새 화면과 겹치지 않도록 캔버스는 바로 뗀다.
  function teardown() {
    game.destroy(true);
    game.canvas?.remove();
  }
  function build() {
    game = new Phaser.Game({
      type: Phaser.CANVAS, // 가벼운 2D 게임이라 WebGL 없이도 충분하고 환경 차이가 적다
      parent,
      width: view.cols * CELL,
      height: view.rows * CELL,
      backgroundColor: hex(THEME.forbidden),
      scene: SnakeScene,
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, gamepad: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    if (import.meta.env?.DEV) window.__snakeGame = game; // 개발 모드 전용(창이 가려져 rAF가 멈췄을 때 수동으로 루프를 돌리는 자동 테스트용)
  }
  build();

  return {
    input,
    /** 일시정지/재개. 경기가 끝났으면 무시하고 false */
    setPaused(on) {
      if (destroyed || state.over || match.phase !== 'play') return false;
      paused = on;
      const scene = game?.scene?.scenes?.[0];
      if (scene?.time) scene.time.paused = on; // 휘슬 카운트다운도 함께 멈춘다
      return true;
    },
    isPaused: () => paused,
    nextQuarter,
    inBreak: () => match.phase === 'break',
    /** 화면 방향이 바뀌면 같은 경기 상태로 화면만 다시 만든다 */
    setOrientation(o) {
      if (destroyed || o === view.orientation) return;
      orient = o;
      view = createView(o, swapEndsFor(match.quarter));
      teardown();
      build();
    },
    destroy() {
      destroyed = true;
      window.removeEventListener('keydown', onKey);
      teardown();
    },
  };
}
