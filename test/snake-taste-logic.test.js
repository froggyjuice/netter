import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSITION_KEYS, isAllowed } from '../src/shared/zones.js';
import { createTaste, steer, tasteStep } from '../src/games/snake-taste-logic.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('맛보기: 모든 포지션이 자기 구역 안에서 시작하고 공도 구역 안', () => {
  for (const pos of POSITION_KEYS) {
    const g = createTaste(pos, seeded(1));
    assert.equal(g.snake.length, 3);
    assert.ok(g.snake.every((x) => isAllowed(pos, x.c, x.r)), pos);
    assert.ok(g.item && isAllowed(pos, g.item.c, g.item.r));
  }
});

test('맛보기: 다른 구역으로 가려 하면 오프사이드 이벤트 후 옆으로 튕겨 구역 안에 머문다', () => {
  for (const pos of POSITION_KEYS) {
    const rng = seeded(3);
    const g = createTaste(pos, rng);
    steer(g, 'right');
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      for (const e of tasteStep(g, rng)) seen.add(e.type);
      assert.ok(g.snake.every((x) => isAllowed(pos, x.c, x.r)), `${pos} 구역 밖`);
      if (!g.dir) steer(g, i % 2 ? 'up' : 'down');
    }
    assert.ok(seen.has('offside') || seen.has('wall'), pos);
  }
});

test('맛보기: 공을 먹으면 자라고, GS·GA가 골 서클에서 먹으면 골', () => {
  const g = createTaste('GS', seeded(5));
  const h = g.snake[0];
  g.item = { c: h.c + 1, r: h.r };
  steer(g, 'right');
  const [ev] = tasteStep(g, seeded(5));
  assert.equal(ev.type, 'ball');
  assert.equal(g.snake.length, 4);
  assert.equal(g.balls, 1);
  g.snake = [{ c: 28, r: 7 }, { c: 27, r: 7 }, { c: 26, r: 7 }];
  g.dir = 'right';
  g.item = { c: 29, r: 7 };
  assert.ok(tasteStep(g, seeded(6)).find((e) => e.type === 'ball').goal);
});

test('맛보기: 정반대(몸 쪽)로는 돌 수 없다', () => {
  const g = createTaste('C', seeded(7));
  assert.equal(steer(g, 'left'), false); // 몸이 왼쪽
  assert.equal(steer(g, 'up'), true);
});
