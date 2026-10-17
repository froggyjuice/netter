import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUARTER_MS, TIME_SCALE, BREAK_MS, QUARTERS,
  emptyTotals, createMatch, breakMsFor, advanceClock, endQuarter, startNextQuarter, addStats, matchClock, swapEndsFor, ourCentrePass,
} from '../src/games/match-logic.js';

test('실제 경기 비율: 15분 쿼터 = 45초(20배속), 쉬는 시간 4분·12분·4분 = 12초·36초·12초 (Rule 2.1)', () => {
  assert.equal(QUARTER_MS, 45_000);
  assert.equal(TIME_SCALE, 20);
  assert.deepEqual([BREAK_MS[1], BREAK_MS[2], BREAK_MS[3]], [12_000, 36_000, 12_000]);
});

test('matchClock: 남은 게임 시간을 실제 경기 시계로', () => {
  assert.equal(matchClock(QUARTER_MS), '15:00');
  assert.equal(matchClock(QUARTER_MS / 2), '07:30');
  assert.equal(matchClock(1), '00:01');
  assert.equal(matchClock(0), '00:00');
});

test('진영 교대·센터 패스 순서: 2·4쿼터는 진영이 바뀌고 상대 팀 센터 패스 (Rule 2.2·8.1)', () => {
  assert.deepEqual([1, 2, 3, 4].map(swapEndsFor), [false, true, false, true]);
  assert.deepEqual([1, 2, 3, 4].map(ourCentrePass), [true, false, true, false]);
});

test('시계: 시간이 다 되면 timeUp, 쉬는 시간이 끝나면 breakOver', () => {
  const m = createMatch();
  assert.equal(advanceClock(m, QUARTER_MS - 1), null);
  assert.equal(advanceClock(m, 5), 'timeUp');
  assert.equal(m.leftMs, 0);
  endQuarter(m, { score: 40 }, 'time');
  assert.equal(m.phase, 'break');
  assert.equal(m.breakLeftMs, BREAK_MS[1]);
  assert.equal(advanceClock(m, BREAK_MS[1]), 'breakOver');
  startNextQuarter(m);
  assert.equal(m.quarter, 2);
  assert.equal(m.leftMs, QUARTER_MS);
});

test('4쿼터가 끝나면 경기 종료, 기록은 쿼터마다 더해진다', () => {
  const m = createMatch();
  const scores = [40, 30, 0, 50];
  for (let q = 1; q <= QUARTERS; q++) {
    endQuarter(m, { score: scores[q - 1], balls: 2, bestChain: q, played: q === 2 ? ['GS', 'GK'] : ['GS'] }, q === 3 ? 'crash' : 'time');
    if (q < QUARTERS) {
      assert.equal(m.phase, 'break');
      startNextQuarter(m);
    }
  }
  assert.equal(m.phase, 'over');
  assert.equal(m.totals.score, 120);
  assert.equal(m.totals.balls, 8);
  assert.equal(m.totals.bestChain, 4);
  assert.deepEqual(m.totals.played, ['GS', 'GK']);
  assert.deepEqual(m.quarters.map((x) => x.reason), ['time', 'time', 'crash', 'time']);
  // 끝난 뒤에는 더 진행되지 않는다
  endQuarter(m, { score: 999 }, 'time');
  assert.equal(m.totals.score, 120);
  assert.equal(advanceClock(m, 1000), null);
});

test('addStats: 빈 값도 안전하게', () => {
  const t = addStats({}, { score: 10 });
  assert.equal(t.score, 10);
  assert.equal(t.passes, 0);
  assert.deepEqual(t.played, []);
});

test('쿼터 길이를 바꾸면(리듬 슈팅 30초) 시계와 쉬는 시간도 같은 배속', () => {
  const m = createMatch({ quarterMs: 30_000 });
  assert.equal(m.leftMs, 30_000);
  assert.equal(matchClock(30_000, 30_000), '15:00');
  assert.equal(matchClock(15_000, 30_000), '07:30');
  assert.deepEqual([1, 2, 3].map((q) => breakMsFor(m, q)), [8_000, 24_000, 8_000]);
  advanceClock(m, 30_000);
  endQuarter(m, { score: 10, shots: 3, bestCombo: 4 }, 'time');
  assert.equal(m.breakLeftMs, 8_000);
  startNextQuarter(m);
  assert.equal(m.leftMs, 30_000);
});

test('addStats: 다른 게임의 숫자 기록도 더하고, best… 는 큰 값', () => {
  const t = addStats(addStats(emptyTotals(), { score: 30, shots: 2, perfects: 1, bestCombo: 5 }), { score: 10, shots: 4, bestCombo: 3 });
  assert.equal(t.score, 40);
  assert.equal(t.shots, 6);
  assert.equal(t.perfects, 1);
  assert.equal(t.bestCombo, 5);
});
