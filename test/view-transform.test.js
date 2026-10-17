import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/shared/view-transform.js';
import { COURT } from '../src/shared/zones.js';
import { DIRS } from '../src/games/snake-logic.js';

const DIR_NAMES = ['up', 'down', 'left', 'right'];

test('가로 화면은 그대로다', () => {
  const v = createView('landscape');
  assert.equal(v.cols, COURT.cols);
  assert.equal(v.rows, COURT.rows);
  assert.deepEqual(v.toScreen(3.5, 7), { x: 3.5, y: 7 });
  for (const d of DIR_NAMES) assert.equal(v.dirFromScreen(d), d);
});

test('세로 화면: 15×30, 공격 골(오른쪽 끝)이 화면 위, 수비 골이 화면 아래', () => {
  const v = createView('portrait');
  assert.equal(v.cols, COURT.rows);
  assert.equal(v.rows, COURT.cols);
  assert.equal(v.toScreen(COURT.cols, 7.5).y, 0); // 공격 골라인 → 맨 위
  assert.equal(v.toScreen(0, 7.5).y, COURT.cols); // 수비 골라인 → 맨 아래
  assert.equal(v.toScreen(10, 0).x, 0); // 코트 위쪽 사이드라인 → 화면 왼쪽
});

test('세로 화면: 모든 칸이 화면 안의 서로 다른 칸에 놓이고, 중심은 그 칸 안에 있다', () => {
  const v = createView('portrait');
  const seen = new Set();
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const o = v.cellOrigin(c, r);
      assert.ok(o.x >= 0 && o.x < v.cols && o.y >= 0 && o.y < v.rows, `${c},${r}`);
      seen.add(`${o.x},${o.y}`);
      const m = v.cellCenter(c, r);
      assert.deepEqual(m, { x: o.x + 0.5, y: o.y + 0.5 });
    }
  }
  assert.equal(seen.size, COURT.cols * COURT.rows);
});

test('세로 화면: 화면 ↑는 공격 방향(→), 화면 → 는 게임 ↓ 이고 왕복하면 그대로', () => {
  const v = createView('portrait');
  assert.equal(v.dirFromScreen('up'), 'right');
  assert.equal(v.dirFromScreen('right'), 'down');
  for (const d of DIR_NAMES) {
    assert.equal(v.dirToScreen(v.dirFromScreen(d)), d);
    assert.equal(v.dirFromScreen(v.dirToScreen(d)), d);
  }
});

test('방향 변환은 실제 칸 이동과 일치한다 (게임에서 한 칸 가면 화면에서도 그 방향으로 한 칸)', () => {
  for (const [o, swap] of [['landscape', false], ['portrait', false], ['landscape', true], ['portrait', true]]) {
    const v = createView(o, swap);
    for (const d of DIR_NAMES) {
      const a = v.cellOrigin(10, 7);
      const b = v.cellOrigin(10 + DIRS[d].c, 7 + DIRS[d].r);
      assert.deepEqual([b.x - a.x, b.y - a.y], v.screenVec(d), `${o} ${swap} ${d}`);
      assert.equal(v.dirFromScreen(v.dirToScreen(d)), d);
    }
  }
});

test('진영 교대(Rule 2.2): 180° 돌려 우리 골이 반대편 — 가로는 왼쪽, 세로는 아래', () => {
  const l = createView('landscape', true);
  assert.equal(l.toScreen(COURT.cols, 7.5).x, 0, '공격 골라인이 화면 왼쪽');
  assert.equal(l.dirFromScreen('left'), 'right', '화면 ← 가 공격 방향');
  const p = createView('portrait', true);
  assert.equal(p.toScreen(COURT.cols, 7.5).y, COURT.cols, '공격 골라인이 화면 아래');
  assert.equal(p.dirFromScreen('down'), 'right', '화면 ↓ 가 공격 방향');
  // 모든 칸이 화면 안의 서로 다른 칸
  const seen = new Set();
  for (let r = 0; r < COURT.rows; r++) for (let c = 0; c < COURT.cols; c++) {
    const o = p.cellOrigin(c, r);
    assert.ok(o.x >= 0 && o.x < p.cols && o.y >= 0 && o.y < p.rows);
    seen.add(`${o.x},${o.y}`);
    assert.deepEqual(p.cellCenter(c, r), { x: o.x + 0.5, y: o.y + 0.5 });
  }
  assert.equal(seen.size, COURT.cols * COURT.rows);
});
