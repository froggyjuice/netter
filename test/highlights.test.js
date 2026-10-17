import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHighlights, rangesFor, addHighlight, removeHighlight, markedHtml, lineKey } from '../src/shared/highlights.js';
import { RULEBOOK } from '../src/shared/rulebook.js';

const T = '공을 가진 선수를 수비할 때는 0.9m 이상 떨어져야 해요.';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('칠하기: 앞뒤 공백 빼기, 겹치거나 붙은 구간은 하나로', () => {
  let m = addHighlight({}, '16-0', T, T.indexOf('0.9m'), T.indexOf('0.9m') + 5);
  assert.deepEqual(m['16-0'], ['0.9m']);
  m = addHighlight(m, '16-0', T, T.indexOf('이상'), T.indexOf('이상') + 2);
  assert.deepEqual(m['16-0'], ['0.9m 이상']);
  m = addHighlight(m, '16-0', T, 0, 1);
  assert.deepEqual(m['16-0'], ['공', '0.9m 이상']);
  assert.deepEqual(addHighlight(m, '16-0', T, 3, 3), m, '빈 선택은 무시');
});

test('지우기: 누른 글자가 든 구간만', () => {
  let m = { '16-0': ['공', '0.9m 이상'] };
  m = removeHighlight(m, '16-0', T, T.indexOf('이상'));
  assert.deepEqual(m['16-0'], ['공']);
  m = removeHighlight(m, '16-0', T, 0);
  assert.equal(m['16-0'], undefined);
});

test('요약 문장이 바뀌어 글자가 없어지면 그 형광펜만 사라짐', () => {
  assert.deepEqual(rangesFor('완전히 새 문장', ['0.9m', '새']), [[4, 5]]);
});

test('HTML: <mark> 로 감싸고 글자는 안전하게', () => {
  assert.equal(markedHtml('a < b 0.9m', ['0.9m'], esc), 'a &lt; b <mark class="hl" data-at="6">0.9m</mark>');
});

test('저장값 읽기: 깨진 값 · 이상한 키는 버림', () => {
  assert.deepEqual(parseHighlights('{oops'), {});
  assert.deepEqual(parseHighlights(JSON.stringify({ '16-0': ['0.9m', 3, ''], hack: ['x'], '1-2': 'x' })), { '16-0': ['0.9m'] });
  assert.equal(lineKey(16, 0), '16-0');
});

test('규칙 사전: 줄마다 근거(조항 · 쪽 · 짧은 원문 구절)가 있고, 원문 구절은 짧게', () => {
  for (const r of RULEBOOK) {
    for (const p of r.points) {
      assert.ok(p.t && p.ref && p.p >= 11 && p.p <= 69, `Rule ${r.no}: ${p.t}`);
      assert.ok(p.en.split(/\s+/).length <= 10, `원문 구절은 10단어 이하: ${p.en}`);
      assert.ok(p.ref.startsWith(String(r.no)), `조항 번호가 장과 맞아야: ${r.no} / ${p.ref}`);
    }
  }
});
