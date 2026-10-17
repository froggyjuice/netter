import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RHYTHM_BADGES, parseRhythmSave, applyRhythmResult, bestFor, serializeRhythmSave, rhythmBook,
} from '../src/games/rhythm-records.js';

const NOW = new Date('2026-10-16T10:00:00Z');
const game = (over = {}) => ({
  mode: 'attack', difficulty: 'normal', position: 'GS', score: 0, bestCombo: 0, goals: 0, perfects: 0,
  incorrectShots: 0, helds: 0, rebounds: 0, lineGoals: 0, blocks: 0, obstructions: 0, stopPerfects: 0, ...over,
});

test('빈 저장값 · 깨진 저장값은 빈 기록', () => {
  for (const t of [null, '', '{', '"x"', '{"records":{"attack:normal":{"score":-5}}}']) {
    const s = parseRhythmSave(t);
    assert.deepEqual(s.records, {});
    assert.deepEqual(s.badges, {});
  }
});

test('최고 기록은 모드 × 난이도 칸마다 따로', () => {
  let s = parseRhythmSave(null);
  ({ save: s } = applyRhythmResult(s, game({ score: 500, bestCombo: 8 }), NOW));
  ({ save: s } = applyRhythmResult(s, game({ score: 300, difficulty: 'hard' }), NOW));
  ({ save: s } = applyRhythmResult(s, game({ score: 700, mode: 'defence', position: 'GK' }), NOW));
  assert.equal(bestFor(s, 'attack', 'normal').score, 500);
  assert.equal(bestFor(s, 'attack', 'hard').score, 300);
  assert.equal(bestFor(s, 'defence', 'normal').score, 700);
  assert.equal(bestFor(s, 'defence', 'normal').position, 'GK');
  assert.equal(bestFor(s, 'attack', 'easy'), null);
});

test('새 최고 기록: 이전 기록보다 높을 때만, 이전 값도 알려 준다', () => {
  let s = parseRhythmSave(null);
  let out = applyRhythmResult(s, game({ score: 500, bestCombo: 5 }), NOW);
  assert.ok(out.newRecord);
  assert.equal(out.prev, null);
  s = out.save;
  out = applyRhythmResult(s, game({ score: 400, bestCombo: 12 }), NOW);
  assert.ok(!out.newRecord);
  assert.equal(out.save.records['attack:normal'].score, 500);
  assert.equal(out.save.records['attack:normal'].combo, 12, '연속 기록은 따로 갱신');
  out = applyRhythmResult(out.save, game({ score: 520 }), NOW);
  assert.ok(out.newRecord);
  assert.equal(out.prev.score, 500);
  assert.equal(out.save.records['attack:normal'].date, '2026-10-16');
  assert.ok(!applyRhythmResult(parseRhythmSave(null), game({ score: 0 }), NOW).newRecord, '0점은 기록 아님');
});

test('배지: 공격 배지는 수비 모드 기록으로 얻지 않는다', () => {
  const s = parseRhythmSave(null);
  const { earned } = applyRhythmResult(s, game({ mode: 'defence', goals: 5, perfects: 20, blocks: 10, stopPerfects: 10 }), NOW);
  const ids = earned.map((b) => b.id);
  assert.ok(ids.includes('r-block-10'));
  assert.ok(ids.includes('r-gap-master'));
  assert.ok(!ids.includes('r-first-goal'));
  assert.ok(!ids.includes('r-perfect-10'));
});

test('배지: 클린 슈터는 서클 밖 슛·3초 지남이 한 번이라도 있으면 안 됨', () => {
  const s = parseRhythmSave(null);
  assert.ok(!applyRhythmResult(s, game({ goals: 12, helds: 1 }), NOW).earned.some((b) => b.id === 'r-clean'));
  assert.ok(!applyRhythmResult(s, game({ goals: 12, incorrectShots: 1 }), NOW).earned.some((b) => b.id === 'r-clean'));
  assert.ok(applyRhythmResult(s, game({ goals: 10 }), NOW).earned.some((b) => b.id === 'r-clean'));
});

test('배지: 0.9m 장인은 장애가 있으면 안 됨, 어려움 정복은 어려움에서만', () => {
  const s = parseRhythmSave(null);
  assert.ok(!applyRhythmResult(s, game({ mode: 'defence', stopPerfects: 15, obstructions: 1 }), NOW).earned.some((b) => b.id === 'r-gap-master'));
  assert.ok(!applyRhythmResult(s, game({ score: 1500 }), NOW).earned.some((b) => b.id === 'r-hard-1000'));
  assert.ok(applyRhythmResult(s, game({ score: 1000, difficulty: 'hard' }), NOW).earned.some((b) => b.id === 'r-hard-1000'));
});

test('배지: 선 위의 슈터는 여러 판 누적, 진행도도 누적', () => {
  let s = parseRhythmSave(null);
  let out = applyRhythmResult(s, game({ lineGoals: 2 }), NOW);
  assert.ok(!out.earned.some((b) => b.id === 'r-line'));
  const line = RHYTHM_BADGES.find((b) => b.id === 'r-line');
  assert.deepEqual(rhythmBook.progress(line, out.save), { value: 2, goal: 3 });
  out = applyRhythmResult(out.save, game({ lineGoals: 1 }), NOW);
  assert.ok(out.earned.some((b) => b.id === 'r-line'));
});

test('한 번 얻은 배지는 다시 "새 배지"로 나오지 않고, 저장 → 읽기 그대로', () => {
  let { save } = applyRhythmResult(parseRhythmSave(null), game({ goals: 1, score: 30 }), NOW);
  assert.ok(save.badges['r-first-goal']);
  const again = applyRhythmResult(save, game({ goals: 3, score: 90 }), NOW);
  assert.ok(!again.earned.some((b) => b.id === 'r-first-goal'));
  const back = parseRhythmSave(serializeRhythmSave(again.save));
  assert.deepEqual(back.records, again.save.records);
  assert.deepEqual(back.badges, again.save.badges);
});
