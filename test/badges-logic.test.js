import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, emptyProfile, parseProfile, applyResult, remainingPositions, progress } from '../src/shared/badges-logic.js';
import { POSITION_KEYS } from '../src/shared/zones.js';

const base = {
  score: 0, offsides: 1, goals: 0, circleBlocks: 0, bestChain: 0, ballsVsOpp: 0, blocks: 0, position: 'C', played: ['C'],
};
const result = (over) => ({ ...base, ...over });
const ids = (earned) => earned.map((b) => b.id).sort();

test('배지 id는 겹치지 않는다', () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
});

test('조건을 채운 배지만 새로 얻는다', () => {
  const r = result({ score: 320, offsides: 0, goals: 1, bestChain: 5 });
  const { earned, profile } = applyResult(emptyProfile(), r, new Date('2026-10-15T00:00:00Z'));
  assert.deepEqual(ids(earned), ['clean', 'first-goal', 'pass-chain', 'score-300']);
  assert.equal(profile.badges['first-goal'], '2026-10-15T00:00:00.000Z');
});

test('경계값: 99점·4연속·14차단·9개는 아직, 그 이상이면 획득', () => {
  const below = applyResult(emptyProfile(), result({ score: 99, offsides: 0, bestChain: 4, blocks: 14, ballsVsOpp: 9 }));
  assert.deepEqual(ids(below.earned), []);
  const at = applyResult(emptyProfile(), result({ score: 100, offsides: 0, bestChain: 5, blocks: 15, ballsVsOpp: 10 }));
  assert.deepEqual(ids(at.earned), ['clean', 'defence-king', 'pass-chain', 'vs-opp']);
});

test('이미 가진 배지는 다시 주지 않고, 원래 profile은 바뀌지 않는다', () => {
  const first = applyResult(emptyProfile(), result({ circleBlocks: 1 }));
  const again = applyResult(first.profile, result({ circleBlocks: 3 }));
  assert.deepEqual(ids(again.earned), []);
  const p = emptyProfile();
  applyResult(p, result({ goals: 1 }));
  assert.deepEqual(p, emptyProfile());
});

test('올라운더: 여러 판(교체 포함)에 걸쳐 7개 포지션을 모두 뛰면 획득', () => {
  let profile = emptyProfile();
  let earned;
  ({ profile, earned } = applyResult(profile, result({ played: ['GS', 'GA', 'WA'] })));
  assert.deepEqual(ids(earned), []);
  ({ profile, earned } = applyResult(profile, result({ played: ['C', 'WD', 'GD'] })));
  assert.deepEqual(ids(earned), []);
  ({ profile, earned } = applyResult(profile, result({ played: ['GK'] })));
  assert.deepEqual(ids(earned), ['all-rounder']);
  assert.deepEqual([...profile.played].sort(), [...POSITION_KEYS].sort());
});

test('parseProfile: 깨진 값·모르는 배지·이상한 포지션은 버린다', () => {
  assert.deepEqual(parseProfile('not json'), emptyProfile());
  assert.deepEqual(parseProfile(null), emptyProfile());
  const p = parseProfile(JSON.stringify({ badges: { clean: '2026-01-01', hack: 'x', 'first-goal': 5 }, played: ['GS', 'XX', 'GS'] }));
  assert.deepEqual(p, { badges: { clean: '2026-01-01' }, played: ['GS'], best: {} });
  // 예전 형식(best 없음)도 그대로 읽는다, 이상한 best 값은 버린다
  const q = parseProfile(JSON.stringify({ badges: {}, played: [], best: { 'pass-chain': 3, clean: -5, hack: 9, 'score-300': 'x' } }));
  assert.deepEqual(q.best, { 'pass-chain': 3 });
});

test('remainingPositions: 아직 안 뛴 포지션만, 다 뛰면 빈 배열', () => {
  assert.deepEqual(remainingPositions(emptyProfile()), [...POSITION_KEYS]);
  assert.deepEqual(remainingPositions({ badges: {}, played: ['GS', 'C', 'GK'] }), ['GA', 'WA', 'WD', 'GD']);
  assert.deepEqual(remainingPositions({ badges: {}, played: [...POSITION_KEYS] }), []);
});

const badge = (id) => BADGES.find((b) => b.id === id);

test('진행도: 여러 판 중 한 판 최고 기록을 기억하고, 목표에 닿으면 획득', () => {
  let profile = emptyProfile();
  let earned;
  ({ profile } = applyResult(profile, result({ bestChain: 3, score: 120, offsides: 2 })));
  assert.deepEqual(progress(badge('pass-chain'), profile), { value: 3, goal: 5 });
  assert.deepEqual(progress(badge('clean'), profile), { value: 0, goal: 100 }); // 오프사이드가 있던 판은 0점
  ({ profile } = applyResult(profile, result({ bestChain: 1, score: 80, offsides: 0 })));
  assert.equal(progress(badge('pass-chain'), profile).value, 3, '최고 기록은 낮은 판으로 덮이지 않는다');
  assert.equal(progress(badge('clean'), profile).value, 80);
  ({ profile, earned } = applyResult(profile, result({ bestChain: 5 })));
  assert.deepEqual(ids(earned), ['pass-chain']);
  assert.deepEqual(progress(badge('score-300'), profile), { value: 120, goal: 300 });
});

test('진행도: 올라운더는 뛴 포지션 수, 값은 목표를 넘지 않는다', () => {
  const p = applyResult(emptyProfile(), result({ played: ['GS', 'GA'], score: 900 })).profile;
  assert.deepEqual(progress(badge('all-rounder'), p), { value: 2, goal: 7 });
  assert.deepEqual(progress(badge('score-300'), p), { value: 300, goal: 300 });
});
