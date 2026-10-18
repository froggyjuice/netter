import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURT, POSITION_KEYS, MATCHUP, isAllowed, isAllowedForOpponent, zoneOf } from '../src/shared/zones.js';
import {
  createGame, setDirection, step, tickMs, modeFor, SHOT_BONUS, GOAL_POST_CELL,
  penaltyReleaseTicks, BALL_POINTS, GOAL_POINTS, BLOCK_POINTS, CIRCLE_BLOCK_POINTS, OFFSIDE_PENALTY, ROLL_EVERY,
  PASS_POINTS, PASS_MS, passTicks, nearOffside, ITEM_OFFSIDE_MARGIN, oppEvery, spawnItem,
} from '../src/games/snake-logic.js';

// 재현 가능한 난수
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function place(state, cells, dir = null) {
  state.snake = cells.map(([c, r]) => ({ c, r }));
  state.dir = dir;
  state.queuedDir = null;
  state.queuedDir2 = null;
  parkOpp(state);
}

test('모든 포지션: 시작 뱀과 첫 공이 허용 구역 안에 있다', () => {
  for (const pos of POSITION_KEYS) {
    const g = createGame(pos, seeded(7));
    assert.equal(g.snake.length, 3);
    for (const s of g.snake) assert.ok(isAllowed(pos, s.c, s.r), `${pos} 시작 위치`);
    // C는 센터 패스로 공을 든 채 시작(코트의 공 없음, 패스 대상 있음), 나머지는 코트에 공이 있다
    const target = pos === 'C' ? g.pass : g.item;
    assert.ok(target, `${pos} 공/패스 대상`);
    assert.ok(isAllowed(pos, target.c, target.r), `${pos} 아이템 위치`);
    assert.ok(!g.snake.some((s) => s.c === target.c && s.r === target.r));
  }
});

test('정지 상태에서 몸(목) 쪽으로는 출발할 수 없다', () => {
  const g = createGame('C', seeded());
  // 뱀은 머리가 오른쪽, 몸이 왼쪽
  assert.equal(setDirection(g, 'left'), false);
  assert.equal(setDirection(g, 'right'), true);
  const events = step(g, seeded());
  assert.ok(!events.some((e) => e.type === 'crash'));
});

test('달리는 중 정반대 방향 입력은 무시된다', () => {
  const g = createGame('C', seeded());
  setDirection(g, 'right');
  step(g, seeded());
  assert.equal(setDirection(g, 'left'), false);
  assert.equal(setDirection(g, 'up'), true);
});

test('한 틱 안에 옆으로 꺾었다가 반대로 돌아도 몸에 부딪히지 않는다 (두 번째 꺾기는 다음 틱)', () => {
  const g = createGame('C', seeded());
  g.item = null;
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  // 같은 틱 안: ↑ 다음 ← (예전에는 ← 가 ↑ 를 덮어써서 바로 목으로 꺾여 탈락)
  assert.equal(setDirection(g, 'up'), true);
  assert.equal(setDirection(g, 'left'), true);
  assert.equal(setDirection(g, 'down'), false, '첫 꺾기(↑)의 정반대는 막는다');
  let ev = step(g, seeded());
  assert.ok(!ev.some((e) => e.type === 'crash'));
  assert.equal(g.dir, 'up');
  ev = step(g, seeded());
  assert.ok(!ev.some((e) => e.type === 'crash'));
  assert.equal(g.dir, 'left');
  assert.deepEqual(g.snake[0], { c: 14, r: 6 });
});

test('미뤄 둔 꺾기가 그 사이 몸 쪽이 되면 버린다', () => {
  const g = createGame('C', seeded());
  g.item = null;
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.queuedDir = 'left'; // (벽에 튕긴 뒤처럼) 지금 보니 목 쪽이 된 입력
  step(g, seeded());
  assert.equal(g.dir, 'right', '목 쪽 입력은 무시하고 하던 방향으로');
});

test('공을 든 GS·GA가 패스하지 않고 3초 안에 골대(링 앞 칸)로 가면 슛 보너스 +10', () => {
  for (const pos of ['GS', 'GA']) {
    const g = createGame(pos, seeded());
    const { c, r } = GOAL_POST_CELL;
    place(g, [[c - 1, r], [c - 2, r], [c - 3, r]], 'right');
    g.item = null;
    g.score = 30;
    g.pass = { c: c - 6, r: 2, deadline: g.ticks + 10, total: 10 };
    const ev = step(g, seeded());
    const shot = ev.find((e) => e.type === 'ball' && e.shotBonus);
    assert.ok(shot, pos);
    assert.equal(shot.points, SHOT_BONUS);
    assert.equal(g.score, 30 + SHOT_BONUS);
    assert.equal(g.pass, null);
    assert.equal(g.goals, 1);
  }
});

test('공을 들지 않았거나 슈터가 아니면 골대 칸에 가도 보너스 없음', () => {
  const g = createGame('GS', seeded());
  const { c, r } = GOAL_POST_CELL;
  place(g, [[c - 1, r], [c - 2, r], [c - 3, r]], 'right');
  g.item = null;
  g.pass = null;
  g.score = 0;
  assert.ok(!step(g, seeded()).some((e) => e.shotBonus));
  assert.equal(g.score, 0);
});

test('오프사이드: 멈추지 않고 옆으로 튕기며 −10점, 목숨은 그대로', () => {
  const g = createGame('GK', seeded());
  g.item = null;
  g.score = 20;
  place(g, [[9, 3], [8, 3], [7, 3]], 'right'); // GK 허용 구역은 col 0-9
  const ev = step(g, seeded());
  assert.equal(ev[0].type, 'offside');
  assert.equal(ev[0].zone, 3); // 센터 서드에 들어가려 함
  assert.equal(ev[0].penalty, OFFSIDE_PENALTY);
  assert.equal(g.score, 20 - OFFSIDE_PENALTY);
  assert.equal(g.offsides, 1);
  assert.ok(['up', 'down'].includes(g.dir));
  assert.equal(g.snake[0].c, 9);
  assert.equal(Math.abs(g.snake[0].r - 3), 1); // 튕기면서 한 칸 이동했다
});

test('오프사이드 감점은 0점 아래로 내려가지 않는다', () => {
  const g = createGame('GK', seeded());
  g.item = null;
  place(g, [[9, 3], [8, 3], [7, 3]], 'right');
  const ev = step(g, seeded());
  assert.equal(ev[0].penalty, 0);
  assert.equal(g.score, 0);
});

test('코트 밖 벽: 벌점 없이 튕기고, 아이템이 있는 쪽으로 꺾는다', () => {
  const g = createGame('GS', seeded());
  g.item = { c: 29, r: 1, type: 'ball' };
  place(g, [[29, 5], [28, 5], [27, 5]], 'right');
  const ev = step(g, seeded());
  assert.equal(ev[0].type, 'wall');
  assert.equal(g.score, 0);
  assert.equal(g.offsides, 0);
  assert.equal(g.dir, 'up');
  assert.deepEqual(g.snake[0], { c: 29, r: 4 });
});

test('양옆도 막혀 있으면 멈추고, 입력하면 다시 출발', () => {
  const g = createGame('GS', seeded());
  g.item = { c: 22, r: 10, type: 'ball' };
  place(g, [[29, 0], [28, 0], [28, 1]], 'up'); // 위·오른쪽은 벽, 왼쪽은 몸
  const ev = step(g, seeded());
  assert.equal(ev[0].type, 'wall');
  assert.equal(g.dir, null);
  assert.deepEqual(g.snake[0], { c: 29, r: 0 });
  assert.deepEqual(step(g, seeded()), []); // 입력이 없으면 그대로
  assert.equal(setDirection(g, 'down'), true);
  step(g, seeded());
  assert.deepEqual(g.snake[0], { c: 29, r: 1 });
});

test('modeFor: 공격·수비 포지션과 센터 선택', () => {
  for (const p of ['GS', 'GA', 'WA']) assert.equal(modeFor(p), 'attack');
  for (const p of ['GK', 'GD', 'WD']) assert.equal(modeFor(p, 'attack'), 'defence');
  assert.equal(modeFor('C'), 'attack');
  assert.equal(modeFor('C', 'defence'), 'defence');
  assert.equal(createGame('C', seeded(), { mode: 'defence' }).mode, 'defence');
  assert.equal(createGame('GK', seeded()).item.type, 'roll');
  assert.equal(createGame('GS', seeded(), { mode: 'defence' }).mode, 'attack'); // 공격 포지션은 고정
});

test('수비: 굴러온 공이 내 구역을 빠져나가면 실점 — 기록만 하고 경기는 계속 (목숨 없음)', () => {
  const g = createGame('GK', seeded());
  place(g, [[5, 1], [4, 1], [3, 1]], 'right');
  for (let i = 1; i <= 5; i++) {
    g.item = { c: 0, r: 13, type: 'roll' }; // 왼쪽 끝 → 다음 칸은 코트 밖
    g.ticks = ROLL_EVERY * i - 1; // 이번 틱에 공이 구른다
    setDirection(g, i % 2 ? 'down' : 'up');
    const ev = step(g, seeded(i));
    assert.ok(ev.some((e) => e.type === 'conceded'), `실점 ${i}`);
    assert.equal(g.conceded, i);
    assert.ok(g.item, '다음 공이 굴러온다');
  }
  assert.equal(g.over, false);
});

test('수비: 굴러오는 공은 ROLL_EVERY 틱마다 한 칸씩 왼쪽으로', () => {
  const g = createGame('GD', seeded());
  place(g, [[5, 1], [4, 1], [3, 1]], 'right');
  g.item = { c: 19, r: 12, type: 'roll' };
  g.ticks = 0;
  for (let i = 0; i < ROLL_EVERY * 2; i++) {
    setDirection(g, i % 2 ? 'up' : 'down');
    step(g, seeded());
  }
  assert.deepEqual({ c: g.item.c, r: g.item.r }, { c: 17, r: 12 });
});

test('수비: 공이 몸에 부딪히면 차단 +10, 한 칸 자란다', () => {
  const g = createGame('GK', seeded(4));
  place(g, [[4, 5], [4, 6], [4, 7], [4, 8]], 'up');
  g.item = { c: 5, r: 6, type: 'roll' };
  g.ticks = ROLL_EVERY - 1;
  const ev = step(g, seeded(4));
  const b = ev.find((e) => e.type === 'block');
  assert.ok(b);
  assert.equal(b.by, 'body');
  assert.equal(b.points, BLOCK_POINTS);
  assert.equal(g.blocks, 1);
  assert.equal(g.score, BLOCK_POINTS);
  assert.ok(g.pass, '막은 뒤에도 패스 대상이 나온다');
  step(g, seeded(4));
  assert.equal(g.snake.length, 5);
});

test('수비: GK·GD가 수비 서클 안에서 머리로 막으면 +30', () => {
  for (const pos of ['GK', 'GD']) {
    const g = createGame(pos, seeded());
    place(g, [[1, 7], [1, 8], [1, 9]], 'right');
    g.item = { c: 2, r: 7, type: 'roll' };
    assert.equal(zoneOf(2, 7), 5);
    const ev = step(g, seeded());
    assert.equal(ev[0].type, 'block');
    assert.equal(ev[0].by, 'head');
    assert.equal(ev[0].points, CIRCLE_BLOCK_POINTS);
    assert.equal(g.snake.length, 4);
  }
});

test('교체로 모드가 바뀌면 아이템도 새 모드를 따른다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = createGame('C', seeded(seed), { mode: 'attack' });
    place(g, [[15, 7], [14, 7], [13, 7]], 'right');
    g.item = { c: 16, r: 7, type: 'sub' };
    const ev = step(g, seeded(seed));
    assert.equal(ev[0].type, 'sub');
    assert.equal(g.mode, modeFor(g.position, 'attack'));
    if (g.mode === 'defence') assert.equal(g.item.type, 'roll');
    else assert.equal(g.item.type, 'ball');
  }
});

test('공을 먹으면 +10점, 몸이 길어지고 패스 대상이 나온다', () => {
  const g = createGame('C', seeded(3));
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.item = { c: 16, r: 7, type: 'ball' };
  const ev = step(g, seeded(3));
  assert.equal(ev[0].type, 'ball');
  assert.equal(ev[0].points, BALL_POINTS);
  assert.equal(g.score, BALL_POINTS);
  assert.equal(g.snake.length, 4);
  assert.equal(g.item, null); // 패스하는 동안에는 다음 공이 없다
  assert.ok(ev.some((e) => e.type === 'passStart'));
  const d = Math.abs(g.pass.c - 16) + Math.abs(g.pass.r - 7);
  assert.ok(d >= 4 && d <= 7, '패스 대상은 머리에서 4~7칸');
  assert.ok(isAllowed('C', g.pass.c, g.pass.r));
  assert.equal(g.pass.total, passTicks(1));
});

test('GS/GA가 골 서클 안에서 먹으면 슈팅 성공 +30, 서클 밖이나 다른 포지션은 +10', () => {
  const shot = (pos, head, itemCell) => {
    const g = createGame(pos, seeded(5));
    place(g, [head, [head[0] - 1, head[1]], [head[0] - 2, head[1]]], 'right');
    g.item = { c: itemCell[0], r: itemCell[1], type: 'ball' };
    return step(g, seeded(5))[0];
  };
  assert.equal(zoneOf(28, 7), 1);
  const goal = shot('GS', [27, 7], [28, 7]);
  assert.equal(goal.goal, true);
  assert.equal(goal.points, GOAL_POINTS);
  assert.equal(shot('GA', [27, 7], [28, 7]).points, GOAL_POINTS);
  assert.equal(shot('GS', [21, 7], [22, 7]).points, BALL_POINTS); // 서클 밖
  assert.equal(zoneOf(22, 7), 2);
});

test('자기 몸에 부딪히면 끝난다 (꼬리 칸은 비켜서 안전)', () => {
  const g = createGame('C', seeded());
  g.item = { c: 0, r: 0, type: 'ball' };
  // 머리(15,7) 아래로 돌면 몸통(15,8)이 있는 U자 모양
  place(g, [[15, 7], [16, 7], [16, 8], [15, 8], [14, 8]], 'down');
  const ev = step(g, seeded());
  assert.equal(ev[0].type, 'crash');
  assert.equal(g.over, true);

  // 꼬리 칸으로의 이동은 허용
  const h = createGame('C', seeded());
  h.item = { c: 0, r: 0, type: 'ball' };
  place(h, [[15, 7], [16, 7], [16, 8], [15, 8]], 'down'); // 다음 칸 (15,8) = 꼬리
  assert.equal(step(h, seeded()).some((e) => e.type === 'crash'), false);
});

test('교체 아이템: 머리가 있는 구역을 허용하는 다른 포지션으로 바뀐다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = createGame('C', seeded(seed));
    place(g, [[15, 7], [14, 7], [13, 7]], 'right');
    g.item = { c: 16, r: 7, type: 'sub' };
    const ev = step(g, seeded(seed));
    assert.equal(ev[0].type, 'sub');
    assert.notEqual(g.position, 'C');
    assert.ok(isAllowed(g.position, 16, 7), '새 포지션이 현재 위치를 허용해야 한다');
    assert.deepEqual(g.played, ['C', g.position], '뛴 포지션 기록 (배지용)');
    assert.ok(isAllowed(g.position, g.item.c, g.item.r), '새 아이템도 새 포지션 구역 안');
  }
});

test('긴 플레이: 임의 입력 2000틱 동안 불변식 유지', () => {
  const rng = seeded(11);
  const dirs = ['up', 'down', 'left', 'right'];
  const runs = [...POSITION_KEYS.map((p) => [p, undefined]), ['C', 'defence']];
  for (const [pos, mode] of runs) {
    let g = createGame(pos, rng, { mode });
    let games = 0;
    for (let i = 0; i < 2000; i++) {
      setDirection(g, dirs[Math.floor(rng() * 4)]);
      const before = { score: g.score };
      const ev = step(g, rng);
      assert.ok(g.score >= 0);
      assert.equal(g.score % 10, 0, '점수는 10의 배수 (서버 검증과 일치)');
      if (g.opp) {
        assert.ok(isAllowedForOpponent(g.position, g.opp.c, g.opp.r), '맞수는 맞수 구역 안');
        assert.ok(!g.snake.some((x) => x.c === g.opp.c && x.r === g.opp.r), '맞수는 뱀과 겹치지 않는다');
        assert.equal(g.opp.position, MATCHUP[g.position]);
      }
      assert.ok(g.score - before.score <= 30, '한 틱 최대 30점 (서버 검증과 일치)');
      assert.ok(g.frozen >= 0 && g.frozen < passTicks(g.balls), '상대 페널티 패스는 3초 안에 공을 놓는다');
      if (!g.over && g.item) assert.ok(isAllowed(g.position, g.item.c, g.item.r));
      if (!g.over) assert.ok(isAllowed(g.position, g.snake[0].c, g.snake[0].r), '머리는 항상 허용 구역');
      if (g.over) {
        g = createGame(pos, rng, { mode });
        games += 1;
      }
    }
    assert.ok(games >= 0);
  }
});

test('tickMs: 점점 빨라지되 하한이 있다', () => {
  assert.equal(tickMs(0), 200);
  assert.ok(tickMs(10) < tickMs(0));
  assert.equal(tickMs(1000), 110);
});

test('passTicks: 3초를 현재 속도의 틱 수로 바꾼다', () => {
  assert.equal(passTicks(0), Math.ceil(PASS_MS / tickMs(0))); // 200ms → 15틱
  assert.equal(passTicks(0), 15);
  assert.equal(passTicks(1000), Math.ceil(PASS_MS / 110));
});

test('3초 패스: 제한 안에 닿으면 +20, 연속 성공을 센다, 그 뒤 다음 공', () => {
  const g = createGame('C', seeded(2));
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  for (let n = 1; n <= 2; n++) {
    g.pass = { c: g.snake[0].c + 1, r: g.snake[0].r, deadline: g.ticks + 5, total: 5 };
    g.item = null;
    const before = g.score;
    const ev = step(g, seeded(n));
    const p = ev.find((e) => e.type === 'pass');
    assert.ok(p);
    assert.equal(p.chain, n);
    assert.equal(g.score - before, PASS_POINTS);
    assert.equal(g.pass, null);
    assert.ok(g.item, '패스 뒤 다음 공이 나온다');
  }
  assert.equal(g.passes, 2);
  assert.equal(g.bestChain, 2);
});

test('3초 패스: 시간이 지나면 놓친다(벌점 없음), 연속 기록은 끊긴다', () => {
  const g = createGame('C', seeded(2));
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.passChain = 3;
  g.score = 50;
  g.item = null;
  g.pass = { c: 15, r: 2, deadline: g.ticks + 2, total: 2 };
  step(g, seeded());
  assert.ok(g.pass, '아직 시간이 남음');
  const ev = step(g, seeded());
  assert.ok(ev.some((e) => e.type === 'held'));
  assert.equal(g.pass, null);
  assert.equal(g.passChain, 0);
  assert.equal(g.score, 50);
  assert.ok(g.item);
});

test('패스하는 동안 수비 모드의 공은 나오지 않는다 (공은 하나뿐)', () => {
  const g = createGame('GK', seeded(3));
  place(g, [[1, 7], [1, 8], [1, 9]], 'right');
  g.item = { c: 2, r: 7, type: 'roll' };
  step(g, seeded(3));
  assert.ok(g.pass);
  assert.equal(g.item, null);
});

/** 맞수를 뱀 머리에서 가장 먼 맞수 구역 칸에 세우고 오래 쉬게 한다 (맞수와 상관없는 테스트용) */
function parkOpp(g) {
  if (!g.opp) return;
  const head = g.snake[0];
  let best = null;
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      if (!isAllowedForOpponent(g.position, c, r)) continue;
      const d = Math.abs(c - head.c) + Math.abs(r - head.r);
      if (!best || d > best.d) best = { c, r, d };
    }
  }
  g.opp = { c: best.c, r: best.r, position: MATCHUP[g.position], out: false };
  g.oppWait = -100000;
}

// 맞수를 원하는 곳에 세우고, 다음 틱에 움직이게 한다 (move=false면 계속 서 있게)
function withOpp(g, c, r, move = true) {
  g.opp = { c, r, position: MATCHUP[g.position], out: false };
  g.oppWait = move ? oppEvery(g.balls) - 1 : -100000;
}

test('맞수는 처음부터 있고, 센터 패스 위치 규칙을 따른다 (맞수 C만 센터 서드, Rule 8.9·8.11)', () => {
  for (const pos of POSITION_KEYS) {
    for (let seed = 1; seed <= 10; seed++) {
      const g = createGame(pos, seeded(seed));
      assert.ok(g.opp, `${pos} 맞수`);
      assert.equal(g.opp.position, MATCHUP[pos]);
      assert.ok(isAllowedForOpponent(pos, g.opp.c, g.opp.r));
      if (MATCHUP[pos] !== 'C') assert.notEqual(zoneOf(g.opp.c, g.opp.r), 3, `${pos}의 맞수는 센터 서드 밖`);
    }
  }
});

test('oppEvery: 처음엔 내 1/4, 공 5개마다 빨라지지만 1/2보다 빠르지 않다', () => {
  assert.equal(oppEvery(0), 4);
  assert.equal(oppEvery(4), 4);
  assert.equal(oppEvery(5), 3);
  assert.equal(oppEvery(10), 2);
  assert.equal(oppEvery(1000), 2);
});

test('맞수는 oppEvery 틱마다 한 칸씩 움직인다', () => {
  const g = createGame('GK', seeded(3));
  place(g, [[3, 1], [2, 1], [1, 1]], 'down');
  g.item = { c: 9, r: 13, type: 'roll' };
  withOpp(g, 9, 2, false);
  g.oppWait = 0;
  const moves = [];
  for (let i = 0; i < 8; i++) {
    const before = { c: g.opp.c, r: g.opp.r };
    setDirection(g, i % 2 ? 'down' : 'right');
    step(g, seeded(3));
    moves.push(before.c !== g.opp.c || before.r !== g.opp.r);
  }
  assert.deepEqual(moves, [false, false, false, true, false, false, false, true]);
});

test('접촉(내 반칙): 머리로 맞수에 부딪히면 잡고 있던 패스가 상대에게, 나는 튕긴다 (점수 그대로)', () => {
  const g = createGame('C', seeded());
  g.score = 30;
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.item = null;
  g.pass = { c: 15, r: 2, deadline: 999, total: 15 };
  g.passChain = 2;
  withOpp(g, 16, 7, false);
  const ev = step(g, seeded());
  const foul = ev.find((e) => e.type === 'foul');
  assert.ok(foul);
  assert.equal(foul.lost, 'pass');
  assert.equal(g.pass, null);
  assert.equal(g.passChain, 0);
  assert.ok(g.item, '공은 다른 곳에 다시 나온다');
  assert.equal(g.score, 30);
  assert.equal(g.contacts, 1);
  assert.ok(['up', 'down'].includes(g.dir));
  assert.deepEqual({ c: g.opp.c, r: g.opp.r }, { c: 16, r: 7 }, '맞수는 밀리지 않는다');
});

test('접촉(내 반칙): 공격 모드에서 공을 안 잡고 있으면 놓인 공이 다른 곳으로', () => {
  const g = createGame('GS', seeded(2));
  place(g, [[22, 7], [21, 7], [20, 7]], 'right');
  g.item = { c: 26, r: 3, type: 'ball' };
  withOpp(g, 23, 7, false);
  const ev = step(g, seeded(2));
  assert.equal(ev.find((e) => e.type === 'foul').lost, 'ball');
  assert.notDeepEqual({ c: g.item.c, r: g.item.r }, { c: 26, r: 3 });
});

test('장애(맞수 반칙): 내가 공을 잡고 있는데 0.9m 안으로 들어오면 페널티 패스 — 맞수는 옆에 비켜서서 아웃 오브 플레이 (Rule 6.4·16.1)', () => {
  // 머리가 (24,6)으로 가는 동안 맞수(25,5)는 (24,5)[붙음] 또는 (25,4)[0.9m 밖] 중 하나로 간다 (같은 거리 → 무작위)
  // 붙는 경우는 반드시 반칙, 아니면 반칙 아님. 여러 시드 중 붙는 경우를 하나 골라 자세히 본다.
  let g = null;
  for (let seed = 1; seed <= 30; seed++) {
    const t = createGame('GS', seeded(seed * 104729));
    place(t, [[24, 7], [23, 7], [22, 7]], 'up');
    t.item = null;
    t.pass = { c: 24, r: 1, deadline: t.ticks + 3, total: 15 };
    withOpp(t, 25, 5);
    const ev = step(t, seeded(seed * 104729)); // 작은 시드는 첫 난수가 비슷해서 크게 벌린다
    const pen = ev.some((e) => e.type === 'penalty');
    if (pen) g = g ?? t;
    else assert.ok(Math.max(Math.abs(t.opp.c - 24), Math.abs(t.opp.r - 6)) >= 2, '안 붙었으면 반칙도 없다');
  }
  assert.ok(g, '붙는 경우가 한 번은 있어야 한다');
  const head = g.snake[0];
  assert.equal(Math.max(Math.abs(g.opp.c - head.c), Math.abs(g.opp.r - head.r)), 2, '두 칸 떨어져 비켜선다');
  assert.equal(g.opp.out, true);
  assert.equal(g.pass.deadline, g.ticks + g.pass.total, '3초가 다시 시작');
  assert.equal(g.penaltiesWon, 1);

  // 아웃 오브 플레이 동안은 움직이지 않는다
  const at = { c: g.opp.c, r: g.opp.r };
  for (let i = 0; i < 6; i++) {
    setDirection(g, i % 2 ? 'left' : 'up');
    step(g, seeded(i));
    if (!g.pass) break;
    assert.deepEqual({ c: g.opp.c, r: g.opp.r }, at);
  }
});

test('장애: 공을 안 잡고 있으면 붙어도 반칙이 아니다', () => {
  const h = createGame('GS', seeded(12));
  place(h, [[24, 7], [23, 7], [22, 7]], 'up');
  h.item = { c: 24, r: 2, type: 'ball' };
  withOpp(h, 26, 6);
  const ev = step(h, seeded(12));
  assert.ok(!ev.some((e) => e.type === 'penalty'));
});

test('패스가 끝나면 아웃 오브 플레이가 풀린다', () => {
  const g = createGame('GS', seeded(5));
  place(g, [[24, 7], [23, 7], [22, 7]], 'right');
  g.item = null;
  g.pass = { c: 25, r: 7, deadline: 999, total: 15 };
  withOpp(g, 24, 10, false);
  g.opp.out = true;
  step(g, seeded(5)); // 패스 성공
  assert.equal(g.pass, null);
  assert.equal(g.opp.out, false);
});

test('맞수(공격 모드): 0.9m를 지킨 채 공·패스에 먼저 닿으면 정당한 인터셉트', () => {
  const g = createGame('GS', seeded(8));
  place(g, [[22, 1], [21, 1], [20, 1]], 'right');
  g.item = { c: 25, r: 10, type: 'ball' };
  withOpp(g, 25, 11);
  g.score = 40;
  let ev = step(g, seeded(8));
  assert.equal(ev.find((e) => e.type === 'intercept')?.what, 'ball');
  assert.equal(g.score, 40);

  const h = createGame('GS', seeded(8));
  place(h, [[22, 1], [21, 1], [20, 1]], 'right');
  h.item = null;
  h.passChain = 2;
  h.pass = { c: 25, r: 10, deadline: 999, total: 15 };
  withOpp(h, 24, 10);
  ev = step(h, seeded(8));
  const i = ev.find((e) => e.type === 'intercept');
  assert.equal(i?.what, 'pass');
  assert.equal(i.legal, true);
  assert.equal(h.pass, null);
  assert.equal(h.passChain, 0);
});

test('맞수(수비 모드): 내 머리 앞을 막으러 다가온다', () => {
  const g = createGame('GK', seeded(9));
  place(g, [[3, 2], [2, 2], [1, 2]], 'right');
  g.item = { c: 9, r: 13, type: 'roll' };
  withOpp(g, 9, 2);
  step(g, seeded(9)); // 머리 (4,2), 두 칸 앞 (6,2)
  assert.ok(Math.abs(g.opp.c - 6) + Math.abs(g.opp.r - 2) < 3);
});

test('교체하면 맞수도 새 포지션의 맞수로 바뀐다', () => {
  const g = createGame('C', seeded(10));
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  withOpp(g, 15, 1, false);
  g.pass = null; // 센터 패스는 끝난 상태로
  g.item = { c: 16, r: 7, type: 'sub' };
  step(g, seeded(10));
  assert.ok(g.opp, '다시 등장');
  assert.equal(g.opp.position, MATCHUP[g.position]);
});

test('nearOffside: 오프사이드 칸에서 2칸(가로+세로) 이내인지', () => {
  // GK 허용은 col 0-9 → col 10부터 센터 서드(오프사이드)
  assert.equal(nearOffside('GK', 8, 5), true); // 2칸
  assert.equal(nearOffside('GK', 7, 5), false); // 3칸
  assert.equal(nearOffside('GK', 9, 0), true);
  // 코트 밖은 오프사이드가 아니다 (벽)
  assert.equal(nearOffside('GK', 7, 0), false);
});

test('패스 대상은 오프사이드 경계 2칸 이내에 나오지 않는다 (여러 위치·시드)', () => {
  for (const pos of POSITION_KEYS) {
    for (let seed = 1; seed <= 20; seed++) {
      const g = createGame(pos, seeded(seed), { mode: 'attack' });
      // 머리 앞 칸에 공을 두고 먹게 한다
      const h = g.snake[0];
      g.item = { c: h.c + 1, r: h.r, type: 'ball' };
      setDirection(g, 'right');
      step(g, seeded(seed));
      if (!g.pass) continue;
      assert.equal(nearOffside(g.position, g.pass.c, g.pass.r), false, `${pos} seed ${seed}`);
    }
  }
});

test('공·교체 아이템은 오프사이드 칸 바로 옆(1칸 이내)에 나오지 않는다', () => {
  let checked = 0;
  for (const pos of POSITION_KEYS) {
    for (let seed = 1; seed <= 30; seed++) {
      const g = createGame(pos, seeded(seed), { mode: 'attack' });
      const it = g.item;
      if (!it) continue; // C는 센터 패스로 공을 든 채 시작
      if (it.type === 'roll') continue; // 굴러오는 공은 구역 끝에서 출발해 안쪽으로 굴러온다
      assert.equal(nearOffside(g.position, it.c, it.r, ITEM_OFFSIDE_MARGIN), false, `${pos} seed ${seed}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 80);
});

test('센터 패스 시작: C만 센터 서드에서, 나머지는 센터 서드 밖에서 출발 (Rule 8.10·8.11)', () => {
  for (const pos of POSITION_KEYS) {
    const g = createGame(pos, seeded());
    for (const s of g.snake) {
      if (pos === 'C') assert.equal(zoneOf(g.snake[0].c, g.snake[0].r), 3, 'C는 센터 서드');
      else assert.notEqual(zoneOf(s.c, s.r), 3, `${pos}는 센터 서드 밖`);
      assert.ok(isAllowed(pos, s.c, s.r));
    }
  }
});


test('페널티 패스 때 맞수는 내가 가는 방향 앞이 아니라 옆에 비켜선다 (Rule 6.4b)', () => {
  let checked = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = createGame('GS', seeded(seed * 104729));
    place(t, [[24, 7], [23, 7], [22, 7]], 'up');
    t.item = null;
    t.pass = { c: 24, r: 1, deadline: t.ticks + 30, total: 15 };
    withOpp(t, 25, 5);
    const ev = step(t, seeded(seed * 104729));
    if (!ev.some((e) => e.type === 'penalty')) continue;
    checked += 1;
    assert.equal(t.opp.r, t.snake[0].r, '머리와 같은 줄(옆)');
  }
  assert.ok(checked > 0);
});

test('아웃 오브 플레이 맞수에 부딪히면 반칙 없이 튕긴다', () => {
  const g = createGame('C', seeded());
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.item = null;
  g.pass = { c: 15, r: 2, deadline: 999, total: 15 };
  withOpp(g, 16, 7, false);
  g.opp.out = true;
  const ev = step(g, seeded());
  assert.equal(ev[0].type, 'bump');
  assert.ok(g.pass, '공은 그대로');
  assert.equal(g.contacts, 0);
});

test('C는 센터 서클에서 공을 든 채 상대 C와 함께 출발하고, 첫 패스는 센터 서드 안으로 (Rule 8.8·8.9·8.14)', () => {
  for (let seed = 1; seed <= 15; seed++) {
    for (const mode of ['attack', 'defence']) {
      const g = createGame('C', seeded(seed), { mode });
      assert.deepEqual(g.snake[0], { c: 15, r: 7 }, '머리가 센터 서클에 걸친 칸');
      assert.equal(g.opp.position, 'C');
      assert.equal(zoneOf(g.opp.c, g.opp.r), 3);
      assert.ok(Math.max(Math.abs(g.opp.c - 15), Math.abs(g.opp.r - 7)) >= 2, '상대 C는 0.9m 밖');
      assert.ok(g.pass, '공을 든 채 시작');
      assert.equal(g.pass.centre, true);
      assert.equal(zoneOf(g.pass.c, g.pass.r), 3, '동료는 센터 서드 안');
      assert.equal(g.item, null, '공은 하나뿐');
    }
  }
});

test('센터 패스에 성공하면 pass 이벤트에 centre 표시, 그 뒤 다음 공', () => {
  const g = createGame('C', seeded(4), { mode: 'attack' });
  const h = g.snake[0];
  g.pass = { c: h.c + 1, r: h.r, deadline: 99, total: 15, centre: true };
  withOpp(g, 15, 13, false);
  setDirection(g, 'right');
  const ev = step(g, seeded(4));
  assert.equal(ev.find((e) => e.type === 'pass')?.centre, true);
  assert.ok(g.item);
});

test('상대 팀 센터 패스 쿼터에는 C도 공 없이 시작한다 (Rule 8.1 번갈아)', () => {
  const g = createGame('C', seeded(3), { mode: 'attack', ourCentrePass: false });
  assert.equal(g.pass, null);
  assert.ok(g.item, '코트에 공이 있다');
  assert.deepEqual(g.snake[0], { c: 15, r: 7 });
});

test('접촉 반칙: 맞수가 그 자리에서 페널티 패스를 하고, 공이 손을 떠날 때까지 나는 멈춘다 (Rule 6.4c·17)', () => {
  const g = createGame('C', seeded());
  place(g, [[15, 7], [14, 7], [13, 7]], 'right');
  g.pass = null;
  g.item = { c: 20, r: 2, type: 'ball' };
  withOpp(g, 16, 7);
  const ev = step(g, seeded());
  const foul = ev.find((e) => e.type === 'foul');
  assert.ok(foul.freeze >= 2 && foul.freeze < passTicks(g.balls), '3초(Held ball) 전에 공을 놓는다');
  assert.equal(g.opp.taking, true);
  const head = { ...g.snake[0] };
  const opp = { c: g.opp.c, r: g.opp.r };
  setDirection(g, 'left'); // 멈춘 동안 누른 방향은 기억된다
  let released = false;
  for (let i = 0; i < foul.freeze; i++) {
    const e = step(g, seeded(i));
    assert.deepEqual(g.snake[0], head, '나는 멈춰 있다');
    assert.deepEqual({ c: g.opp.c, r: g.opp.r }, opp, '맞수는 제자리에서 패스한다');
    if (e.some((x) => x.type === 'penaltyRelease')) released = true;
  }
  assert.ok(released, '공이 손을 떠났다');
  assert.equal(g.frozen, 0);
  assert.equal(g.opp.taking, false);
  step(g, seeded());
  assert.notDeepEqual(g.snake[0], head, '다시 움직인다');
});

test('penaltyReleaseTicks: 2틱 이상, 3초 전', () => {
  for (let i = 0; i < 50; i++) {
    const n = penaltyReleaseTicks(0, seeded(i * 7919));
    assert.ok(n >= 2 && n < passTicks(0));
  }
});

test('골 서클 페널티 패스(GS·GA): 슛 칸이 생기고, 슛하면 +30 골 — 패스하면 슛 칸은 사라진다 (Rule 6.6)', () => {
  // 장애가 골 서클 안에서 일어나는 경우를 찾는다
  let g = null;
  for (let seed = 1; seed <= 40 && !g; seed++) {
    const t2 = createGame('GS', seeded(seed * 104729));
    place(t2, [[26, 7], [25, 7], [24, 7]], 'up');
    t2.item = null;
    t2.pass = { c: 22, r: 3, deadline: t2.ticks + 30, total: 15 };
    withOpp(t2, 27, 5);
    const ev = step(t2, seeded(seed * 104729));
    const pen = ev.find((e) => e.type === 'penalty');
    if (pen?.shot) g = t2;
  }
  assert.ok(g, '골 서클 안 페널티 패스');
  assert.ok(g.shot);
  assert.equal(zoneOf(g.shot.c, g.shot.r), 1);
  // 슛 칸 바로 옆으로 머리를 옮겨 슛
  const s0 = g.score;
  place(g, [[g.shot.c - 1, g.shot.r], [g.shot.c - 2, g.shot.r], [g.shot.c - 3, g.shot.r]], 'right');
  g.opp.out = true;
  const ev = step(g, seeded());
  const shot = ev.find((e) => e.type === 'ball' && e.penaltyShot);
  assert.ok(shot);
  assert.equal(g.score - s0, GOAL_POINTS);
  assert.equal(g.pass, null);
  assert.equal(g.shot, null);

  // GS가 아니면(서클 밖·다른 포지션) 슛 칸 없음
  const h = createGame('WA', seeded(3));
  place(h, [[22, 7], [21, 7], [20, 7]], 'up');
  h.item = null;
  h.pass = { c: 18, r: 3, deadline: h.ticks + 30, total: 15 };
  withOpp(h, 23, 5);
  step(h, seeded(5));
  assert.equal(h.shot ?? null, null);
});

test('센터 패스: 어느 포지션이든 첫 공은 센터 서클에서 시작해 센터 서드로 (Rule 8.8·8.14)', () => {
  for (const pos of POSITION_KEYS) {
    for (const ours of [true, false]) {
      if (pos === 'C' && ours) continue; // 내가 C면 직접 공을 들고 시작 (다른 테스트)
      for (let seed = 1; seed <= 10; seed++) {
        const g = createGame(pos, seeded(seed), { mode: 'attack', ourCentrePass: ours });
        const cb = g.centreBall;
        assert.ok(cb, `${pos} 센터 패스 경로`);
        assert.equal(zoneOf(cb.via.c, cb.via.r), 3, '센터 서드에서 받는다');
        if (pos !== 'C') assert.deepEqual(cb.from, { x: COURT.cols / 2, y: COURT.rows / 2 }, '센터 서클에서 시작');
        assert.ok(g.item && isAllowed(pos, g.item.c, g.item.r), '첫 공은 내가 갈 수 있는 곳');
        assert.deepEqual(cb.to, { c: g.item.c, r: g.item.r });
        if (isAllowed(pos, cb.via.c, cb.via.r)) assert.deepEqual(cb.to, cb.via, '센터 서드에 갈 수 있으면 그 자리에 첫 공');
        else assert.notEqual(zoneOf(g.item.c, g.item.r), 3, '못 가면 한 번 더 패스되어 내 구역으로');
        assert.ok(!g.snake.some((x) => x.c === g.item.c && x.r === g.item.r));
      }
    }
  }
});

test('맞수는 구석에 몰린 내 머리의 마지막 출구를 막지 않는다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = seeded(seed * 104729);
    const g = createGame('GS', rng, { mode: 'attack' });
    // 오른쪽 아래 구석: 머리 (29,14), 몸은 위로 → 출구는 왼쪽 (28,14) 하나뿐
    place(g, [[29, 14], [29, 13], [29, 12], [29, 11]], 'down');
    g.pass = null;
    g.item = { c: 27, r: 14, type: 'ball' };
    g.opp = { c: 27, r: 13, position: 'GK', out: false };
    for (let i = 0; i < 12; i++) {
      g.oppWait = 99;
      step(g, rng);
      if (g.over) break;
      const h = g.snake[0];
      const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => {
        const n = { c: h.c + dc, r: h.r + dr };
        return isAllowed('GS', n.c, n.r) && !g.snake.slice(0, -1).some((x) => x.c === n.c && x.r === n.r) && !(g.opp && g.opp.c === n.c && g.opp.r === n.r);
      });
      assert.ok(exits.length > 0 || g.frozen > 0, `seed ${seed}: 머리가 갇힘`);
    }
  }
});

test('공은 구석 칸에 나오지 않는다 (다른 칸이 있으면)', () => {
  for (const pos of POSITION_KEYS) {
    for (let seed = 1; seed <= 40; seed++) {
      const g = createGame(pos, seeded(seed), { mode: 'attack' });
      for (let i = 0; i < 5; i++) {
        g.item = spawnItem(g, seeded(seed * 7 + i));
        if (g.item?.type !== 'ball') continue;
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => isAllowed(pos, g.item.c + dc, g.item.r + dr)).length;
        assert.ok(open >= 3, `${pos} 공이 구석 (${g.item.c},${g.item.r})`);
      }
    }
  }
});

test('구석에서 튕길 곳이 없어 멈추면, 출구를 막던 맞수는 바로 비켜선다 (영원히 갇히지 않게)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = seeded(seed * 104729);
    const g = createGame('GS', rng, { mode: 'attack' });
    place(g, [[29, 14], [29, 13], [29, 12], [29, 11]], 'down');
    g.pass = null;
    g.item = { c: 20, r: 3, type: 'ball' };
    g.opp = { c: 28, r: 14, position: 'GK', out: false };
    step(g, rng); // 아래는 벽, 왼쪽은 맞수, 오른쪽은 벽 → 멈춤
    assert.equal(g.dir, null);
    assert.ok(!(g.opp.c === 28 && g.opp.r === 14), '맞수가 비켜섬');
    assert.ok(setDirection(g, 'left'));
    step(g, rng);
    assert.deepEqual(g.snake[0], { c: 28, r: 14 }, '왼쪽으로 빠져나옴');
  }
});
