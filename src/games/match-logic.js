// 경기 시간 (순수 로직 → 테스트 가능). 실제 경기와 같은 구조를 줄여서 쓴다.
// 근거: Rules of Netball 2024, Rule 2.1 — 15분 × 4쿼터, 1·2쿼터와 3·4쿼터 사이 4분, 하프타임 12분.
//       Rule 2.2 — 팀은 쿼터마다 코트 끝을 바꾼다. Rule 8.1 — 센터 패스는 두 팀이 번갈아 한다.
// 게임: 실제 15분을 45초로(20배속). 쉬는 시간도 같은 비율(4분 → 12초, 12분 → 36초)이고 바로 넘길 수 있다.
// 게임마다 쿼터 길이를 바꿀 수 있다(createMatch({ quarterMs })). 쉬는 시간도 같은 배속으로 줄어든다.
// 쿼터는 시간이 다 되거나, 몸에 부딪히거나, 실점 3번이면 끝나고(그 쿼터만), 4쿼터가 끝나면 경기 종료.

export const QUARTERS = 4;
export const REAL_QUARTER_MS = 15 * 60 * 1000;
export const QUARTER_MS = 45 * 1000;
export const TIME_SCALE = REAL_QUARTER_MS / QUARTER_MS; // 20배속
/** n쿼터가 끝난 뒤 쉬는 시간 (실제 4분 · 12분 · 4분을 같은 비율로) */
export const BREAK_MS = Object.freeze({ 1: (4 * 60 * 1000) / TIME_SCALE, 2: (12 * 60 * 1000) / TIME_SCALE, 3: (4 * 60 * 1000) / TIME_SCALE });

/** 쿼터 사이 합산하는 기록 (존 스네이크. 다른 게임의 숫자 기록도 이름 그대로 더해진다) */
const SUM_KEYS = ['score', 'balls', 'offsides', 'conceded', 'passes', 'goals', 'circleBlocks', 'blocks', 'contacts', 'intercepts', 'ballsVsOpp', 'penaltiesWon'];
/** 더하지 않고 큰 값을 남기는 기록 (최대 연속 등) */
const isBest = (k) => k.startsWith('best');

export const swapEndsFor = (quarter) => quarter % 2 === 0; // 2·4쿼터는 진영이 바뀐다
export const ourCentrePass = (quarter) => quarter % 2 === 1; // 1·3쿼터는 우리 팀, 2·4쿼터는 상대 팀 센터 패스

export function emptyTotals() {
  const t = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  t.bestChain = 0;
  t.played = [];
  return t;
}

export function createMatch({ quarterMs = QUARTER_MS } = {}) {
  return { quarter: 1, phase: 'play', quarterMs, leftMs: quarterMs, breakLeftMs: 0, totals: emptyTotals(), quarters: [] };
}

/** 이 경기 배속으로 줄인 n쿼터 뒤 쉬는 시간 */
export function breakMsFor(match, quarter) {
  return (BREAK_MS[quarter] * (match.quarterMs ?? QUARTER_MS)) / QUARTER_MS;
}

/** 두 기록을 합친다: 합계 칸은 더하고, 최대 연속(best…)은 큰 값, 뛴 포지션은 순서대로 합집합 */
export function addStats(totals, s) {
  const out = { ...totals };
  for (const k of SUM_KEYS) out[k] = (totals[k] ?? 0) + (s[k] ?? 0);
  for (const [k, v] of Object.entries(s)) {
    if (typeof v !== 'number' || SUM_KEYS.includes(k)) continue;
    out[k] = isBest(k) ? Math.max(totals[k] ?? 0, v) : (totals[k] ?? 0) + v;
  }
  out.bestChain = Math.max(totals.bestChain ?? 0, s.bestChain ?? 0);
  out.played = [...(totals.played ?? [])];
  for (const p of s.played ?? []) if (!out.played.includes(p)) out.played.push(p);
  return out;
}

/**
 * 시계를 dtMs 만큼 진행한다. 반환: 'timeUp'(쿼터 시간 끝) · 'breakOver'(쉬는 시간 끝) · null
 * 시계는 휘슬 뒤 경기 중에만 흐른다(일시정지·휘슬 전에는 부르지 않는다).
 */
export function advanceClock(match, dtMs) {
  if (match.phase === 'play') {
    match.leftMs = Math.max(0, match.leftMs - dtMs);
    return match.leftMs === 0 ? 'timeUp' : null;
  }
  if (match.phase === 'break') {
    match.breakLeftMs = Math.max(0, match.breakLeftMs - dtMs);
    return match.breakLeftMs === 0 ? 'breakOver' : null;
  }
  return null;
}

/** 쿼터를 끝낸다: 기록을 더하고, 4쿼터면 경기 종료, 아니면 쉬는 시간 */
export function endQuarter(match, quarterStats, reason) {
  if (match.phase !== 'play') return match;
  match.totals = addStats(match.totals, quarterStats);
  match.quarters.push({ quarter: match.quarter, reason, score: quarterStats.score ?? 0 });
  if (match.quarter >= QUARTERS) {
    match.phase = 'over';
  } else {
    match.phase = 'break';
    match.breakLeftMs = breakMsFor(match, match.quarter);
  }
  return match;
}

export function startNextQuarter(match) {
  if (match.phase !== 'break') return match;
  match.quarter += 1;
  match.phase = 'play';
  match.leftMs = match.quarterMs ?? QUARTER_MS;
  match.breakLeftMs = 0;
  return match;
}

/** 남은 게임 시간을 실제 경기 시계(15:00 → 00:00)로. quarterMs: 이 경기의 쿼터 길이 */
export function matchClock(leftMs, quarterMs = QUARTER_MS) {
  const realSec = Math.ceil((leftMs * (REAL_QUARTER_MS / quarterMs)) / 1000);
  const m = Math.floor(realSec / 60);
  const s = realSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 쉬는 시간 남은 시간(실제 시간, 초) */
export const breakSeconds = (ms) => Math.ceil(ms / 1000);
