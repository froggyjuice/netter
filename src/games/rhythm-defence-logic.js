// 리듬 슈팅 · 수비 모드 (GK·GD). 순수 로직 → 테스트 가능. 그리기·입력은 rhythm.js.
// 근거: World Netball「Rules of Netball」2024
//   Rule 16.1  — 공을 가진 선수를 수비할 때는 0.9m 이상 떨어진다. 더 가까우면 장애(Obstruction): 상대 페널티 패스
//   Rule 16.6a — 0.9m를 지킨 수비는 슈터 쪽으로 뛰어올라 공을 막을 수 있다 (슛 동작을 방해하지 않는 한)
//   Rule 9.7   — 링으로 떨어지는 공을 건드리면 슛 방해(Interference): 상대 페널티 패스, 들어간 슛은 골
//   Rule 6.4   — 페널티 패스 때 반칙한 선수는 옆에 비켜서서 공이 떠날 때까지 플레이할 수 없다
//   Rule 6.6   — 골 서클 안 GS·GA는 페널티 패스를 슛으로 할 수 있다
//   Rule 11.1c·16.8b — 골대에 맞고 튕긴 리바운드는 누구나 잡을 수 있다(0.9m 안에서도 팔을 뻗어)
//
// 한 번의 플레이:
//   상대 패스가 서클 안 슈터에게 날아옴(1박) → 내가 슈터 쪽으로 다가간다. N박 뒤에 딱 0.9m → 그때 '멈춤'
//   → 다음 박에 슈터가 공을 놓는다 → 공이 올라갈 때 '블록' (늦으면 떨어지는 공을 건드린 슛 방해)
//   → 막지 못하면 슛 결과(멈춘 거리가 좋을수록 잘 빗나감) → 빗나가면 리바운드 다툼
import { MATCHUP } from '../shared/zones.js';
import {
  GOAL_THIRD, WINDOWS, POINTS, COMBO_BONUS_FROM, REBOUND_WINDOW, DIFFICULTY,
  beatMsFor, distToPost, rand, polar, circleSpot, outsideSpot, reboundSpot, besideSpot, onBeat,
} from './rhythm-logic.js';

export const DEFENDERS = Object.freeze(['GK', 'GD']);
export const DEFENCE_GAP = 0.9; // Rule 16.1
export const START_GAP = 2.7; // 패스가 오는 순간 슈터와의 거리(m)
export const SHOT_FLIGHT_BEATS = 0.6; // 공이 손을 떠나 링에 닿기까지
/** 난이도별 수비 점수: 멈춤 판정 · 정당한 블록 */
export const DEF_POINTS = Object.freeze({
  easy: { stop: { perfect: 10, great: 10, good: 10 }, block: 20 },
  normal: { stop: { perfect: 20, great: 10, good: 10 }, block: 30 },
  hard: { stop: { perfect: 30, great: 20, good: 10 }, block: 40 },
});
/** 상대 슛 성공 확률: 내가 멈춘 거리 판정에 따라 (가까이 잘 붙을수록 낮다) */
export const GOAL_CHANCE = Object.freeze({ perfect: 0.35, great: 0.45, good: 0.55, far: 0.85, penalty: 0.8 });
const EARLY_JUMP_BONUS = 0.15; // 너무 일찍 뛰면 슈터가 기다렸다 쏜다
const SLIDE_MIN_GAP = 0.35; // 멈추지 않으면 여기까지 붙는다(그 전에 장애 판정)
const STOP_GRADE_KEY = Object.freeze({ perfect: 'stopPerfects', great: 'stopGreats', good: 'stopGoods' });

/** 멈춤 판정 (거리 맞추기): errMs = 누른 시각 − 딱 0.9m가 되는 시각 */
export function judgeStop(errMs, k = 1) {
  const e = Math.abs(errMs);
  if (e <= WINDOWS.perfect * k) return 'perfect';
  if (e <= WINDOWS.great * k) return 'great';
  if (e <= WINDOWS.good * k) return 'good';
  return errMs < 0 ? 'far' : 'obstruction';
}

/**
 * @param {'GK'|'GD'} position
 * @param {() => number} rng
 * @param {{ quarter?: number, difficulty?: 'easy'|'normal'|'hard' }} opts
 */
export function createDefence(position, rng = Math.random, { quarter = 1, difficulty = 'normal' } = {}) {
  if (!DEFENDERS.includes(position)) throw new Error(`수비 모드는 GK·GD만: ${position}`);
  if (!DIFFICULTY[difficulty]) throw new Error(`난이도: ${difficulty}`);
  const shooter = polar(3, 0);
  return {
    mode: 'defence',
    position,
    shooterPos: MATCHUP[position], // GK↔GS, GD↔GA
    partner: position === 'GK' ? 'GD' : 'GK',
    difficulty,
    windowK: DIFFICULTY[difficulty].window,
    rng,
    quarter,
    beatMs: beatMsFor(quarter),
    t: 0,
    lastBeat: -1,
    phase: 'gap', // gap → flight → approach → block → (rebound) → gap
    nextAt: 0,
    play: null,
    rebound: null,
    pendingPenalty: false,
    shooter,
    me: { ...polar(3 - START_GAP, 0) },
    feeder: { x: GOAL_THIRD.postX, y: GOAL_THIRD.h - 0.4 },
    mate: outsideSpot(rng),
    score: 0,
    combo: 0,
    bestCombo: 0,
    plays: 0,
    stopPerfects: 0,
    stopGreats: 0,
    stopGoods: 0,
    farStops: 0,
    obstructions: 0,
    blocks: 0,
    earlyJumps: 0,
    interferences: 0,
    conceded: 0,
    saves: 0, // 막지는 못했지만 상대 슛이 빗나감
    rebounds: 0,
    reboundsLost: 0,
  };
}

/** 슈터에서 골대 쪽으로 gap(m) 떨어진 자리 (수비는 슈터와 골대 사이에 선다) */
function guardSpot(shooter, gap) {
  const d = distToPost(shooter) || 1;
  return { x: shooter.x + ((GOAL_THIRD.postX - shooter.x) / d) * gap, y: Math.max(0.3, shooter.y + (-shooter.y / d) * gap) };
}

/** 지금 내가 슈터와 떨어진 거리 */
export function currentGap(state) {
  const p = state.play;
  if (!p) return START_GAP;
  if (p.stopGap != null) return p.stopGap;
  if (state.t <= p.catchAt) return START_GAP;
  const speed = (START_GAP - DEFENCE_GAP) / (p.markAt - p.catchAt);
  return Math.max(SLIDE_MIN_GAP, START_GAP - (state.t - p.catchAt) * speed);
}

/** 화면용: 지금 내 자리 */
export function defenderAt(state) {
  const p = state.play;
  if (!p) return state.me;
  if (p.out) return besideSpot(p.at); // 페널티 패스: 옆에 비켜섬 (Rule 6.4)
  return guardSpot(p.at, currentGap(state));
}

function startPlay(state) {
  const { rng } = state;
  const penalty = state.pendingPenalty;
  state.pendingPenalty = false;
  const at = penalty ? { ...state.shooter } : circleSpot(rng, 2.8); // 내가 슈터와 링 사이에 설 자리가 있도록 조금 떨어진 곳
  state.shooter = at;
  state.mate = outsideSpot(rng);
  state.feeder = { x: rand(rng, 2, GOAL_THIRD.w - 2), y: GOAL_THIRD.h - 0.4 };
  const start = Math.min(state.t, state.nextAt);
  const catchAt = start + state.beatMs;
  const cfg = DIFFICULTY[state.difficulty];
  const beats = cfg.approach[Math.floor(rng() * cfg.approach.length)];
  const markAt = catchAt + beats * state.beatMs; // 딱 0.9m가 되는 순간
  state.plays += 1;
  state.play = {
    from: penalty ? { ...at } : { ...state.feeder },
    at: { ...at },
    dist: distToPost(at),
    penalty,
    out: penalty, // 페널티 패스면 나는 아웃 오브 플레이 (다가가기·블록 없음)
    start,
    catchAt,
    approachBeats: beats,
    markAt,
    releaseAt: penalty ? catchAt + state.beatMs : markAt + state.beatMs, // 슈터가 공을 놓는 순간
    landAt: null,
    stopGap: null,
    stopGrade: penalty ? 'penalty' : null,
    jumped: null, // 'early' · 'block' · 'interference'
  };
  state.play.landAt = state.play.releaseAt + SHOT_FLIGHT_BEATS * state.beatMs;
  state.phase = 'flight';
  return { type: 'oppPass', at: { ...at }, penalty };
}

function endPlay(state, gapBeats) {
  state.phase = 'gap';
  state.rebound = null;
  state.nextAt = onBeat(state, state.t + gapBeats * state.beatMs);
}

function bumpCombo(state) {
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  return state.combo >= COMBO_BONUS_FROM ? POINTS.combo : 0;
}

/** 슛 결과: 막지 못한 슛이 링에 닿았다 */
function resolveShot(state, events) {
  const p = state.play;
  let chance = GOAL_CHANCE[p.stopGrade] ?? GOAL_CHANCE.far;
  if (p.jumped === 'early') chance += EARLY_JUMP_BONUS;
  const goal = state.rng() < Math.min(0.95, chance);
  if (goal) {
    state.conceded += 1;
    state.combo = 0;
    events.push({ type: 'conceded', at: { ...p.at }, who: state.shooterPos, penalty: p.penalty, interference: p.jumped === 'interference' });
    endPlay(state, 1);
    return;
  }
  // 빗나감 → 링에 맞고 튕긴 공 다툼 (Rule 11.1c·16.8b)
  state.saves += 1;
  state.phase = 'rebound';
  state.rebound = { at: reboundSpot(state.rng), start: state.t, landAt: onBeat(state, state.t + state.beatMs * 0.75) };
  events.push({ type: 'oppMiss', at: { ...p.at }, reboundAt: { ...state.rebound.at }, who: state.shooterPos });
}

export function advanceDefence(state, dtMs) {
  const events = [];
  state.t += dtMs;
  const beat = Math.floor(state.t / state.beatMs);
  if (beat !== state.lastBeat) {
    state.lastBeat = beat;
    events.push({ type: 'beat', n: beat });
  }
  if (state.phase === 'gap' && state.t >= state.nextAt) events.push(startPlay(state));
  const p = state.play;
  if (state.phase === 'flight' && state.t >= p.catchAt) {
    state.phase = p.out ? 'block' : 'approach';
    events.push({ type: 'oppCatch', at: { ...p.at }, penalty: p.penalty });
  }
  if (state.phase === 'approach' && state.t > p.markAt + WINDOWS.good * state.windowK) {
    // 멈추지 않고 0.9m 안으로 들어갔다 → 장애, 상대 페널티 패스 (Rule 16.1)
    state.obstructions += 1;
    state.combo = 0;
    state.pendingPenalty = true;
    events.push({ type: 'obstruction', at: { ...p.at }, gap: Math.round(currentGap(state) * 100) / 100, who: state.shooterPos });
    endPlay(state, 1);
  }
  if (state.phase === 'block' && state.t >= p.landAt) resolveShot(state, events);
  if (state.phase === 'rebound' && state.t > state.rebound.landAt + REBOUND_WINDOW) {
    state.reboundsLost += 1;
    state.combo = 0;
    events.push({ type: 'reboundLost', at: { ...state.rebound.at }, who: state.shooterPos });
    endPlay(state, 1);
  }
  return events;
}

/** 리바운드 잡기 (아무 버튼) */
function catchRebound(state) {
  const rb = state.rebound;
  const err = state.t - rb.landAt;
  if (err < -REBOUND_WINDOW) return [{ type: 'noBall' }];
  state.rebounds += 1;
  const points = POINTS.rebound + bumpCombo(state);
  state.score += points;
  endPlay(state, 1);
  return [{ type: 'rebound', points, combo: state.combo, at: { ...rb.at }, err: Math.round(err) }];
}

/** 🧍 멈춤 (↓): 0.9m에 맞춰 선다 */
export function stopDefence(state) {
  if (state.phase === 'rebound') return catchRebound(state);
  if (state.phase === 'flight') return [{ type: 'noBall' }];
  if (state.phase !== 'approach') return [];
  const p = state.play;
  const err = state.t - p.markAt;
  const grade = judgeStop(err, state.windowK);
  p.stopGap = currentGap(state);
  p.stopGrade = grade === 'far' ? 'far' : grade;
  state.phase = 'block';
  let points = 0;
  if (grade === 'far') {
    state.farStops += 1;
  } else {
    state[STOP_GRADE_KEY[grade]] += 1;
    points = DEF_POINTS[state.difficulty].stop[grade];
    state.score += points;
  }
  return [{ type: 'stop', grade, points, gap: Math.round(p.stopGap * 100) / 100, err: Math.round(err), at: { ...p.at } }];
}

/** ✋ 블록 (↑): 공이 올라갈 때 뛰어 막는다. 늦으면 떨어지는 공을 건드린 슛 방해 */
export function blockDefence(state) {
  if (state.phase === 'rebound') return catchRebound(state);
  if (state.phase === 'flight') return [{ type: 'noBall' }];
  if (state.phase === 'approach') return [{ type: 'notYet' }]; // 먼저 0.9m에 멈춰야 한다
  if (state.phase !== 'block') return [];
  const p = state.play;
  if (p.out) return [{ type: 'outOfPlay' }]; // 페널티 패스 중에는 플레이할 수 없다 (Rule 6.4)
  if (p.jumped) return [];
  const err = state.t - p.releaseAt;
  const win = WINDOWS.good * state.windowK;
  if (err < -win) {
    p.jumped = 'early';
    state.earlyJumps += 1;
    return [{ type: 'earlyJump', err: Math.round(err) }];
  }
  if (err <= win) {
    // 정당한 블록 (Rule 16.6a): 거리를 지켰을 때만. 너무 멀리 섰으면 손이 닿지 않는다
    if (p.stopGrade === 'far') {
      p.jumped = 'early';
      return [{ type: 'tooFar' }];
    }
    p.jumped = 'block';
    state.blocks += 1;
    const points = DEF_POINTS[state.difficulty].block + bumpCombo(state);
    state.score += points;
    endPlay(state, 1);
    return [{ type: 'block', points, combo: state.combo, err: Math.round(err), at: { ...p.at } }];
  }
  // 떨어지는 공을 건드림 → 슛 방해 (Rule 9.7): 상대 페널티 패스, 들어갈 슛이었다면 골
  p.jumped = 'interference';
  state.interferences += 1;
  state.combo = 0;
  const events = [{ type: 'interference', err: Math.round(err), at: { ...p.at }, who: state.shooterPos }];
  const goal = state.rng() < (GOAL_CHANCE[p.stopGrade] ?? GOAL_CHANCE.far);
  if (goal) {
    state.conceded += 1;
    events.push({ type: 'conceded', at: { ...p.at }, who: state.shooterPos, interference: true });
  }
  state.pendingPenalty = true;
  endPlay(state, 1);
  return events;
}

/** 쿼터 기록 */
export function defenceStats(state) {
  const keys = [
    'score', 'plays', 'stopPerfects', 'stopGreats', 'stopGoods', 'farStops', 'obstructions', 'blocks', 'earlyJumps',
    'interferences', 'conceded', 'saves', 'rebounds', 'reboundsLost', 'bestCombo',
  ];
  return Object.fromEntries(keys.map((k) => [k, state[k]]));
}

