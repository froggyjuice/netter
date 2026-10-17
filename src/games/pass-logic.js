// 패스 퍼즐 규칙 (순수 로직 → 테스트 가능). 스테이지 데이터는 pass-stages.js, 그리기는 pass.js.
// 근거: World Netball「Rules of Netball」2024
//   Rule 12.1 — 숏 패스: 상대가 가로챌 수 있을 만큼 공간이 있어야 한다 → 바로 옆 칸(0.9m 안) 패스는 반칙
//   Rule 12.3·12.4 — 공은 세 서드 모두에서 잡혀야 한다 → 수비 서드 ↔ 공격 서드 바로 패스는 반칙(Over a third)
//   Rule 12.5 — 잡은 뒤 옆 서드로 한 발 디뎌도, 다음 패스는 처음 착지한 서드에서 한 것으로 본다
//   Rule 13   — 풋워크: 잡은 뒤 한 발은 디딜 수 있다(피벗). 두 번째 발을 옮기면 반칙
//   Rule 14   — 오프사이드: 자기 구역 밖으로 나가면 반칙
//   Rule 11.4 — 3초 안에 패스하거나 슛 (3초 스테이지)
//   Rule 9.1·9.6a — 슛은 GS·GA가 골 서클 안에서만
// 반칙 패스·인터셉트는 '던지면 실패': 상대 공이 되고 스테이지를 다시 한다.
// 좌표: 존 스네이크와 같은 30×15 칸, 오른쪽이 공격 방향.
import { COURT, POSITIONS, isAllowed, zoneOf, canShootAt } from '../shared/zones.js';

export const HOLD_MS = 3000; // Rule 11.4
/** 서드: 0 = 수비(0~9칸), 1 = 센터(10~19), 2 = 공격(20~29) */
export const thirdOf = (c) => Math.min(2, Math.max(0, Math.floor(c / COURT.third)));
export const THIRD_NAMES = Object.freeze(['수비 서드', '센터 서드', '공격 서드']);

/** 상대 팀 선수(자기 포지션 이름 그대로)가 우리 코트 기준으로 설 수 있는 칸: 구역 z ↔ 6−z */
export function oppAllowed(pos, c, r) {
  const p = POSITIONS[pos];
  return Boolean(p) && p.zones.map((z) => 6 - z).includes(zoneOf(c, r));
}

const cheb = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
const same = (a, b) => a.c === b.c && a.r === b.r;

/** 칸 중심 사이 선분에서 점(칸 중심)까지의 거리 */
function distToSegment(p, a, b) {
  const [ax, ay, bx, by, px, py] = [a.c, a.r, b.c, b.r, p.c, p.r];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { d: Math.hypot(ax + t * dx - px, ay + t * dy - py), t };
}

/** 공의 길(선분)에서 0.5칸 안에 선 상대 = 인터셉트 (양 끝 칸은 제외) */
export function interceptor(state, from, to) {
  for (const o of state.opponents) {
    if (same(o, from) || same(o, to)) continue;
    const { d, t } = distToSegment(o, from, to);
    if (d < 0.6 && t > 0 && t < 1) return o;
  }
  return null;
}

/**
 * @param {object} stage pass-stages.js 의 스테이지
 * @param {{ placements?: Record<string, {c:number,r:number}> }} opts 배치 스테이지에서 고른 자리
 */
export function createPuzzle(stage, { placements = {} } = {}) {
  const players = stage.players.map((p) => ({ ...p, ...(placements[p.pos] ?? {}) }));
  const holder = players.find((p) => p.pos === stage.ball);
  return {
    stageId: stage.id,
    players,
    opponents: stage.opponents.map((o) => ({ ...o })),
    holder: holder.pos,
    catchCell: { c: holder.c, r: holder.r }, // 처음 착지한 칸 (Rule 12.5)
    stepped: false, // 이번 소유에서 한 발 디뎠는가 (Rule 13)
    passes: 0,
    path: [{ pos: holder.pos, c: holder.c, r: holder.r }],
    over: null, // { win: true } | { win: false, reason, rule, text }
    timer: Boolean(stage.timer),
    pivot: Boolean(stage.pivot),
  };
}

export const playerAt = (state, c, r) => state.players.find((p) => p.c === c && p.r === r) ?? null;
export const opponentAt = (state, c, r) => state.opponents.find((o) => o.c === c && o.r === r) ?? null;
const holderOf = (state) => state.players.find((p) => p.pos === state.holder);

/** 배치 확인: 모든 선수가 자기 구역 안, 겹치지 않음, 상대 칸이 아님 */
export function placementProblems(stage, placements) {
  const st = createPuzzle(stage, { placements });
  const problems = [];
  const seen = new Set();
  for (const p of st.players) {
    const key = `${p.c},${p.r}`;
    if (!isAllowed(p.pos, p.c, p.r)) problems.push({ pos: p.pos, reason: 'offside' });
    else if (seen.has(key) || opponentAt(st, p.c, p.r)) problems.push({ pos: p.pos, reason: 'occupied' });
    seen.add(key);
  }
  return problems;
}

const FAIL = {
  short: { rule: 'Rule 12.1', text: '숏 패스 반칙(Short pass)! 바로 옆 동료에게는 패스할 수 없어요. 상대가 가로챌 수 있을 만큼 떨어진 동료에게 다시 해 봐요.' },
  overThird: { rule: 'Rule 12.3', text: '서드 건너뛰기 반칙(Over a third)! 공은 세 서드 모두에서 잡혀야 해요. 센터 서드의 동료를 거치도록 다시 해 봐요.' },
  intercept: { rule: 'Rule 16.6', text: '인터셉트! 공의 길 위에 상대가 서 있었어요. 상대를 피하는 길을 찾아 다시 해 봐요.' },
  footwork: { rule: 'Rule 13', text: '풋워크 반칙! 공을 잡은 뒤에는 한 발만 디딜 수 있어요. 한 발만 디뎌 다시 해 봐요.' },
  offside: { rule: 'Rule 14', text: '오프사이드 반칙! 자기 구역 밖으로는 나갈 수 없어요. 구역 안으로 디뎌 다시 해 봐요.' },
  shot: { rule: 'Rule 9.1·9.6a', text: '슛은 GS·GA가 골 서클 안에서만 할 수 있어요.' },
  incorrectShot: { rule: 'Rule 9.6a', text: '서클 밖에서 공을 잡았어요! 한 발 디뎌 서클에 들어와도 슛할 수 없어요 (잡을 때 밖을 밟았으니까).' },
  held: { rule: 'Rule 11.4', text: '3초가 지났어요(Held ball)! 공을 잡으면 3초 안에 패스하거나 슛해야 해요.' },
};
export const FAIL_REASONS = FAIL;

function fail(state, reason, extra = {}) {
  state.over = { win: false, reason, ...FAIL[reason], ...extra };
  return [{ type: 'fail', reason, ...FAIL[reason], ...extra }];
}

/** 이 패스가 규칙상 괜찮은가 (실제로 던지지는 않는다). 반환: null(괜찮음) 또는 { reason, ... } */
export function checkPass(state, toPos) {
  const from = holderOf(state);
  const to = state.players.find((p) => p.pos === toPos);
  if (!to || to === from) return { reason: 'none' };
  if (cheb(from, to) <= 1) return { reason: 'short' };
  // 서드는 처음 착지한 칸 기준 (Rule 12.5)
  if (Math.abs(thirdOf(state.catchCell.c) - thirdOf(to.c)) >= 2) return { reason: 'overThird' };
  const o = interceptor(state, from, to);
  if (o) return { reason: 'intercept', by: o.pos, at: { c: o.c, r: o.r } };
  return null;
}

/** 패스: 받을 선수를 고른다 */
export function passTo(state, toPos) {
  if (state.over) return [];
  const from = holderOf(state);
  const to = state.players.find((p) => p.pos === toPos);
  if (!to || to === from) return [];
  const problem = checkPass(state, toPos);
  state.passes += 1;
  if (problem) {
    return [{ type: 'pass', from: { c: from.c, r: from.r }, to: { c: to.c, r: to.r }, toPos, ok: false }, ...fail(state, problem.reason, problem)];
  }
  state.holder = to.pos;
  state.catchCell = { c: to.c, r: to.r };
  state.stepped = false;
  state.path.push({ pos: to.pos, c: to.c, r: to.r });
  return [{ type: 'pass', from: { c: from.c, r: from.r }, to: { c: to.c, r: to.r }, toPos, ok: true, passes: state.passes }];
}

/** 피벗: 공을 든 선수가 옆 칸(대각선 포함)으로 한 발 */
export function step(state, c, r) {
  if (state.over) return [];
  const h = holderOf(state);
  if (cheb(h, { c, r }) !== 1) return [];
  if (playerAt(state, c, r) || opponentAt(state, c, r)) return [];
  if (!state.pivot) return [{ type: 'noPivot' }]; // 이 스테이지는 피벗 없이 (풋워크 챕터에서 배운다)
  if (state.stepped) return fail(state, 'footwork');
  if (!isAllowed(h.pos, c, r)) return fail(state, 'offside', { pos: h.pos });
  const from = { c: h.c, r: h.r };
  h.c = c;
  h.r = r;
  state.stepped = true;
  return [{ type: 'step', pos: h.pos, from, to: { c, r }, thirdChanged: thirdOf(c) !== thirdOf(state.catchCell.c) }];
}

/** 슛 */
export function shoot(state) {
  if (state.over) return [];
  const h = holderOf(state);
  if (!canShootAt(h.pos, h.c, h.r)) return fail(state, 'shot', { pos: h.pos });
  // 서클 밖에서 잡고 한 발 디뎌 들어와도 슛할 수 없다: 잡을 때 서클 밖 땅을 밟았다 (Rule 9.6a)
  if (!canShootAt(h.pos, state.catchCell.c, state.catchCell.r)) return fail(state, 'incorrectShot', { pos: h.pos });
  state.over = { win: true };
  return [{ type: 'goal', pos: h.pos, at: { c: h.c, r: h.r }, passes: state.passes }];
}

/** 3초 스테이지: 공을 잡은 뒤 3초가 지났다 */
export function heldBall(state) {
  if (state.over || !state.timer) return [];
  return fail(state, 'held');
}

/** 별: 기준 패스 수 이하 ⭐⭐⭐, +1 ⭐⭐, 그 이상 ⭐ */
export function starsFor(passes, par) {
  if (passes <= par) return 3;
  if (passes <= par + 1) return 2;
  return 1;
}

/**
 * 가장 적은 패스로 슛까지 가는 길 (테스트·힌트용). 피벗(한 발)도 고려한다.
 * 반환: { passes, moves: [{ type: 'pass', to } | { type: 'step', c, r } | { type: 'shoot' }] } 또는 null
 */
export function solve(stage, opts = {}) {
  const start = createPuzzle(stage, opts);
  const keyOf = (st) => `${st.holder}|${holderOf(st).c},${holderOf(st).r}|${st.catchCell.c},${st.catchCell.r}|${st.stepped}`;
  const clone = (st) => ({ ...st, players: st.players.map((p) => ({ ...p })), catchCell: { ...st.catchCell }, path: [...st.path] });
  const queue = [{ st: start, moves: [] }];
  const seen = new Set([keyOf(start)]);
  while (queue.length) {
    // 패스 수가 적은 순서 (피벗은 패스로 세지 않는다)
    queue.sort((a, b) => a.st.passes - b.st.passes);
    const { st, moves } = queue.shift();
    const h = holderOf(st);
    if (canShootAt(h.pos, h.c, h.r) && canShootAt(h.pos, st.catchCell.c, st.catchCell.r)) return { passes: st.passes, moves: [...moves, { type: 'shoot' }] };
    for (const p of st.players) {
      if (p.pos === st.holder || checkPass(st, p.pos)) continue;
      const next = clone(st);
      passTo(next, p.pos);
      const k = keyOf(next);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push({ st: next, moves: [...moves, { type: 'pass', to: p.pos }] });
      }
    }
    if (!st.stepped && stage.pivot) {
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const c = h.c + dc;
          const r = h.r + dr;
          if ((!dc && !dr) || !isAllowed(h.pos, c, r) || playerAt(st, c, r) || opponentAt(st, c, r)) continue;
          const next = clone(st);
          step(next, c, r);
          const k = keyOf(next);
          if (!seen.has(k)) {
            seen.add(k);
            queue.push({ st: next, moves: [...moves, { type: 'step', c, r }] });
          }
        }
      }
    }
  }
  return null;
}
