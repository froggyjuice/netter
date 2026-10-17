import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  voteOpen, deadlineOf, cleanEvent, cleanVote, summarize, dayKey, whenText, toLocalInput, fromLocalInput, monthCells, icsFor, googleCalendarUrl, shareText,
} from '../src/shared/event-logic.js';

const EV = { id: 7, title: '수요 훈련', starts_at: '2026-10-21T10:00:00.000Z', ends_at: '2026-10-21T12:00:00.000Z', place: '○○체육관', memo: '운동화 꼭!', status: 'active', vote_closed: false, vote_deadline: null };

test('투표 마감: 기본은 훈련 시작 2시간 전, 운영진이 닫거나 취소하면 못 함', () => {
  assert.equal(deadlineOf(EV), '2026-10-21T08:00:00.000Z');
  assert.ok(voteOpen(EV, Date.parse('2026-10-21T07:59:00Z')));
  assert.ok(!voteOpen(EV, Date.parse('2026-10-21T08:00:00Z')));
  assert.ok(!voteOpen({ ...EV, vote_closed: true }, 0));
  assert.ok(!voteOpen({ ...EV, status: 'cancelled' }, 0));
  assert.ok(!voteOpen({ ...EV, vote_deadline: '2026-10-20T00:00:00Z' }, Date.parse('2026-10-20T01:00:00Z')));
});

test('일정 입력 정리: 제목 기본 훈련, 시간 확인, 끝 < 시작이면 오류', () => {
  assert.deepEqual(cleanEvent({ starts_at: '2026-10-21T10:00:00Z' }).value, { title: '훈련', starts_at: '2026-10-21T10:00:00.000Z', ends_at: null, place: null, memo: null, vote_deadline: null });
  assert.equal(cleanEvent({ starts_at: 'nope' }).error, 'bad_time');
  assert.equal(cleanEvent({ starts_at: '2026-10-21T10:00:00Z', ends_at: '2026-10-21T09:00:00Z' }).error, 'bad_time');
  assert.deepEqual(cleanEvent({ place: '  새 체육관 ' }, { partial: true }).value, { place: '새 체육관' });
});

test('투표 정리: 희망 포지션은 참석일 때만, 3개까지, 이상한 값 버림', () => {
  assert.equal(cleanVote({ answer: 'sure' }).error, 'bad_vote');
  assert.deepEqual(cleanVote({ answer: 'yes', wish: ['GS', 'XX', 'GS', 'C', 'GK', 'WA'], fallback: 'sub', comment: ' 늦어요 ' }).value, { answer: 'yes', comment: '늦어요', wish: ['GS', 'C', 'GK'], fallback: 'sub' });
  assert.deepEqual(cleanVote({ answer: 'no', wish: ['GS'] }).value.wish, []);
});

test('투표 모으기: 답별 이름순', () => {
  const s = summarize([{ name: '하나', answer: 'yes' }, { name: '가나', answer: 'yes' }, { name: '다라', answer: 'maybe' }]);
  assert.deepEqual(s.yes.map((v) => v.name), ['가나', '하나']);
  assert.equal(s.no.length, 0);
});

test('한국 시간: 날짜 · 표시 · 입력칸 왕복', () => {
  assert.equal(dayKey('2026-10-20T15:30:00Z'), '2026-10-21');
  assert.equal(whenText(EV), '10월 21일 (수) 19:00~21:00');
  assert.equal(toLocalInput(EV.starts_at), '2026-10-21T19:00');
  assert.equal(fromLocalInput('2026-10-21T19:00'), EV.starts_at);
  assert.equal(fromLocalInput(''), null);
});

test('달력: 6주, 일요일 시작, 그 달 표시', () => {
  const cells = monthCells(2026, 10);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].key, '2026-09-27'); // 10월 1일은 목요일
  assert.equal(cells.find((c) => c.key === '2026-10-01').inMonth, true);
  assert.equal(cells[0].inMonth, false);
});

test('내 캘린더 추가: .ics · 구글 링크 · 카톡 문구', () => {
  const ics = icsFor(EV, 'https://x/#/calendar');
  assert.ok(ics.includes('DTSTART:20261021T100000Z') && ics.includes('DTEND:20261021T120000Z'));
  assert.ok(ics.includes('LOCATION:○○체육관'));
  assert.ok(googleCalendarUrl(EV).includes('dates=20261021T100000Z%2F20261021T120000Z'));
  assert.ok(shareText(EV, { kind: 'invite', url: 'u' }).includes('투표 마감: 10월 21일 (수) 17:00'));
  assert.ok(shareText({ ...EV, notice: '체육관이 바뀌었어요' }, { kind: 'change' }).includes('→ 체육관이 바뀌었어요'));
  const lineup = { teams: [{ starters: { GS: { name: '가' }, C: { name: '나' } }, subs: [{ pos: 'C', player: { name: '다' } }] }] };
  const t = shareText(EV, { kind: 'lineup', lineup });
  assert.ok(t.includes('GS 가 · C 나') && t.includes('교체: 다(C)'));
});
