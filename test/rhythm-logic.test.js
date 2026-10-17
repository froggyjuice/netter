import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_THIRD, HOLD_MS, WINDOWS, POINTS, COMBO_BONUS_FROM, MAX_INTERFERENCE, APPROACH_BEATS, DIFFICULTY, REBOUND_WINDOW, missKind,
  createRhythm, advance, shoot, pass, judge, inCircle, distToPost, beatMsFor, rhythmStats, windowScale,
} from '../src/games/rhythm-logic.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** 다음 '잡음'까지 시간을 진행한다 */
function toCatch(g) {
  for (let i = 0; i < 1000; i++) {
    const ev = advance(g, 10);
    if (ev.some((e) => e.type === 'catch')) return ev;
  }
  throw new Error('공을 잡지 못함');
}

/** 서클 안/밖에서 잡을 때까지 플레이를 넘긴다 */
function catchWhere(g, wantInside) {
  for (let i = 0; i < 50; i++) {
    toCatch(g);
    if (g.play.inCircle === wantInside) return;
    pass(g);
  }
  throw new Error('원하는 자리에서 잡지 못함');
}

const noInterference = (g) => {
  g.interferenceCount = MAX_INTERFERENCE;
};

test('슛은 GS·GA만 (Rule 9.1)', () => {
  assert.throws(() => createRhythm('WA'));
  assert.throws(() => createRhythm('GK'));
  assert.equal(createRhythm('GS').defenderPos, 'GK');
  assert.equal(createRhythm('GA').defenderPos, 'GD');
});

test('골 서클: 반지름 4.9m, 선 위도 서클 안 (Rule 9.1)', () => {
  assert.ok(inCircle({ x: GOAL_THIRD.postX, y: 4.9 }));
  assert.ok(!inCircle({ x: GOAL_THIRD.postX, y: 4.95 }));
  assert.ok(inCircle({ x: GOAL_THIRD.postX + 3, y: 3 }));
});

test('판정: 딱 맞으면 Perfect, 멀어질수록 Great·Good·Miss, 먼 슛은 범위가 좁다', () => {
  assert.equal(judge(0, 2), 'perfect');
  assert.equal(judge(-WINDOWS.perfect + 5, 0), 'perfect');
  assert.equal(judge(WINDOWS.great - 5, 0), 'great');
  assert.equal(judge(-(WINDOWS.good - 5), 0), 'good');
  assert.equal(judge(WINDOWS.good + 5, 0), 'miss');
  assert.ok(windowScale(4.9) < windowScale(1));
  assert.equal(judge(WINDOWS.good - 5, 4.9), 'miss'); // 서클 끝에서는 같은 오차도 놓친다
});

test('쿼터마다 박자가 빨라진다', () => {
  assert.ok(beatMsFor(1) > beatMsFor(2) && beatMsFor(2) > beatMsFor(3) && beatMsFor(3) > beatMsFor(4));
});

test('패스는 1박 날아와 박자에 맞춰 잡고, 슛 타이밍은 잡은 뒤 2박 · 3초 안', () => {
  for (const pos of ['GS', 'GA']) {
    for (let q = 1; q <= 4; q++) {
      const g = createRhythm(pos, seeded(q * 31), { quarter: q });
      const ev = toCatch(g);
      assert.ok(ev.find((e) => e.type === 'catch'));
      assert.equal(g.play.catchAt % g.beatMs, 0, '잡는 순간이 박자 위');
      if (g.play.inCircle) {
        assert.ok(Math.abs(g.play.perfectAt - g.play.catchAt - APPROACH_BEATS * g.beatMs) < 1e-6);
        assert.ok(g.play.perfectAt + WINDOWS.good < g.play.holdEnd, '판정 범위가 3초 안에 끝난다');
      }
      assert.equal(g.play.holdEnd - g.play.catchAt, HOLD_MS);
    }
  }
});

test('서클 안에서 박자에 맞춰 슛하면 골 +30', () => {
  const g = createRhythm('GS', seeded(3));
  noInterference(g);
  catchWhere(g, true);
  advance(g, g.play.perfectAt - g.t);
  const before = g.score;
  const [ev] = shoot(g);
  assert.equal(ev.type, 'shot');
  assert.equal(ev.grade, 'perfect');
  assert.ok(ev.goal);
  assert.equal(ev.points, DIFFICULTY.normal.points.perfect);
  assert.equal(g.goals, 1);
  assert.equal(g.score - before, DIFFICULTY.normal.points.perfect);
});

test('너무 빨리 쏘면 Miss: 골 아님, 연속 끊김', () => {
  const g = createRhythm('GS', seeded(4));
  noInterference(g);
  catchWhere(g, true);
  g.combo = 3;
  const [ev] = shoot(g); // 잡자마자 (2박 일찍)
  assert.equal(ev.grade, 'miss');
  assert.ok(!ev.goal && ev.err < 0);
  assert.equal(g.combo, 0);
  assert.equal(g.score, 0);
  assert.equal(g.misses, 1);
});

test('서클 밖에서 슛하면 Incorrect shot (Rule 9.6a), 밖에서는 패스가 정답 +10', () => {
  const g = createRhythm('GA', seeded(5));
  catchWhere(g, false);
  assert.ok(!inCircle(g.play.at));
  const [bad] = shoot(g);
  assert.equal(bad.type, 'incorrectShot');
  assert.equal(g.incorrectShots, 1);
  assert.equal(g.score, 0);

  catchWhere(g, false);
  const [ok] = pass(g);
  assert.equal(ok.type, 'feed');
  assert.equal(ok.points, POINTS.feed);
  assert.ok(inCircle(ok.to), '서클 안의 짝 슈터에게 패스');
  assert.equal(g.feeds, 1);
});

test('3초 동안 아무것도 안 하면 Held ball (Rule 9.6b)', () => {
  const g = createRhythm('GS', seeded(6));
  toCatch(g);
  g.combo = 4;
  let held = null;
  for (let i = 0; i < 400 && !held; i++) held = advance(g, 10).find((e) => e.type === 'held');
  assert.ok(held);
  assert.equal(g.helds, 1);
  assert.equal(g.combo, 0);
  assert.equal(g.phase, 'gap');
});

test('공이 날아오는 중에는 슛·패스를 할 수 없다', () => {
  const g = createRhythm('GS', seeded(7));
  advance(g, 1);
  assert.equal(g.phase, 'flight');
  assert.deepEqual(shoot(g).map((e) => e.type), ['noBall']);
  assert.deepEqual(pass(g).map((e) => e.type), ['noBall']);
  assert.equal(g.shots, 0);
});

test('연속 5번째부터 보너스 +10', () => {
  const g = createRhythm('GA', seeded(8));
  noInterference(g);
  const got = [];
  while (got.length < COMBO_BONUS_FROM) {
    toCatch(g);
    if (g.play.inCircle) {
      advance(g, g.play.perfectAt - g.t);
      got.push(shoot(g)[0].points);
    } else {
      got.push(pass(g)[0].points);
    }
  }
  assert.ok(got.slice(0, COMBO_BONUS_FROM - 1).every((p) => p === DIFFICULTY.normal.points.perfect || p === POINTS.feed));
  const last = got[COMBO_BONUS_FROM - 1];
  assert.ok(last === DIFFICULTY.normal.points.perfect + POINTS.combo || last === POINTS.feed + POINTS.combo);
  assert.equal(g.bestCombo, COMBO_BONUS_FROM);
});

test('수비 방해(Rule 9.7): 들어간 슛은 골 인정 + 같은 자리에서 페널티 패스, 수비는 옆에 비켜섬 (Rule 6.4·6.6)', () => {
  let found = false;
  for (let seed = 1; seed <= 200 && !found; seed++) {
    const g = createRhythm('GS', seeded(seed * 104729));
    for (let k = 0; k < 6 && !found; k++) {
      catchWhere(g, true);
      advance(g, g.play.perfectAt - g.t);
      const [ev] = shoot(g);
      if (!ev.interference) continue;
      found = true;
      assert.ok(ev.goal, '들어간 슛은 골');
      assert.equal(g.goals, 1 + k);
      const spot = { ...g.me };
      toCatch(g);
      assert.ok(g.play.penalty);
      assert.deepEqual(g.play.at, spot, '반칙이 일어난 자리에서');
      assert.ok(g.play.inCircle);
      assert.ok(g.defender.out, '수비는 아웃 오브 플레이');
      advance(g, g.play.perfectAt - g.t);
      const [ps] = shoot(g);
      assert.ok(ps.penalty && ps.goal);
      assert.ok(!ps.interference, '페널티 슛에는 다시 방해가 없다');
      assert.equal(g.defender.out, false, '공이 떠나면 다시 플레이');
      assert.equal(g.penaltyShots, 1);
    }
  }
  assert.ok(found);
});

test('수비 방해는 한 쿼터에 최대 2번', () => {
  const g = createRhythm('GS', () => 0); // 항상 방해가 일어나는 RNG
  let count = 0;
  for (let i = 0; i < 12; i++) {
    toCatch(g);
    if (!g.play.inCircle) {
      pass(g);
      continue;
    }
    advance(g, g.play.perfectAt - g.t);
    if (shoot(g)[0].interference) count += 1;
  }
  assert.equal(count, MAX_INTERFERENCE);
});

test('상대 수비는 공을 가진 나와 0.9m 이상 떨어져 선다 (Rule 16.1)', () => {
  const g = createRhythm('GA', seeded(11));
  for (let i = 0; i < 40; i++) {
    toCatch(g);
    if (!g.defender.out) assert.ok(Math.hypot(g.defender.x - g.me.x, g.defender.y - g.me.y) >= 0.9);
    pass(g);
  }
});

test('잡는 자리는 골 서드 안, 서클 안 자리는 골대에서 2m 이상 (수비·링과 겹치지 않게)', () => {
  const g = createRhythm('GS', seeded(12));
  for (let i = 0; i < 60; i++) {
    toCatch(g);
    const p = g.play.at;
    assert.ok(p.x > 0 && p.x < GOAL_THIRD.w && p.y > 0 && p.y < GOAL_THIRD.h);
    if (g.play.inCircle && !g.play.penalty) assert.ok(distToPost(p) >= 2);
    pass(g);
  }
});

test('rhythmStats: 쿼터 기록', () => {
  const g = createRhythm('GS', seeded(13));
  noInterference(g);
  catchWhere(g, true);
  advance(g, g.play.perfectAt - g.t);
  shoot(g);
  const s = rhythmStats(g);
  assert.equal(s.score, DIFFICULTY.normal.points.perfect);
  assert.equal(s.shots, 1);
  assert.equal(s.perfects, 1);
  assert.equal(s.bestCombo, 1);
});

/** 서클 안에서 잡은 뒤, 딱 맞는 시각 + errMs 에 슛 */
function shootAt(g, errMs) {
  advance(g, g.play.perfectAt + errMs - g.t);
  return shoot(g);
}

test('아깝게 빗나간 슛은 링에 맞고 리바운드: 박자에 맞춰 잡으면 +10, 그 자리에서 다시 3초 (Rule 11.1c)', () => {
  const g = createRhythm('GS', seeded(21));
  noInterference(g);
  catchWhere(g, true);
  const lateMs = WINDOWS.good * windowScale(g.play.dist) * 1.5; // Good 범위 밖, 링에는 맞는 정도
  const [ev] = shootAt(g, lateMs);
  assert.equal(ev.grade, 'miss');
  assert.equal(ev.miss, 'rim');
  assert.equal(g.phase, 'rebound');
  assert.ok(ev.reboundAt && inCircle(ev.reboundAt));
  advance(g, g.rebound.landAt - g.t);
  const [rb] = pass(g); // 리바운드는 아무 버튼이나
  assert.equal(rb.type, 'rebound');
  assert.equal(rb.points, POINTS.rebound);
  assert.equal(g.rebounds, 1);
  assert.equal(g.phase, 'hold');
  assert.ok(g.play.rebound && g.play.inCircle);
  assert.equal(g.play.holdEnd - g.t, HOLD_MS, '잡은 순간부터 다시 3초');
  const [again] = shootAt(g, 0);
  assert.ok(again.goal, '리바운드 뒤 재슛');
  assert.ok(!again.interference);
});

test('리바운드를 놓치면 상대 수비가 잡는다', () => {
  const g = createRhythm('GA', seeded(22));
  noInterference(g);
  catchWhere(g, true);
  shootAt(g, -WINDOWS.good * windowScale(g.play.dist) * 1.5);
  assert.equal(g.phase, 'rebound');
  let lost = null;
  for (let i = 0; i < 200 && !lost; i++) lost = advance(g, 10).find((e) => e.type === 'reboundLost');
  assert.ok(lost);
  assert.equal(lost.who, 'GD');
  assert.equal(g.reboundsLost, 1);
  assert.equal(g.phase, 'gap');
});

test('리바운드 판정: 너무 일찍 누르면 아직 떨어지는 중', () => {
  const g = createRhythm('GS', seeded(23));
  noInterference(g);
  catchWhere(g, true);
  shootAt(g, WINDOWS.good * windowScale(g.play.dist) * 1.5);
  advance(g, g.rebound.landAt - REBOUND_WINDOW - 50 - g.t);
  assert.deepEqual(shoot(g).map((e) => e.type), ['noBall']);
  assert.equal(g.phase, 'rebound');
});

test('에어볼(링에도 안 닿음)은 리바운드 없음 — 슛한 사람은 다시 잡을 수 없다 (Rule 11.6)', () => {
  const g = createRhythm('GS', seeded(24));
  noInterference(g);
  catchWhere(g, true);
  const [ev] = shoot(g); // 잡자마자 = 2박 일찍
  assert.equal(ev.miss, 'air');
  assert.equal(g.airBalls, 1);
  assert.equal(g.phase, 'gap');
  assert.equal(missKind(0, 3), 'rim');
  assert.equal(missKind(2000, 3), 'air');
});

test('서클 선: 선 위에서 잡으면 서클 안(슛 가능), 선 바로 밖이면 한 발 들어가도 슛 불가 (Rule 9.1·9.6a)', () => {
  const seen = { on: 0, out: 0 };
  const g = createRhythm('GS', seeded(25));
  noInterference(g);
  for (let i = 0; i < 300 && (seen.on < 3 || seen.out < 3); i++) {
    toCatch(g);
    const p = g.play;
    if (p.line === 'on') {
      seen.on += 1;
      assert.ok(p.inCircle && distToPost(p.at) > GOAL_THIRD.circleR - 0.2);
      const [ev] = shootAt(g, 0);
      assert.ok(ev.goal && ev.line === 'on');
      if (g.phase === 'rebound') advance(g, 1000);
    } else if (p.line === 'out') {
      seen.out += 1;
      assert.ok(!p.inCircle && distToPost(p.at) < GOAL_THIRD.circleR + 0.5);
      const [ev] = shoot(g);
      assert.equal(ev.type, 'incorrectShot');
      assert.equal(ev.line, 'out');
    } else {
      pass(g);
    }
  }
  assert.ok(seen.on >= 3 && seen.out >= 3);
  assert.ok(g.lineShots >= 3);
});

test('난이도: 쉬움은 범위가 넓고 점수 20, 어려움은 좁고 점수 40', () => {
  for (const [diff, want] of [['easy', 20], ['normal', 30], ['hard', 40]]) {
    const g = createRhythm('GS', seeded(26), { difficulty: diff });
    noInterference(g);
    catchWhere(g, true);
    const [ev] = shootAt(g, 0);
    assert.equal(ev.points, want, diff);
  }
  // 보통에서 Good 끝인 오차가 어려움에서는 Miss, 쉬움에서는 Great 이상
  const err = WINDOWS.good * windowScale(3) - 2;
  assert.equal(judge(err, 3, 1), 'good');
  assert.equal(judge(err, 3, DIFFICULTY.hard.window), 'miss');
  assert.notEqual(judge(err * 0.75, 3, DIFFICULTY.easy.window), 'good');
  assert.throws(() => createRhythm('GS', seeded(1), { difficulty: 'insane' }));
});

test('어려움: 줄어드는 원이 1박 또는 2박, 3쿼터부터 엇박 패스', () => {
  const g = createRhythm('GS', seeded(27), { quarter: 3, difficulty: 'hard' });
  noInterference(g);
  const beats = new Set();
  let offbeat = 0;
  for (let i = 0; i < 60; i++) {
    toCatch(g);
    if (g.play.inCircle) beats.add(g.play.approachBeats);
    const phase = (g.play.catchAt / g.beatMs) % 1;
    if (Math.abs(phase - 0.5) < 1e-6) offbeat += 1;
    pass(g);
  }
  assert.deepEqual([...beats].sort(), [1, 2]);
  assert.ok(offbeat > 0, '엇박 패스');
  const n = createRhythm('GS', seeded(27), { quarter: 3, difficulty: 'normal' });
  for (let i = 0; i < 30; i++) {
    toCatch(n);
    assert.equal(Math.abs(((n.play.catchAt / n.beatMs) % 1) - 0.5) < 1e-6, false, '보통은 엇박 없음');
    pass(n);
  }
});
