import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINDOWS, REBOUND_WINDOW, POINTS, inCircle } from '../src/games/rhythm-logic.js';
import {
  DEFENCE_GAP, START_GAP, DEF_POINTS, GOAL_CHANCE,
  createDefence, advanceDefence, stopDefence, blockDefence, defenceStats, judgeStop, currentGap, defenderAt,
} from '../src/games/rhythm-defence-logic.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 상대 슈터가 공을 잡을 때까지 */
function toCatch(g) {
  for (let i = 0; i < 1000; i++) {
    const ev = advanceDefence(g, 10);
    if (ev.some((e) => e.type === 'oppCatch')) return ev;
  }
  throw new Error('상대가 공을 잡지 못함');
}
const at = (g, time) => advanceDefence(g, time - g.t);

test('수비 모드는 GK·GD만, 맞서는 슈터는 GS·GA', () => {
  assert.throws(() => createDefence('GS'));
  assert.equal(createDefence('GK').shooterPos, 'GS');
  assert.equal(createDefence('GD').shooterPos, 'GA');
});

test('상대 슈터는 서클 안에서 받고, 나는 다가가다가 정해진 박에 딱 0.9m', () => {
  const g = createDefence('GK', seeded(1));
  toCatch(g);
  assert.ok(inCircle(g.play.at));
  assert.equal(g.phase, 'approach');
  assert.ok(Math.abs(currentGap(g) - START_GAP) < 0.05);
  at(g, g.play.markAt);
  assert.ok(Math.abs(currentGap(g) - DEFENCE_GAP) < 1e-6);
  const spot = defenderAt(g);
  const d = Math.hypot(spot.x - g.play.at.x, spot.y - g.play.at.y);
  assert.ok(Math.abs(d - DEFENCE_GAP) < 0.05, '화면 위치도 0.9m');
});

test('멈춤 판정: 딱 맞으면 Perfect, 너무 일찍이면 멀리 섬, 늦게까지 안 멈추면 장애 (Rule 16.1)', () => {
  assert.equal(judgeStop(0), 'perfect');
  assert.equal(judgeStop(-WINDOWS.good - 10), 'far');
  assert.equal(judgeStop(WINDOWS.good + 10), 'obstruction');

  const g = createDefence('GK', seeded(2));
  toCatch(g);
  at(g, g.play.markAt);
  const [ev] = stopDefence(g);
  assert.equal(ev.grade, 'perfect');
  assert.equal(ev.points, DEF_POINTS.normal.stop.perfect);
  assert.equal(g.phase, 'block');

  const h = createDefence('GD', seeded(3));
  toCatch(h);
  let obs = null;
  for (let i = 0; i < 200 && !obs; i++) obs = advanceDefence(h, 10).find((e) => e.type === 'obstruction');
  assert.ok(obs, '멈추지 않으면 장애');
  assert.ok(obs.gap < DEFENCE_GAP);
  assert.equal(h.obstructions, 1);
  assert.ok(h.pendingPenalty, '상대 페널티 패스');
});

test('장애 뒤 페널티 패스: 슈터는 같은 자리, 나는 옆에 비켜서서 블록할 수 없다 (Rule 6.4·6.6)', () => {
  const g = createDefence('GK', seeded(4));
  toCatch(g);
  const spot = { ...g.play.at };
  for (let i = 0; i < 200 && g.phase !== 'gap'; i++) advanceDefence(g, 10);
  toCatch(g);
  assert.ok(g.play.penalty && g.play.out);
  assert.deepEqual(g.play.at, spot);
  assert.equal(g.phase, 'block');
  at(g, g.play.releaseAt);
  assert.deepEqual(blockDefence(g).map((e) => e.type), ['outOfPlay']);
});

test('정당한 블록 (Rule 16.6a): 거리를 지키고 공이 올라갈 때 → +30', () => {
  const g = createDefence('GK', seeded(5));
  toCatch(g);
  at(g, g.play.markAt);
  stopDefence(g);
  at(g, g.play.releaseAt);
  const before = g.score;
  const [ev] = blockDefence(g);
  assert.equal(ev.type, 'block');
  assert.equal(ev.points, DEF_POINTS.normal.block);
  assert.equal(g.score - before, DEF_POINTS.normal.block);
  assert.equal(g.blocks, 1);
  assert.equal(g.phase, 'gap');
});

test('늦은 블록 = 떨어지는 공을 건드림 → 슛 방해, 상대 페널티 패스 (Rule 9.7)', () => {
  const g = createDefence('GD', seeded(6));
  toCatch(g);
  at(g, g.play.markAt);
  stopDefence(g);
  at(g, g.play.releaseAt + WINDOWS.good + 40);
  const evs = blockDefence(g);
  assert.equal(evs[0].type, 'interference');
  assert.equal(g.interferences, 1);
  assert.ok(g.pendingPenalty);
  assert.equal(g.combo, 0);
});

test('너무 멀리 서면(일찍 멈춤) 블록이 닿지 않는다', () => {
  const g = createDefence('GK', seeded(7));
  toCatch(g);
  at(g, g.play.markAt - WINDOWS.good - 60);
  const [st] = stopDefence(g);
  assert.equal(st.grade, 'far');
  assert.equal(st.points, 0);
  assert.ok(st.gap > DEFENCE_GAP);
  at(g, g.play.releaseAt);
  assert.deepEqual(blockDefence(g).map((e) => e.type), ['tooFar']);
});

test('블록하기 전에는 먼저 0.9m에 멈춰야 한다', () => {
  const g = createDefence('GK', seeded(8));
  toCatch(g);
  assert.deepEqual(blockDefence(g).map((e) => e.type), ['notYet']);
});

test('막지 못한 슛: 골이면 실점, 빗나가면 리바운드 다툼 (Rule 11.1c·16.8b)', () => {
  let conceded = 0;
  let rebounds = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = createDefence('GK', seeded(seed * 7919));
    toCatch(g);
    at(g, g.play.markAt);
    stopDefence(g);
    const evs = at(g, g.play.landAt);
    if (evs.some((e) => e.type === 'conceded')) {
      conceded += 1;
      assert.equal(g.conceded, 1);
      continue;
    }
    assert.ok(evs.some((e) => e.type === 'oppMiss'));
    assert.equal(g.phase, 'rebound');
    at(g, g.rebound.landAt);
    const [rb] = stopDefence(g);
    assert.equal(rb.type, 'rebound');
    assert.equal(rb.points, POINTS.rebound);
    rebounds += 1;
  }
  assert.ok(conceded > 0 && rebounds > 0);
  assert.ok(conceded / 60 < 0.6, `Perfect로 붙으면 실점이 적다 (${conceded}/60)`);
});

test('리바운드를 놓치면 상대가 잡는다', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = createDefence('GD', seeded(seed * 104729));
    toCatch(g);
    at(g, g.play.markAt);
    stopDefence(g);
    at(g, g.play.landAt);
    if (g.phase !== 'rebound') continue;
    let lost = null;
    for (let i = 0; i < 200 && !lost; i++) lost = advanceDefence(g, 10).find((e) => e.type === 'reboundLost');
    assert.ok(lost);
    assert.equal(lost.who, 'GA');
    assert.ok(g.t <= g.rebound?.landAt + REBOUND_WINDOW + 20 || g.phase === 'gap');
    return;
  }
  assert.fail('리바운드 장면이 없음');
});

test('난이도: 어려움은 멈춤 Perfect 30 · 블록 40, 쉬움은 10 · 20', () => {
  for (const [diff, stop, block] of [['easy', 10, 20], ['hard', 30, 40]]) {
    const g = createDefence('GK', seeded(9), { difficulty: diff });
    toCatch(g);
    at(g, g.play.markAt);
    assert.equal(stopDefence(g)[0].points, stop);
    at(g, g.play.releaseAt);
    assert.equal(blockDefence(g)[0].points, block);
  }
  assert.ok(GOAL_CHANCE.perfect < GOAL_CHANCE.far);
});

test('defenceStats: 쿼터 기록', () => {
  const g = createDefence('GK', seeded(10));
  toCatch(g);
  at(g, g.play.markAt);
  stopDefence(g);
  at(g, g.play.releaseAt);
  blockDefence(g);
  const s = defenceStats(g);
  assert.equal(s.blocks, 1);
  assert.equal(s.stopPerfects, 1);
  assert.equal(s.score, DEF_POINTS.normal.stop.perfect + DEF_POINTS.normal.block);
  assert.equal(s.bestCombo, 1);
});
