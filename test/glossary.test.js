import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, wrapTerms, glossaryOf } from '../src/shared/glossary.js';
import { RULEBOOK } from '../src/shared/rulebook.js';

const allText = RULEBOOK.flatMap((r) => [r.title, ...r.points.map((p) => p.t)]).join('\n');

test('낱말 풀이: 모든 낱말이 규칙 사전 글에 한 번 이상 나온다 (쓸모없는 풀이 없음)', () => {
  for (const g of GLOSSARY) {
    const words = [g.term, ...(g.aliases ?? [])];
    assert.ok(words.some((w) => allText.includes(w)), `${g.term} 이(가) 사전 글에 없어요`);
    assert.ok(g.text.length > 10 && g.rule, g.term);
  }
});

test('낱말 감싸기: 긴 낱말 먼저, 줄마다 처음 한 번만, 태그 안은 그대로', () => {
  const out = wrapTerms('작은 반칙은 프리 패스, 또 프리 패스. <mark class="hl" data-at="0">페널티 패스</mark>');
  assert.equal((out.match(/class="term"/g) ?? []).length, 2);
  assert.match(out, /<mark class="hl" data-at="0"><span class="term"[^>]*>페널티 패스<\/span><\/mark>/);
  assert.equal(wrapTerms('<a title="오프사이드">x</a>'), '<a title="오프사이드">x</a>');
  assert.equal(glossaryOf('Obstruction').term, '장애 반칙');
  assert.equal(glossaryOf('없는말'), null);
});

test('낱말 감싸기는 글자 내용을 바꾸지 않는다 (형광펜 위치 계산이 그대로)', () => {
  const strip = (h) => h.replace(/<[^>]*>/g, '');
  for (const r of RULEBOOK) for (const p of r.points) assert.equal(strip(wrapTerms(p.t)), p.t);
});
