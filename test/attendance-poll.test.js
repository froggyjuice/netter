import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendeesOf, monthRange, semesterRange, currentSemester, ranking, podium } from '../src/shared/attendance.js';
import { cleanPoll, pollOpen, cleanPicks, tally } from '../src/shared/poll-logic.js';

const M = [{ id: 1, name: '가' }, { id: 2, name: '나' }, { id: 3, name: '다' }, { id: 4, name: '라' }];
const ev = (id, iso, extra = {}) => ({ id, starts_at: iso, status: 'active', lineup: null, ...extra });

test('출석: 배정이 있으면 배정(교체 포함), 없으면 참석 투표', () => {
  const lineup = { teams: [{ starters: { GS: { id: 1 }, C: { id: 2 } }, subs: [{ pos: 'C', player: { id: 3 } }] }] };
  assert.deepEqual([...attendeesOf(ev(1, 'x', { lineup }))].sort(), [1, 2, 3]);
  assert.deepEqual([...attendeesOf(ev(2, 'x'), [{ event_id: 2, member_id: 4, answer: 'yes' }, { event_id: 2, member_id: 1, answer: 'no' }])], [4]);
});

test('기간: 한국 시간 이번 달 · 학기(끝날 포함) · 지금 학기', () => {
  const now = Date.parse('2026-10-31T16:00:00Z'); // 11월 1일 01:00 KST
  assert.deepEqual(monthRange(now), { from: '2026-10-31T15:00:00.000Z', to: '2026-11-30T15:00:00.000Z', label: '11월' });
  const s = { name: '2학기', starts_on: '2026-09-01', ends_on: '2026-12-20' };
  assert.deepEqual(semesterRange(s), { from: '2026-08-31T15:00:00.000Z', to: '2026-12-20T15:00:00.000Z', label: '2학기' });
  assert.equal(currentSemester([s, { name: '1학기', starts_on: '2026-03-01', ends_on: '2026-06-30' }], now).name, '2학기');
  assert.equal(currentSemester([s], Date.parse('2027-01-05T00:00:00Z')), null);
});

test('순위: 지난 · 취소 안 된 훈련만, 공동 순위, 출석률, 1~3위', () => {
  const events = [
    ev(1, '2026-10-01T10:00:00Z'),
    ev(2, '2026-10-08T10:00:00Z'),
    ev(3, '2026-10-15T10:00:00Z', { status: 'cancelled' }),
    ev(4, '2026-10-29T10:00:00Z'), // 아직 안 함
  ];
  const yes = (e, m) => ({ event_id: e, member_id: m, answer: 'yes' });
  const votes = [yes(1, 1), yes(2, 1), yes(1, 2), yes(2, 2), yes(1, 3), yes(3, 4), yes(4, 4)];
  const r = ranking(events, votes, M, { from: '2026-09-30T15:00:00Z', to: '2026-10-31T15:00:00Z', now: Date.parse('2026-10-20T00:00:00Z') });
  assert.equal(r.total, 2);
  assert.deepEqual(r.rows.map((x) => [x.name, x.count, x.rate, x.rank]), [['가', 2, 100, 1], ['나', 2, 100, 1], ['다', 1, 50, 3]]);
  assert.equal(podium(r.rows).length, 3);
});

test('날짜 투표: 후보 2~10개, 중복 · 이상한 값 정리, 마감 · 체크 · 모으기', () => {
  assert.equal(cleanPoll({ options: [{ starts_at: '2026-10-22T10:00:00Z' }] }).error, 'few_options');
  const p = cleanPoll({ options: [{ starts_at: '2026-10-23T10:00:00Z', place: '체육관' }, { starts_at: '2026-10-22T10:00:00Z' }, { starts_at: '2026-10-22T10:00:00Z' }, { starts_at: 'x' }] }).value;
  assert.deepEqual(p.options.map((o) => [o.id, o.starts_at.slice(0, 10)]), [[1, '2026-10-22'], [2, '2026-10-23']]);
  assert.equal(p.title, '훈련 날짜 정하기');
  const poll = { ...p, status: 'open', deadline: '2026-10-21T00:00:00Z' };
  assert.ok(pollOpen(poll, Date.parse('2026-10-20T00:00:00Z')));
  assert.ok(!pollOpen(poll, Date.parse('2026-10-21T00:00:00Z')));
  assert.ok(!pollOpen({ ...poll, status: 'decided' }, 0));
  assert.deepEqual(cleanPicks(poll, [2, '1', 9, 2]), [2, 1]);
  const t = tally(poll, [{ member_id: 1, picks: [1, 2] }, { member_id: 2, picks: [2] }], new Map([[1, '가'], [2, '나']]));
  assert.deepEqual(t.map((o) => [o.count, o.names, o.best]), [[1, ['가'], false], [2, ['가', '나'], true]]);
});
