import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_RULES, ruleOfDay, dayNumber, dayLabel } from '../src/shared/daily-rule.js';
import { SCENES } from '../src/ui/rule-scenes.js';
import { RULEBOOK } from '../src/shared/rulebook.js';

const DAY = 86_400_000;
const at = (iso) => Date.parse(iso);

test('Rule 1~21 모두 한 줄 이상, 장면은 모두 그릴 수 있음', () => {
  const rules = new Set(DAILY_RULES.map((d) => d.rule));
  for (const r of RULEBOOK) assert.ok(rules.has(r.no), `Rule ${r.no} 없음`);
  for (const d of DAILY_RULES) {
    assert.equal(typeof SCENES[d.scene], 'function', `장면 ${d.scene} 없음`);
    assert.ok(d.text.length > 5 && d.text.length <= 60, d.text);
  }
});

test('한국 시간 자정에 날짜가 바뀌고, 같은 날은 늘 같은 규칙', () => {
  // 2026-10-17 23:59 KST = 14:59 UTC, 2026-10-18 00:00 KST = 15:00 UTC
  assert.equal(dayNumber(at('2026-10-17T14:59:00Z')) + 1, dayNumber(at('2026-10-17T15:00:00Z')));
  assert.equal(dayLabel(dayNumber(at('2026-10-17T15:00:00Z'))), '10월 18일');
  assert.deepEqual(ruleOfDay(at('2026-10-17T15:00:00Z')), ruleOfDay(at('2026-10-18T14:00:00Z')));
});

test('목록을 한 바퀴 도는 동안 겹치지 않고, 이어지는 이틀은 늘 다른 규칙', () => {
  const n = DAILY_RULES.length;
  const start = n * 100 * DAY; // 한 바퀴의 첫날 (KST 기준 오프셋은 같은 바퀴 안에서 상쇄)
  for (let cycle = 0; cycle < 5; cycle++) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const day = dayNumber(start) - (dayNumber(start) % n) + cycle * n + i;
      const t = day * DAY;
      seen.add(ruleOfDay(t).text + ruleOfDay(t).scene);
    }
    assert.equal(seen.size, n);
  }
  let prev = null;
  for (let d = 0; d < n * 6; d++) {
    const cur = ruleOfDay(start + d * DAY);
    if (prev) assert.notDeepEqual([cur.text, cur.scene], [prev.text, prev.scene]);
    prev = cur;
  }
});
