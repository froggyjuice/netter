// 훈련 포지션 랜덤 배정 (허브 2-B). 운영진이 참석 인원을 확정하면 그 안에서 배정한다.
// 결정 사항 (2026-10-17):
//   · 투표 때 원하면 희망 포지션을 고른다. 겹치면 그 안에서 랜덤.
//   · 희망이 안 된 사람은 투표 때 고른 대로 ① 남은 포지션 중 랜덤('random') 또는 ② 희망 포지션의 교체('sub').
//   · 7명이 넘으면 남는 사람은 담당 구역이 넓은 포지션 순서로 교체: C > GA·GD > WA·WD > GS·GK (같은 넓이는 매번 랜덤)
//     (구역 넓이: C 376칸 · GA·GD 300 · WA·WD 263 · GS·GK 150 — zones.allowedCells 기준)
//   · 14명 이상이면 운영진이 팀 수를 정한다.
//   · 7명이 안 되면 C를 먼저, 그다음 GS·GK, GA·GD, WA·WD 순으로 채운다 (C는 꼭 있어야 함, Rule 3.2).
export const COURT = Object.freeze(['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK']);
const FILL_ORDER = [['C'], ['GS', 'GK'], ['GA', 'GD'], ['WA', 'WD']];
const SUB_ORDER = [['C'], ['GA', 'GD'], ['WA', 'WD'], ['GS', 'GK']];
export const MAX_TEAMS = 6;

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/** 넓이 순서대로, 같은 넓이 안에서는 랜덤으로 펼친 포지션 줄 */
const ordered = (groups, rng) => groups.flatMap((g) => shuffle(g, rng));

/** 팀 수 기본값: 14명 미만은 1팀, 그 이상은 운영진이 정한다 (정하지 않으면 7명당 1팀) */
export function defaultTeams(n) {
  return n < 14 ? 1 : Math.min(MAX_TEAMS, Math.floor(n / 7));
}

/** 한 팀 배정 → { starters: { GS: player, … }, subs: [{ pos, player }] } */
function assignTeam(players, rng) {
  const n = players.length;
  // 코트에 세울 포지션 (7명 미만이면 C부터)
  const open = new Set(n >= 7 ? COURT : ordered(FILL_ORDER, rng).slice(0, n));
  const starters = {};
  const subs = [];
  let rest = shuffle(players, rng);

  // 1) 희망 포지션: 포지션마다 원하는 사람 중 랜덤 (포지션 순서도 랜덤)
  for (const pos of shuffle([...open], rng)) {
    const want = rest.filter((p) => p.wish?.includes(pos));
    if (!want.length) continue;
    const who = pick(want, rng);
    starters[pos] = who;
    open.delete(pos);
    rest = rest.filter((p) => p !== who);
  }
  // 2) 희망이 안 된 사람: 'sub' 를 고른 사람은 희망 포지션 교체로, 나머지는 남은 포지션에 랜덤
  const wantsSub = (p) => p.fallback === 'sub' && p.wish?.length;
  for (const p of shuffle(rest.filter((x) => !wantsSub(x)), rng)) {
    if (!open.size) break;
    const pos = pick([...open], rng);
    starters[pos] = p;
    open.delete(pos);
    rest = rest.filter((x) => x !== p);
  }
  // 코트가 비면 안 되므로, 그래도 빈 포지션은 교체를 원한 사람으로 채운다
  for (const p of shuffle(rest, rng)) {
    if (!open.size) break;
    const pos = pick([...open], rng);
    starters[pos] = p;
    open.delete(pos);
    rest = rest.filter((x) => x !== p);
  }
  // 3) 남은 사람은 교체: 희망 교체는 그 포지션, 나머지는 넓은 구역 순서로 돌아가며
  let line = [];
  for (const p of shuffle(rest, rng)) {
    if (wantsSub(p)) {
      subs.push({ pos: pick(p.wish.filter((w) => COURT.includes(w)), rng) ?? 'C', player: p });
      continue;
    }
    if (!line.length) line = ordered(SUB_ORDER, rng);
    subs.push({ pos: line.shift(), player: p });
  }
  subs.sort((a, b) => COURT.indexOf(a.pos) - COURT.indexOf(b.pos));
  return { starters, subs };
}

/**
 * players: [{ id, name, wish: ['GS', …], fallback: 'random'|'sub' }]
 * → { teams: [{ starters, subs }], teamCount }
 * 여러 팀이면 먼저 랜덤으로 고르게 나누고(인원 차이 최대 1명), 팀마다 배정한다.
 */
export function assignPositions(players, { teams, rng = Math.random } = {}) {
  const list = players.filter(Boolean);
  const count = Math.max(1, Math.min(MAX_TEAMS, Math.floor(teams ?? defaultTeams(list.length)), list.length || 1));
  const groups = Array.from({ length: count }, () => []);
  shuffle(list, rng).forEach((p, i) => groups[i % count].push(p));
  return { teamCount: count, teams: groups.map((g) => assignTeam(g, rng)) };
}
