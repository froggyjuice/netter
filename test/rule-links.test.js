import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleLinkSegments, RULE_TERMS } from '../src/ui/rule-links.js';
import { RULEBOOK } from '../src/shared/rulebook.js';

const links = (segs) => segs.filter((s) => s.chapter).map((s) => `${s.text}→${s.chapter}`);

test('규칙 낱말과 Rule 번호를 규칙 사전의 장으로', () => {
  const segs = ruleLinkSegments('다른 구역에 들어가면 오프사이드예요 (Rule 14.1). 3초 안에 패스!');
  assert.deepEqual(links(segs), ['오프사이드→14', 'Rule 14.1→14', '3초→11']);
  assert.equal(segs.map((s) => s.text).join(''), '다른 구역에 들어가면 오프사이드예요 (Rule 14.1). 3초 안에 패스!', '글은 그대로');
});

test('긴 낱말 먼저: 서드 건너뛰기 · 페널티 패스는 한 덩어리', () => {
  assert.deepEqual(links(ruleLinkSegments('서드 건너뛰기는 프리 패스, 장애는 페널티 패스')), [
    '서드 건너뛰기→12', '프리 패스→6', '장애→16', '페널티 패스→6',
  ]);
});

test('같은 칸에서 같은 낱말은 한 번만 (Rule 번호는 매번)', () => {
  const used = new Set();
  assert.deepEqual(links(ruleLinkSegments('오프사이드! 또 오프사이드 (Rule 14)', used)), ['오프사이드→14', 'Rule 14→14']);
  assert.deepEqual(links(ruleLinkSegments('오프사이드 (Rule 14)', used)), ['Rule 14→14'], '다음 줄에서도 이미 쓴 낱말은 그대로');
});

test('모든 낱말은 실제 있는 장(1~21)으로', () => {
  const nos = RULEBOOK.map((r) => r.no);
  for (const [w, n] of Object.entries(RULE_TERMS)) assert.ok(nos.includes(n), w);
  assert.deepEqual(links(ruleLinkSegments('Rule 99와 Rule 0')), []);
});
