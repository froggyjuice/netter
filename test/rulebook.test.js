import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULEBOOK, searchRules, chapterOf, OFFICIAL_RULES_URL } from '../src/shared/rulebook.js';
import { RULE_NOTES } from '../src/shared/rule-notes.js';
import { GAMES } from '../src/games/registry.js';

test('규칙 사전: Rule 1~21이 빠짐없이 차례대로', () => {
  assert.deepEqual(RULEBOOK.map((r) => r.no), Array.from({ length: 21 }, (_, i) => i + 1));
  for (const r of RULEBOOK) assert.ok(r.title && r.points.length >= 2, `Rule ${r.no}`);
  assert.ok(OFFICIAL_RULES_URL.startsWith('https://netball.sport/'));
});

test('규칙 사전: 연습 게임 id는 registry 의 게임만 (개발 중 포함)', () => {
  const ids = GAMES.map((g) => g.id); // 개발 중인 게임 포함
  for (const r of RULEBOOK) for (const g of r.games) assert.ok(ids.includes(g), `Rule ${r.no}: ${g}`);
  assert.ok(RULEBOOK.find((r) => r.no === 15).games.includes('throwin'));
});

test('검색: 모든 단어가 들어 있는 규칙만, 빈 검색은 전체', () => {
  assert.equal(searchRules('').length, 21);
  assert.ok(searchRules('오프사이드').some((r) => r.no === 14));
  assert.ok(searchRules('3초').some((r) => r.no === 11));
  assert.deepEqual(searchRules('rule 20').map((r) => r.no), [20]);
  assert.equal(searchRules('없는단어xyz').length, 0);
});

test('chapterOf: 경기 후 규칙 복습의 Rule 표기 → 사전의 장 번호', () => {
  assert.equal(chapterOf('Rule 9.6a'), 9);
  assert.equal(chapterOf('Rule 8.8·8.14'), 8);
  assert.equal(chapterOf('Rule 3 (p.20)'), 3);
  assert.equal(chapterOf('규칙'), null);
  for (const n of Object.values(RULE_NOTES)) assert.ok(chapterOf(n.rule), `${n.title}: ${n.rule}`);
});
