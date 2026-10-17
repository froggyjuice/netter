import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEYS, collectSave, applySave, isEmptySave } from '../src/shared/save-bundle.js';

test('이 기기의 놀이터 기록만 묶는다 (다른 키 · 빈 값은 빼고)', () => {
  const mem = { 'netball.pass': '{"first":3}', 'netball.rhythm': '', 'netball.session': 'secret', 'netball.nick': '굴' };
  assert.deepEqual(collectSave((k) => mem[k] ?? null), { 'netball.pass': '{"first":3}' });
});

test('계정 묶음을 이 기기에 쓴다: 정해진 키의 문자열만', () => {
  const mem = {};
  const written = applySave({ 'netball.profile': '{"badges":{}}', 'netball.session': 'hack', 'netball.pass': 3 }, (k, v) => (mem[k] = v));
  assert.deepEqual(written, ['netball.profile']);
  assert.deepEqual(Object.keys(mem), ['netball.profile']);
  assert.deepEqual(applySave(null, () => {}), []);
});

test('빈 묶음 판별', () => {
  assert.ok(isEmptySave({}));
  assert.ok(isEmptySave({ 'netball.pass': '{}' }));
  assert.ok(!isEmptySave({ 'netball.pass': '{"first":3}' }));
  assert.equal(SAVE_KEYS.length, 4);
});
