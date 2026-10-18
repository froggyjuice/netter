// 1~4쿼터 · 모든 포지션 · 가로/세로 화면에서 '180도 돌기 금지'와 '우리 골 반짝임 위치'가 늘 맞는지 한꺼번에 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, setDirection, step } from '../src/games/snake-logic.js';
import { swapEndsFor, ourCentrePass } from '../src/games/match-logic.js';
import { createView, ORIENTATIONS } from '../src/shared/view-transform.js';
import { POSITION_KEYS, COURT, zoneOf } from '../src/shared/zones.js';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const DIRS = { up: { c: 0, r: -1 }, down: { c: 0, r: 1 }, left: { c: -1, r: 0 }, right: { c: 1, r: 0 } };
const SCREEN = ['up', 'down', 'left', 'right'];

test('180도 돌기 금지: 1~4쿼터 × 7포지션 × 가로/세로, 마구 누르는 입력에도 목 쪽으로 꺾여 탈락하지 않는다', () => {
  for (let q = 1; q <= 4; q++) {
    for (const o of ORIENTATIONS) {
      const view = createView(o, swapEndsFor(q));
      for (const pos of POSITION_KEYS) {
        const rng = seeded(q * 100 + pos.charCodeAt(0) + (o === 'portrait' ? 7 : 0));
        let g = createGame(pos, rng, { ourCentrePass: ourCentrePass(q) });
        let crashes = 0;
        for (let t = 0; t < 1500; t++) {
          // 한 틱에 0~3번, 화면 기준 방향을 아무렇게나 (조이스틱을 휘젓는 것처럼)
          const n = Math.floor(rng() * 4);
          for (let k = 0; k < n; k++) setDirection(g, view.dirFromScreen(SCREEN[Math.floor(rng() * 4)]));
          const [head, neck] = g.snake;
          const ev = step(g, rng);
          if (ev.some((e) => e.type === 'crash')) {
            crashes += 1;
            const d = DIRS[g.dir];
            assert.ok(!(neck && head.c + d.c === neck.c && head.r + d.r === neck.r), `${q}Q ${o} ${pos}: 목 쪽으로 꺾여 탈락`);
          }
          if (g.over) g = createGame(pos, rng, { ourCentrePass: ourCentrePass(q) });
        }
        assert.ok(crashes >= 0);
      }
    }
  }
});

test('우리 골 반짝임: 1·3쿼터는 오른쪽(세로: 위), 2·4쿼터는 진영 교대로 왼쪽(세로: 아래) — 안내 문구와 같은 쪽', () => {
  const expect = { landscape: [['x', 'max'], ['x', 0]], portrait: [['y', 0], ['y', 'max']] };
  for (let q = 1; q <= 4; q++) {
    for (const o of ORIENTATIONS) {
      const view = createView(o, swapEndsFor(q));
      const p = view.toScreen(COURT.cols, COURT.rows / 2); // 게임 좌표 오른쪽 끝 = 우리가 슛하는 골
      const [axis, edge] = expect[o][swapEndsFor(q) ? 1 : 0];
      const want = edge === 'max' ? (axis === 'x' ? view.cols : view.rows) : 0;
      assert.equal(p[axis], want, `${q}Q ${o}`);
    }
  }
  // 반짝이는 칸(1구역)은 늘 게임 좌표 오른쪽 끝의 골 서클
  for (let r = 0; r < COURT.rows; r++) for (let c = 0; c < COURT.cols / 2; c++) assert.notEqual(zoneOf(c, r), 1);
});

test('모든 포지션 · 쿼터 시작: 몸(목) 쪽 화면 방향 입력은 막히고, 나머지 세 방향은 받는다', () => {
  for (let q = 1; q <= 4; q++) {
    for (const o of ORIENTATIONS) {
      const view = createView(o, swapEndsFor(q));
      for (const pos of POSITION_KEYS) {
        const ok = SCREEN.filter((s) => setDirection(createGame(pos, seeded(3), { ourCentrePass: ourCentrePass(q) }), view.dirFromScreen(s)));
        assert.equal(ok.length, 3, `${q}Q ${o} ${pos}`);
        assert.ok(!ok.includes(view.dirToScreen('left')), `${q}Q ${o} ${pos}: 몸 쪽(${view.dirToScreen('left')})은 막혀야`);
      }
    }
  }
});
