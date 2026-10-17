import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPositions, defaultTeams, COURT } from '../src/shared/position-assign.js';

/** 씨앗 있는 난수 (매번 같은 결과) */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const people = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `선수${i + 1}`, wish: [], fallback: 'random', ...extra(i) }));
const everyone = (team) => [...Object.values(team.starters), ...team.subs.map((s) => s.player)];

test('7명: 7 포지션에 한 명씩, 모두 한 번만', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { teams } = assignPositions(people(7), { rng: seeded(seed) });
    assert.deepEqual(Object.keys(teams[0].starters).sort(), [...COURT].sort());
    assert.equal(new Set(everyone(teams[0]).map((p) => p.id)).size, 7);
    assert.equal(teams[0].subs.length, 0);
  }
});

test('7명 미만: C는 꼭, 그다음 GS·GK', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t5 = assignPositions(people(5), { rng: seeded(seed) }).teams[0];
    assert.ok(t5.starters.C && t5.starters.GS && t5.starters.GK);
    assert.equal(Object.keys(t5.starters).length, 5);
  }
});

test('희망 포지션: 겹치지 않으면 그대로, 겹치면 그중 한 명', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const ps = people(7, (i) => (i === 0 ? { wish: ['GS'] } : i === 1 ? { wish: ['GK'] } : i === 2 || i === 3 ? { wish: ['C'] } : {}));
    const t = assignPositions(ps, { rng: seeded(seed) }).teams[0];
    assert.equal(t.starters.GS.id, 1);
    assert.equal(t.starters.GK.id, 2);
    assert.ok([3, 4].includes(t.starters.C.id));
  }
});

test("희망이 안 되면: 'sub' 는 그 포지션 교체, 'random' 은 남은 자리", () => {
  for (let seed = 1; seed <= 20; seed++) {
    // 8명 중 3명이 GS 희망: 1명은 GS, 1명(random)은 다른 자리, 1명(sub)은 GS 교체
    const ps = people(8, (i) => (i === 0 ? { wish: ['GS'], fallback: 'sub' } : i === 1 ? { wish: ['GS'], fallback: 'random' } : i === 2 ? { wish: ['GS'], fallback: 'sub' } : {}));
    const t = assignPositions(ps, { rng: seeded(seed) }).teams[0];
    assert.equal(Object.keys(t.starters).length, 7);
    const gs = t.starters.GS.id;
    assert.ok([1, 2, 3].includes(gs));
    const loserSubs = [1, 3].filter((id) => id !== gs);
    for (const id of loserSubs) {
      const s = t.subs.find((x) => x.player.id === id);
      // sub 를 고른 사람은 (코트가 다 찼으면) GS 교체
      if (s) assert.equal(s.pos, 'GS');
    }
    if (gs !== 2) assert.ok(Object.values(t.starters).some((p) => p.id === 2), 'random 을 고른 사람은 코트에');
  }
});

test('코트는 비지 않는다: 모두 같은 포지션을 원하고 교체를 골라도 7자리는 채움', () => {
  const ps = people(7, () => ({ wish: ['GS'], fallback: 'sub' }));
  const t = assignPositions(ps, { rng: seeded(3) }).teams[0];
  assert.equal(Object.keys(t.starters).length, 7);
  assert.equal(t.subs.length, 0);
});

test('7명 넘으면 교체는 넓은 구역부터: C → GA·GD → WA·WD → GS·GK', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = assignPositions(people(13), { rng: seeded(seed) }).teams[0];
    const order = t.subs.map((s) => s.pos);
    assert.equal(order.length, 6);
    // 6명 교체 = C, GA, GD, WA, WD 와 GS·GK 중 하나
    assert.ok(order.includes('C') && order.includes('GA') && order.includes('GD') && order.includes('WA') && order.includes('WD'));
    assert.equal(order.filter((p) => p === 'GS' || p === 'GK').length, 1);
  }
  const t9 = assignPositions(people(9), { rng: seeded(1) }).teams[0];
  assert.deepEqual(t9.subs.map((s) => s.pos).sort(), ['C', t9.subs.find((s) => s.pos !== 'C').pos].sort());
  assert.ok(['GA', 'GD'].includes(t9.subs.find((s) => s.pos !== 'C').pos));
});

test('여러 팀: 고르게 나누고(차이 1명 이하) 팀마다 배정, 14명부터 기본 2팀', () => {
  assert.equal(defaultTeams(13), 1);
  assert.equal(defaultTeams(14), 2);
  assert.equal(defaultTeams(21), 3);
  const { teams, teamCount } = assignPositions(people(15), { teams: 2, rng: seeded(9) });
  assert.equal(teamCount, 2);
  const sizes = teams.map((t) => everyone(t).length).sort();
  assert.deepEqual(sizes, [7, 8]);
  assert.equal(new Set(teams.flatMap((t) => everyone(t).map((p) => p.id))).size, 15);
});
