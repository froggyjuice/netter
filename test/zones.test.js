import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURT, POSITIONS, POSITION_KEYS, zoneOf, isAllowed, allowedCells, MATCHUP, opponentZones, canShootAt } from '../src/shared/zones.js';

// World Netball Rules of Netball 2024, Rule 3 표(p.20)
const RULEBOOK = {
  GS: [1, 2],
  GA: [1, 2, 3],
  WA: [2, 3],
  C: [2, 3, 4],
  WD: [3, 4],
  GD: [3, 4, 5],
  GK: [4, 5],
};

test('포지션별 허용 구역이 규정집 표와 같다', () => {
  assert.deepEqual([...POSITION_KEYS].sort(), Object.keys(RULEBOOK).sort());
  for (const [pos, zones] of Object.entries(RULEBOOK)) {
    assert.deepEqual(POSITIONS[pos].zones, zones, pos);
  }
});

test('zoneOf: 대표 지점', () => {
  assert.equal(zoneOf(29, 7), 1); // 공격 서클 한가운데(골 라인 쪽)
  assert.equal(zoneOf(25, 7), 1); // 서클 안쪽 끝
  assert.equal(zoneOf(24, 7), 2); // 서클 바로 밖
  assert.equal(zoneOf(20, 0), 2); // 공격 서드 모서리
  assert.equal(zoneOf(19, 7), 3);
  assert.equal(zoneOf(10, 7), 3);
  assert.equal(zoneOf(9, 0), 4);
  assert.equal(zoneOf(5, 7), 4);
  assert.equal(zoneOf(4, 7), 5);
  assert.equal(zoneOf(0, 7), 5);
  assert.equal(zoneOf(-1, 0), 0);
  assert.equal(zoneOf(30, 0), 0);
  assert.equal(zoneOf(0, 15), 0);
  assert.equal(zoneOf(1.5, 1), 0);
});

test('모든 셀이 정확히 한 구역에 속하고 좌우가 대칭이다', () => {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let r = 0; r < COURT.rows; r++) {
    for (let c = 0; c < COURT.cols; c++) {
      const z = zoneOf(c, r);
      assert.ok(z >= 1 && z <= 5);
      counts[z] += 1;
      const mirror = zoneOf(COURT.cols - 1 - c, r);
      assert.equal(mirror, { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 }[z], `대칭 (${c},${r})`);
    }
  }
  assert.equal(counts[3], COURT.third * COURT.rows); // 센터 서드 = 10 x 15
  assert.equal(counts[1], counts[5]);
  // 반지름 4.9m 반원 넓이 ≈ 37.7 칸
  assert.ok(counts[1] >= 32 && counts[1] <= 44, `서클 칸 수 ${counts[1]}`);
});

test('각 포지션의 허용 구역은 하나로 이어져 있어 모든 칸에 도달할 수 있다', () => {
  for (const pos of POSITION_KEYS) {
    const cells = allowedCells(pos);
    const key = (c, r) => `${c},${r}`;
    const set = new Set(cells.map((x) => key(x.c, x.r)));
    const seen = new Set([key(cells[0].c, cells[0].r)]);
    const queue = [cells[0]];
    while (queue.length) {
      const { c, r } = queue.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(c + dc, r + dr);
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push({ c: c + dc, r: r + dr });
        }
      }
    }
    assert.equal(seen.size, set.size, `${pos} 영역이 끊겨 있다`);
  }
});

test('isAllowed: 슈터는 수비 서클에, 키퍼는 공격 서클에 들어갈 수 없다', () => {
  assert.equal(isAllowed('GS', 29, 7), true);
  assert.equal(isAllowed('GS', 0, 7), false);
  assert.equal(isAllowed('GK', 0, 7), true);
  assert.equal(isAllowed('GK', 29, 7), false);
  assert.equal(isAllowed('WA', 29, 7), false); // WA는 서클 안 불가
  assert.equal(isAllowed('WD', 0, 7), false); // WD도 서클 안 불가
  assert.equal(isAllowed('C', 15, 7), true);
  assert.equal(isAllowed('XX', 15, 7), false);
});

test('맞수 짝은 서로 대응하고, 맞수 구역(좌우 반전)은 내 구역과 같다', () => {
  for (const p of POSITION_KEYS) {
    assert.equal(MATCHUP[MATCHUP[p]], p);
    assert.deepEqual([...opponentZones(p)].sort(), [...POSITIONS[p].zones].sort());
  }
});

test('canShootAt: GS·GA만, 공격 골 서클 안에서만', () => {
  assert.equal(canShootAt('GS', 28, 7), true);
  assert.equal(canShootAt('GA', 28, 7), true);
  assert.equal(canShootAt('GS', 22, 7), false); // 서클 밖
  for (const p of ['WA', 'C', 'WD', 'GD', 'GK']) assert.equal(canShootAt(p, 28, 7), false);
});

test('cellColor: 우리 팀 골 서클은 GS·GA면 밝은 황금색, 못 들어가는 포지션이면 흐린 황금색', async () => {
  const { cellColor } = await import('../src/shared/court-colors.js');
  const { THEME } = await import('../src/shared/theme.js');
  assert.equal(cellColor('GS', 28, 7, true), THEME.goalZone);
  for (const p of ['WA', 'C', 'WD', 'GD', 'GK']) assert.equal(cellColor(p, 28, 7, false), THEME.goalZoneMuted);
  assert.equal(cellColor('GK', 1, 7, true), THEME.allowed); // 수비 서클은 그대로
  assert.equal(cellColor('GS', 1, 7, false), THEME.forbidden);
});

test('규칙 기록: 처음 겪은 순서대로 횟수를 센다, 모르는 규칙은 무시', async () => {
  const { createRuleLog, RULE_NOTES } = await import('../src/shared/rule-notes.js');
  const log = createRuleLog();
  log.add('offside');
  log.add('heldBall');
  log.add('offside');
  log.add('nope');
  assert.deepEqual(log.entries().map((e) => [e.id, e.count]), [['offside', 2], ['heldBall', 1]]);
  for (const n of Object.values(RULE_NOTES)) assert.ok(n.rule.startsWith('Rule') && n.title && n.text);
});
