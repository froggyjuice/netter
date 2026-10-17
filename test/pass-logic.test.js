import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed } from '../src/shared/zones.js';
import { PASS_STAGES } from '../src/games/pass-stages.js';
import {
  createPuzzle, passTo, step, shoot, heldBall, checkPass, solve, starsFor, thirdOf, oppAllowed, placementProblems,
} from '../src/games/pass-logic.js';

const stage = (id) => PASS_STAGES.find((s) => s.id === id);

test('모든 스테이지: 선수는 자기 구역, 상대도 자기 구역, 최소 패스 수 = 기준(par)', () => {
  assert.ok(PASS_STAGES.length >= 5);
  for (const s of PASS_STAGES) {
    for (const p of s.players) if (!p.place) assert.ok(isAllowed(p.pos, p.c, p.r), `${s.id} ${p.pos}`);
    for (const o of s.opponents) assert.ok(oppAllowed(o.pos, o.c, o.r), `${s.id} 상대 ${o.pos}`);
    const sol = solve(s, s.solution ? { placements: s.solution } : {});
    assert.ok(sol, `${s.id} 풀 수 있어야 함`);
    assert.equal(sol.passes, s.par, `${s.id} par`);
  }
});

test('모든 스테이지: 한 팀에 같은 포지션은 한 명씩 (우리 팀 · 상대 팀)', () => {
  for (const s of PASS_STAGES) {
    const us = s.players.map((p) => p.pos);
    const them = s.opponents.map((o) => o.pos);
    assert.equal(new Set(us).size, us.length, `${s.id} 우리 팀 중복: ${us}`);
    assert.equal(new Set(them).size, them.length, `${s.id} 상대 팀 중복: ${them}`);
  }
});

test('서드: 0~9 수비 · 10~19 센터 · 20~29 공격', () => {
  assert.deepEqual([0, 9, 10, 19, 20, 29].map(thirdOf), [0, 0, 1, 1, 2, 2]);
});

test('서드 건너뛰기: 수비 서드 → 공격 서드 바로 패스는 실패 (Rule 12.3)', () => {
  const st = createPuzzle(stage('third'));
  assert.equal(checkPass(st, 'GS').reason, 'overThird');
  const ev = passTo(st, 'GS');
  assert.equal(ev.at(-1).type, 'fail');
  assert.equal(ev.at(-1).reason, 'overThird');
  assert.equal(st.over.win, false);
  assert.deepEqual(passTo(st, 'C'), [], '실패 뒤에는 더 못 한다');
});

test('숏 패스: 바로 옆 동료에게는 실패 (Rule 12.1)', () => {
  const st = createPuzzle(stage('short'));
  assert.equal(checkPass(st, 'GA').reason, 'short');
  assert.equal(passTo(st, 'GA').at(-1).reason, 'short');
});

test('인터셉트: 공의 길 위에 상대가 있으면 실패', () => {
  const st = createPuzzle(stage('first'));
  const c = checkPass(st, 'GS');
  assert.equal(c.reason, 'intercept');
  assert.equal(c.by, 'GK');
});

test('정답 길: 패스 → 슛하면 클리어, 별은 기준 패스 수로', () => {
  const st = createPuzzle(stage('first'));
  assert.ok(passTo(st, 'WA')[0].ok);
  assert.ok(passTo(st, 'GS')[0].ok);
  const [goal] = shoot(st);
  assert.equal(goal.type, 'goal');
  assert.ok(st.over.win);
  assert.equal(starsFor(st.passes, stage('first').par), 3);
  assert.equal(starsFor(3, 2), 2);
  assert.equal(starsFor(5, 2), 1);
});

test('슛은 GS·GA가 골 서클 안에서만 (Rule 9.1)', () => {
  const st = createPuzzle(stage('first'));
  assert.equal(shoot(st).at(-1).reason, 'shot'); // C가 슛
  const st2 = createPuzzle(stage('first'));
  passTo(st2, 'WA');
  assert.equal(shoot(st2).at(-1).reason, 'shot'); // WA는 슛 못 함
});

test('피벗: 피벗 스테이지에서만, 한 발은 OK · 두 번째 발은 풋워크 반칙 (Rule 13)', () => {
  const early = createPuzzle(stage('first'));
  const h = early.players.find((p) => p.pos === 'C');
  assert.deepEqual(step(early, h.c, h.r + 1).map((e) => e.type), ['noPivot']);

  const st = createPuzzle(stage('pivot'));
  const wd = st.players.find((p) => p.pos === 'WD');
  assert.equal(step(st, wd.c - 1, wd.r - 1)[0].type, 'step');
  assert.equal(st.stepped, true);
  const ev = step(st, wd.c - 1, wd.r);
  assert.equal(ev.at(-1).reason, 'footwork');
});

test('피벗 스테이지는 피벗 없이는 풀 수 없다', () => {
  assert.equal(solve({ ...stage('pivot'), pivot: false }), null);
});

test('피벗으로 자기 구역 밖에 디디면 오프사이드', () => {
  const st = createPuzzle({ ...stage('pivot'), players: [{ pos: 'WD', c: 19, r: 7 }, { pos: 'C', c: 13, r: 2 }] , ball: 'WD' });
  assert.equal(step(st, 20, 7).at(-1).reason, 'offside'); // WD는 공격 서드에 못 감
});

test('잡은 뒤 옆 서드로 한 발 디뎌도 다음 패스는 처음 착지한 서드 기준 (Rule 12.5)', () => {
  const s = {
    id: 't', ball: 'C', pivot: true, opponents: [],
    players: [{ pos: 'C', c: 10, r: 7 }, { pos: 'GS', c: 27, r: 7 }, { pos: 'WD', c: 3, r: 2 }],
  };
  const st = createPuzzle(s);
  step(st, 9, 7); // 센터 서드에서 잡고 수비 서드로 한 발
  assert.equal(checkPass(st, 'GS'), null, '센터 서드에서 잡았으므로 공격 서드로 패스 가능');
});

test('3초 스테이지: 시간이 지나면 Held ball 실패 (Rule 11.4)', () => {
  const st = createPuzzle(stage('clock'));
  assert.equal(heldBall(st).at(-1).reason, 'held');
  const no = createPuzzle(stage('first'));
  assert.deepEqual(heldBall(no), []);
});

test('배치 스테이지: 처음 자리는 오프사이드, 정답 배치는 문제없음', () => {
  const s = stage('place');
  const start = placementProblems(s, {});
  assert.deepEqual(start.map((p) => p.pos).sort(), ['GA', 'WA']);
  assert.ok(start.every((p) => p.reason === 'offside'));
  assert.deepEqual(placementProblems(s, s.solution), []);
  assert.deepEqual(placementProblems(s, { ...s.solution, WA: { c: 24, r: 7 } }).map((p) => p.reason), ['occupied']);
});

test('서클 밖에서 잡고 한 발 디뎌 서클에 들어와도 슛 불가 (Rule 9.6a)', () => {
  const s = { id: 't', ball: 'GS', pivot: true, opponents: [], players: [{ pos: 'GS', c: 24, r: 7 }, { pos: 'C', c: 15, r: 7 }] };
  const st = createPuzzle(s);
  step(st, 25, 7); // 서클 안으로 한 발
  assert.equal(shoot(st).at(-1).reason, 'incorrectShot');
});

test('챕터: 모든 스테이지가 챕터에 속하고, 챕터 순서대로 이어진다', async () => {
  const { PASS_CHAPTERS } = await import('../src/games/pass-stages.js');
  const order = PASS_CHAPTERS.map((c) => c.id);
  let last = -1;
  for (const s of PASS_STAGES) {
    const i = order.indexOf(s.chapter);
    assert.ok(i >= 0, `${s.id} 챕터 없음`);
    assert.ok(i >= last, `${s.id} 챕터 순서`);
    last = i;
  }
  for (const c of PASS_CHAPTERS) assert.ok(PASS_STAGES.some((s) => s.chapter === c.id), `${c.id} 빈 챕터`);
  assert.equal(new Set(PASS_STAGES.map((s) => s.id)).size, PASS_STAGES.length, '스테이지 id 중복');
});

test('피벗 챕터의 스테이지는 피벗 없이는 풀 수 없다', () => {
  for (const id of ['pivot', 'pivot-dir', 'pivot-third']) assert.equal(solve({ ...stage(id), pivot: false }), null, id);
});
