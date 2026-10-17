// 리듬 슈팅 규칙 (순수 로직 → 테스트 가능). 그리기·입력은 rhythm.js.
// 근거: World Netball「Rules of Netball」2024
//   Rule 9.1  — 골은 GS·GA가 골 서클 안(선 포함)에서 쏜 슛이 링을 위에서 완전히 통과했을 때
//   Rule 9.6a — 골 서클 밖 땅을 밟은 채 슛하면(잡을 때 포함) Incorrect shot: 상대 프리 패스, 골 무효
//   Rule 9.6b — 공을 잡고 3초 안에 슛해야 한다(Held ball: 상대 프리 패스)
//   Rule 9.7  — 수비가 링으로 떨어지는 공을 건드리면 Interference with shot: 페널티 패스, 들어간 슛은 골 인정
//   Rule 6.6  — 골 서클 안 GS·GA는 페널티 패스를 슛으로 할 수 있다
//   Rule 6.4  — 페널티 패스 때 반칙한 선수는 옆에 비켜서서 공이 떠날 때까지 플레이할 수 없다
//   Rule 11.1c — 골대에 맞고 튕긴 공(리바운드)을 잡을 수 있다
//   Rule 11.6 — 공을 놓은 뒤에는 다른 선수가 만지거나 골대에 맞기 전까지 다시 만질 수 없다(Repossession)
//   Rule 16.1 — 공을 가진 선수를 수비할 때는 0.9m 이상 떨어진다 (화면의 상대 수비는 항상 이 거리를 지킨다)
//   Rule 16.8b — 빗나간 슛의 리바운드는 0.9m 안에서도 팔을 뻗어 잡을 수 있다
//
// 좌표(m): 골 서드를 골라인이 위에 오도록 본다. x = 코트 폭 방향(0~15.25), y = 골라인에서 코트 안쪽(0~10.17)
// 한 번의 플레이: 동료 패스가 날아옴(1박) → 잡음 → 서클 안이면 1~2박 뒤가 슛 타이밍(줄어드는 링), 밖이면 패스가 정답
// 아깝게 빗나간 슛은 링에 맞고 튕겨 1박 뒤 골대 근처에 떨어진다 → 박자에 맞춰 누르면 리바운드
import { MATCHUP } from '../shared/zones.js';

export const GOAL_THIRD = Object.freeze({ w: 15.25, h: 10.17, postX: 7.625, circleR: 4.9, ringY: 0.62 }); // ringY: 화면에 링을 그리는 위치(골라인에서 살짝 안쪽)
export const RHYTHM_QUARTER_MS = 30_000; // 실제 15분 쿼터 = 30초
export const HOLD_MS = 3000; // 3초 룰 (Rule 9.6b)
export const BPM = Object.freeze([84, 96, 108, 120]); // 쿼터마다 빨라진다
export const APPROACH_BEATS = 2; // 잡은 뒤 몇 박 뒤가 슛 타이밍인가 (보통)
export const WINDOWS = Object.freeze({ perfect: 70, great: 140, good: 220 }); // 판정 범위(ms, 가까운 슛 · 보통 기준)
export const POINTS = Object.freeze({ feed: 10, combo: 10, rebound: 10 });
export const COMBO_BONUS_FROM = 5; // 5연속부터 보너스
export const MAX_INTERFERENCE = 2; // 한 쿼터에 수비 방해(9.7) 이벤트 최대 횟수
export const REBOUND_WINDOW = 200; // 리바운드를 잡는 판정 범위(ms, ±)
export const RIM_FACTOR = 2; // Good 범위의 2배 안으로 빗나가면 링에 맞는다(리바운드), 그 밖은 에어볼
export const LINE_CHANCE = 0.2; // 서클 선 위·선 바로 밖에서 받는 플레이 비율
const INTERFERENCE_CHANCE = 0.15;
const DEFENCE_GAP = 0.9; // Rule 16.1
const GRADE_KEY = Object.freeze({ perfect: 'perfects', great: 'greats', good: 'goods', miss: 'misses' });

/** 난이도: 판정 범위 배율 · 점수 · 줄어드는 원 길이(박) · 엇박 패스가 나오는 쿼터 */
export const DIFFICULTY = Object.freeze({
  easy: { label: '쉬움', window: 1.3, points: { perfect: 20, great: 10, good: 10 }, approach: [2], offbeatFrom: 0 },
  normal: { label: '보통', window: 1, points: { perfect: 30, great: 20, good: 10 }, approach: [2], offbeatFrom: 0 },
  hard: { label: '어려움', window: 0.7, points: { perfect: 40, great: 30, good: 20 }, approach: [1, 2], offbeatFrom: 3 },
});
export const DIFFICULTY_KEYS = Object.freeze(Object.keys(DIFFICULTY));
const OFFBEAT_CHANCE = 0.3;

export const SHOOTERS = Object.freeze(['GS', 'GA']);
export const PARTNER = Object.freeze({ GS: 'GA', GA: 'GS' });
/** 서클 안에서 잡을 확률: GS는 주로 서클 안, GA는 서클 밖에서도 많이 받는다 */
const CIRCLE_CHANCE = Object.freeze({ GS: 0.75, GA: 0.55 });

export const beatMsFor = (quarter) => 60_000 / BPM[Math.min(BPM.length, Math.max(1, quarter)) - 1];

/** 골대(링 아래 골라인 가운데)까지의 거리(m) */
export const distToPost = (p) => Math.hypot(p.x - GOAL_THIRD.postX, p.y);
/** 골 서클 안(선 포함)인가 (Rule 9.1) */
export const inCircle = (p) => distToPost(p) <= GOAL_THIRD.circleR + 1e-9;

/** 멀리서 쏠수록 판정 범위가 좁아진다 (서클 끝에서 65%) */
export const windowScale = (dist) => 1 - 0.35 * Math.min(1, Math.max(0, dist / GOAL_THIRD.circleR));

/** 슛 타이밍 판정. errMs: 누른 시각 − 딱 맞는 시각 (음수면 빠름), k: 난이도 배율 */
export function judge(errMs, dist, k = 1) {
  const s = windowScale(dist) * k;
  const e = Math.abs(errMs);
  if (e <= WINDOWS.perfect * s) return 'perfect';
  if (e <= WINDOWS.great * s) return 'great';
  if (e <= WINDOWS.good * s) return 'good';
  return 'miss';
}

/** 빗나간 슛이 링에 맞는가(리바운드) · 에어볼인가 */
export const missKind = (errMs, dist, k = 1) =>
  Math.abs(errMs) <= WINDOWS.good * windowScale(dist) * k * RIM_FACTOR ? 'rim' : 'air';

export const rand = (rng, a, b) => a + rng() * (b - a);
export const clampX = (x) => Math.min(GOAL_THIRD.w - 0.6, Math.max(0.6, x));

/** 골대 기준 거리 d, 각도 a(0 = 정면, ±는 옆)인 점 */
export function polar(d, a) {
  return { x: GOAL_THIRD.postX + Math.sin(a) * d, y: Math.cos(a) * d };
}

/** 서클 안에서 잡는 자리 */
export function circleSpot(rng, minD = 2.2, maxD = GOAL_THIRD.circleR - 0.25) {
  return polar(rand(rng, minD, maxD), rand(rng, -1.15, 1.15));
}

/** 서클 선 근처: 'on' = 선 위(서클 안), 'out' = 선 바로 밖 */
function lineSpot(rng, kind) {
  const R = GOAL_THIRD.circleR;
  const d = kind === 'on' ? rand(rng, R - 0.12, R) : rand(rng, R + 0.12, R + 0.45);
  return polar(d, rand(rng, -1.1, 1.1));
}

/** 서클 밖(골 서드 안)에서 잡는 자리 */
export function outsideSpot(rng) {
  for (let i = 0; i < 50; i++) {
    const p = { x: rand(rng, 0.8, GOAL_THIRD.w - 0.8), y: rand(rng, 1, GOAL_THIRD.h - 0.8) };
    const d = distToPost(p);
    if (d >= GOAL_THIRD.circleR + 0.5 && d <= GOAL_THIRD.circleR + 4) return p;
  }
  return polar(GOAL_THIRD.circleR + 1.5, 0);
}

/** 링에 맞고 튕긴 공이 떨어지는 자리: 골대 앞 1~2m (서클 안) */
export function reboundSpot(rng) {
  return polar(rand(rng, 1.1, 2), rand(rng, -1, 1));
}

/** 공을 가진 나와 골대 사이, 0.9m 이상 떨어져 선 상대 수비 (Rule 16.1) */
function defenderSpot(me, rng) {
  const d = distToPost(me) || 1;
  const ux = (GOAL_THIRD.postX - me.x) / d;
  const uy = -me.y / d;
  const gap = DEFENCE_GAP + rand(rng, 0.15, 0.45);
  return { x: me.x + ux * gap, y: Math.max(0.3, me.y + uy * gap) };
}

/** 페널티 패스 때 상대 수비는 내 옆에 비켜선다 (Rule 6.4) */
export function besideSpot(me) {
  const side = me.x < GOAL_THIRD.postX ? 1 : -1;
  return { x: clampX(me.x + side * 1.1), y: me.y + 0.2 };
}

/**
 * @param {'GS'|'GA'} position
 * @param {() => number} rng
 * @param {{ quarter?: number, difficulty?: 'easy'|'normal'|'hard' }} opts
 */
export function createRhythm(position, rng = Math.random, { quarter = 1, difficulty = 'normal' } = {}) {
  if (!SHOOTERS.includes(position)) throw new Error(`슛은 GS·GA만 할 수 있어요: ${position}`);
  if (!DIFFICULTY[difficulty]) throw new Error(`난이도: ${difficulty}`);
  const me = polar(3, 0);
  return {
    position,
    partner: PARTNER[position],
    defenderPos: MATCHUP[position], // GS↔GK, GA↔GD
    difficulty,
    windowK: DIFFICULTY[difficulty].window,
    rng,
    quarter,
    beatMs: beatMsFor(quarter),
    t: 0,
    lastBeat: -1,
    phase: 'gap', // gap → flight → hold → (rebound) → gap
    nextAt: 0, // 휘슬 뒤 바로 첫 패스
    play: null,
    rebound: null,
    me,
    mate: polar(5.8, 0.5), // 짝 슈터
    feeder: { x: GOAL_THIRD.postX, y: GOAL_THIRD.h - 0.4 }, // 골 서드 끝에서 공을 넣어 주는 동료
    defender: { ...defenderSpot(me, rng), out: false },
    pendingPenalty: false,
    interferenceCount: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    shots: 0,
    goals: 0,
    perfects: 0,
    greats: 0,
    goods: 0,
    misses: 0,
    incorrectShots: 0,
    helds: 0,
    feeds: 0,
    circlePasses: 0,
    interferences: 0,
    penaltyShots: 0,
    rebounds: 0,
    reboundsLost: 0,
    airBalls: 0,
    lineShots: 0,
    lineGoals: 0, // 서클 선 위에서 넣은 골
  };
}

/** 다음 박 위에서 시작하도록 맞춘다 (리듬이 어긋나지 않게) */
export function onBeat(state, at) {
  return Math.ceil(at / state.beatMs - 1e-9) * state.beatMs;
}

/** 공을 잡은 플레이 정보 (패스로 받음 · 페널티 · 리바운드 공통) */
function makePlay(state, { from, meFrom, at, start, catchAt, penalty = false, rebound = false, line = null }) {
  const circle = inCircle(at);
  const cfg = DIFFICULTY[state.difficulty];
  const beats = cfg.approach[Math.floor(state.rng() * cfg.approach.length)];
  return {
    from,
    meFrom,
    at: { ...at },
    inCircle: circle,
    dist: distToPost(at),
    penalty,
    rebound,
    line, // 'on' = 선 위(안) · 'out' = 선 바로 밖 · null
    start,
    catchAt,
    approachBeats: beats,
    perfectAt: circle ? catchAt + beats * state.beatMs : null,
    holdEnd: catchAt + HOLD_MS,
    late: false,
  };
}

function startPlay(state) {
  const { rng } = state;
  const penalty = state.pendingPenalty;
  state.pendingPenalty = false;
  const meFrom = { ...state.me };
  let at;
  let line = null;
  if (penalty) {
    at = { ...state.me }; // 반칙이 일어난 자리(내 자리)에서 페널티 패스 (Rule 6.6)
  } else if (rng() < LINE_CHANCE) {
    line = rng() < 0.5 ? 'on' : 'out';
    at = lineSpot(rng, line);
  } else {
    at = rng() < CIRCLE_CHANCE[state.position] ? circleSpot(rng) : outsideSpot(rng);
  }
  const circle = inCircle(at);
  // 짝 슈터: 내가 서클 안이면 서클 밖에서 돕고, 내가 밖이면 서클 안에서 패스를 기다린다
  state.mate = circle ? outsideSpot(rng) : circleSpot(rng, 1.5, 3.6);
  state.feeder = { x: clampX(rand(state.rng, 2, GOAL_THIRD.w - 2)), y: GOAL_THIRD.h - 0.4 };
  state.me = at;
  state.defender = penalty ? { ...besideSpot(at), out: true } : { ...defenderSpot(at, rng), out: false };
  const start = Math.min(state.t, state.nextAt); // 박자 위에서 시작한 것으로 친다
  const catchAt = start + state.beatMs; // 패스가 날아오는 1박 (페널티면 심판이 자리를 잡아 주는 1박)
  state.play = makePlay(state, { from: penalty ? { ...at } : { ...state.feeder }, meFrom, at, start, catchAt, penalty, line });
  state.phase = 'flight';
  return { type: 'pass', at: { ...at }, inCircle: circle, penalty, line };
}

function endPlay(state, gapBeats) {
  state.phase = 'gap';
  state.rebound = null;
  let next = onBeat(state, state.t + gapBeats * state.beatMs);
  // 어려움: 3쿼터부터 가끔 반 박 늦게 오는 엇박 패스
  const from = DIFFICULTY[state.difficulty].offbeatFrom;
  if (from && state.quarter >= from && state.rng() < OFFBEAT_CHANCE) next += state.beatMs / 2;
  state.nextAt = next;
  if (state.defender.out) state.defender.out = false; // 공이 떠났으니 다시 플레이 (Rule 6.4)
}

function bumpCombo(state) {
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  return state.combo >= COMBO_BONUS_FROM ? POINTS.combo : 0;
}

/** 시간을 dtMs 진행한다. 반환: 이벤트 목록 */
export function advance(state, dtMs) {
  const events = [];
  state.t += dtMs;
  const beat = Math.floor(state.t / state.beatMs);
  if (beat !== state.lastBeat) {
    state.lastBeat = beat;
    events.push({ type: 'beat', n: beat });
  }
  if (state.phase === 'gap' && state.t >= state.nextAt) {
    events.push(startPlay(state));
  }
  const p = state.play;
  if (state.phase === 'flight' && state.t >= p.catchAt) {
    state.phase = 'hold';
    events.push({ type: 'catch', inCircle: p.inCircle, penalty: p.penalty, line: p.line, at: { ...p.at } });
  }
  if (state.phase === 'hold') {
    if (p.inCircle && !p.late && state.t > p.perfectAt + WINDOWS.good * windowScale(p.dist) * state.windowK) {
      p.late = true;
      events.push({ type: 'late' }); // 타이밍을 놓쳤다 (아직 3초 전이면 패스할 수 있다)
    }
    if (state.t >= p.holdEnd) {
      state.helds += 1;
      state.combo = 0;
      events.push({ type: 'held', at: { ...p.at } });
      endPlay(state, 2);
    }
  }
  if (state.phase === 'rebound' && state.t > state.rebound.landAt + REBOUND_WINDOW) {
    // 리바운드를 놓쳤다 → 상대 수비가 잡는다
    state.reboundsLost += 1;
    state.me = { ...state.rebound.at }; // 리바운드하러 달려간 자리에서 다음 플레이 시작
    events.push({ type: 'reboundLost', at: { ...state.rebound.at }, who: state.defenderPos });
    endPlay(state, 1);
  }
  return events;
}

/** 리바운드 잡기 (슛·패스 버튼 아무거나) */
function catchRebound(state) {
  const rb = state.rebound;
  const err = state.t - rb.landAt;
  if (err < -REBOUND_WINDOW) return [{ type: 'noBall' }]; // 아직 떨어지는 중
  state.rebounds += 1;
  const points = POINTS.rebound + bumpCombo(state);
  state.score += points;
  const meFrom = { ...state.me };
  state.me = { ...rb.at };
  state.defender = { ...defenderSpot(rb.at, state.rng), out: false };
  // 잡은 자리에서 다시 3초 · 재슛 (리바운드는 언제나 서클 안)
  state.play = makePlay(state, { from: { ...rb.at }, meFrom, at: rb.at, start: state.t, catchAt: state.t, rebound: true });
  state.phase = 'hold';
  state.rebound = null;
  return [{ type: 'rebound', points, combo: state.combo, at: { ...rb.at }, err: Math.round(err) }];
}

/** 슛 버튼 */
export function shoot(state) {
  if (state.phase === 'rebound') return catchRebound(state);
  if (state.phase === 'flight') return [{ type: 'noBall' }];
  if (state.phase !== 'hold') return [];
  const p = state.play;
  if (!p.inCircle) {
    // 서클 밖에서 슛 → Incorrect shot, 골 무효, 상대 프리 패스 (Rule 9.6a). 선 바로 밖에서 잡았어도 마찬가지
    state.incorrectShots += 1;
    state.combo = 0;
    endPlay(state, 2);
    return [{ type: 'incorrectShot', at: { ...p.at }, dist: p.dist, line: p.line }];
  }
  const err = state.t - p.perfectAt;
  const grade = judge(err, p.dist, state.windowK);
  const goal = grade !== 'miss';
  state.shots += 1;
  state[GRADE_KEY[grade]] += 1;
  if (p.penalty) state.penaltyShots += 1;
  if (p.line === 'on') state.lineShots += 1;
  let points = 0;
  if (goal) {
    state.goals += 1;
    if (p.line === 'on') state.lineGoals += 1;
    points = DIFFICULTY[state.difficulty].points[grade] + bumpCombo(state);
    state.score += points;
  } else {
    state.combo = 0;
  }
  // 상대 수비가 떨어지는 공을 건드림 → 페널티 패스, 들어간 슛은 그대로 골 (Rule 9.7)
  let interference = false;
  if (!p.penalty && !p.rebound && state.interferenceCount < MAX_INTERFERENCE && state.rng() < INTERFERENCE_CHANCE) {
    interference = true;
    state.interferenceCount += 1;
    state.interferences += 1;
    state.pendingPenalty = true;
  }
  // 빗나간 슛: 링에 맞으면 리바운드(Rule 11.1c), 에어볼이면 슛한 사람은 다시 잡을 수 없다(Rule 11.6)
  let miss = null;
  if (!goal && !interference) miss = missKind(err, p.dist, state.windowK);
  if (miss === 'rim') {
    state.phase = 'rebound';
    state.rebound = { at: reboundSpot(state.rng), start: state.t, landAt: onBeat(state, state.t + state.beatMs * 0.75) };
  } else {
    if (miss === 'air') state.airBalls += 1;
    endPlay(state, interference ? 2 : 1);
  }
  return [{
    type: 'shot', grade, goal, points, err: Math.round(err), combo: state.combo, at: { ...p.at },
    penalty: p.penalty, rebound: p.rebound, line: p.line, interference, miss, who: state.defenderPos,
    reboundAt: state.rebound ? { ...state.rebound.at } : null,
  }];
}

/** 패스 버튼 */
export function pass(state) {
  if (state.phase === 'rebound') return catchRebound(state);
  if (state.phase === 'flight') return [{ type: 'noBall' }];
  if (state.phase !== 'hold') return [];
  const p = state.play;
  const to = { ...state.mate };
  if (!p.inCircle) {
    // 서클 밖: 슛할 수 없으니 서클 안의 짝 슈터에게 — 정답
    state.feeds += 1;
    const points = POINTS.feed + bumpCombo(state);
    state.score += points;
    endPlay(state, 1);
    return [{ type: 'feed', points, combo: state.combo, from: { ...p.at }, to, line: p.line }];
  }
  // 서클 안에서도 패스는 반칙이 아니다. 점수는 없지만 연속은 이어진다
  state.circlePasses += 1;
  endPlay(state, 1);
  return [{ type: 'circlePass', from: { ...p.at }, to, penalty: p.penalty }];
}

/** 쿼터 기록 (match-logic addStats로 더한다) */
export function rhythmStats(state) {
  const keys = [
    'score', 'shots', 'goals', 'perfects', 'greats', 'goods', 'misses', 'incorrectShots', 'helds', 'feeds', 'circlePasses',
    'interferences', 'penaltyShots', 'rebounds', 'reboundsLost', 'airBalls', 'lineShots', 'lineGoals', 'bestCombo',
  ];
  return Object.fromEntries(keys.map((k) => [k, state[k]]));
}
