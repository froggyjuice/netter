import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventHandler } from '../lib/event-handler.js';
import { memoryEventStore } from '../lib/event-store.js';
import { memoryMemberStore } from '../lib/member-store.js';
import { signSession } from '../lib/session.js';

const ENV = { SESSION_SECRET: 'test-secret', VERCEL: '1' };
const NOW = Date.parse('2026-10-20T00:00:00Z');

async function setup() {
  const members = memoryMemberStore();
  const events = memoryEventStore();
  let r = 0;
  const handle = createEventHandler({ eventStore: events, memberStore: members, env: ENV, now: () => NOW, rng: () => ((r = (r * 9301 + 49297) % 233280) / 233280) });
  const admin = await members.insert({ name: '김운영', phone: '01011112222', role: 'admin' });
  const ms = [];
  for (let i = 0; i < 8; i++) ms.push(await members.insert({ name: `회원${i}`, phone: `0103333000${i}`, role: 'member' }));
  const h = (m) => ({ authorization: `Bearer ${signSession({ mid: m.id }, ENV.SESSION_SECRET, NOW)}` });
  const post = (m, body) => handle({ method: 'POST', headers: m ? h(m) : {}, body });
  const get = (m) => handle({ method: 'GET', headers: m ? h(m) : {}, query: {} });
  return { handle, admin, ms, post, get, events };
}
const EVENT = { title: '수요 훈련', starts_at: '2026-10-21T10:00:00Z', ends_at: '2026-10-21T12:00:00Z', place: '체육관' };

test('일정 만들기는 운영진만, 회원은 투표 · 바꾸기 · 취소', async () => {
  const { admin, ms, post, get } = await setup();
  assert.equal((await post(null, { action: 'create', event: EVENT })).status, 401);
  assert.equal((await post(ms[0], { action: 'create', event: EVENT })).body.error, 'not_admin');
  const created = await post(admin, { action: 'create', event: EVENT });
  assert.equal(created.status, 201);
  const id = created.body.event.id;
  assert.equal((await post(ms[0], { action: 'vote', id, answer: 'yes', wish: ['GS'], fallback: 'sub', comment: '조금 늦어요' })).status, 200);
  await post(ms[1], { action: 'vote', id, answer: 'maybe' });
  await post(ms[1], { action: 'vote', id, answer: 'no' });
  const list = (await get(ms[2])).body;
  const e = list.events[0];
  assert.deepEqual(e.counts, { yes: 1, no: 1, maybe: 0 });
  assert.deepEqual(e.votes.find((v) => v.name === '회원0'), { member_id: ms[0].id, name: '회원0', answer: 'yes', comment: '조금 늦어요', wish: ['GS'], fallback: 'sub', by_admin: false });
  assert.equal(list.members, undefined, '회원에게는 회원 목록 없음');
  assert.ok(!JSON.stringify(list).includes('0103333'), '전화번호는 절대 안 나감');
  await post(ms[0], { action: 'unvote', id });
  assert.equal((await get(ms[2])).body.events[0].counts.yes, 0);
});

test('로그인 안 하면 일정과 수만 (이름 · 배정 결과 없음)', async () => {
  const { admin, ms, post, get } = await setup();
  const id = (await post(admin, { action: 'create', event: EVENT })).body.event.id;
  await post(ms[0], { action: 'vote', id, answer: 'yes' });
  const e = (await get(null)).body.events[0];
  assert.equal(e.counts.yes, 1);
  assert.equal(e.votes, undefined);
  assert.equal((await get(null)).body.me, null);
});

test('마감 · 닫기 · 취소면 회원 투표 불가, 운영진은 나중에 추가 가능', async () => {
  const { admin, ms, post, get } = await setup();
  const past = (await post(admin, { action: 'create', event: { ...EVENT, vote_deadline: '2026-10-19T00:00:00Z' } })).body.event.id;
  assert.equal((await post(ms[0], { action: 'vote', id: past, answer: 'yes' })).body.error, 'vote_closed');
  const ok = await post(admin, { action: 'setVote', id: past, member_id: ms[0].id, answer: 'yes' });
  assert.equal(ok.body.event.votes[0].by_admin, true);
  const id = (await post(admin, { action: 'create', event: EVENT })).body.event.id;
  await post(admin, { action: 'close', id, closed: true });
  assert.equal((await post(ms[1], { action: 'vote', id, answer: 'yes' })).body.error, 'vote_closed');
  await post(admin, { action: 'close', id, closed: false });
  assert.equal((await post(ms[1], { action: 'vote', id, answer: 'yes' })).status, 200);
  const c = await post(admin, { action: 'cancel', id, notice: '체육관 공사로 취소' });
  assert.equal(c.body.event.status, 'cancelled');
  assert.equal(c.body.event.notice, '체육관 공사로 취소');
  assert.equal((await post(ms[2], { action: 'vote', id, answer: 'yes' })).body.error, 'vote_closed');
  // 운영진은 회원 이름 목록도 받는다 (나중에 추가할 때)
  assert.equal((await get(admin)).body.members.length, 9);
});

test('변경 알림 · 다시 열기 · 지우기', async () => {
  const { admin, post, get } = await setup();
  const id = (await post(admin, { action: 'create', event: EVENT })).body.event.id;
  const u = await post(admin, { action: 'update', id, event: { place: '새 체육관' }, notice: '장소가 바뀌었어요' });
  assert.equal(u.body.event.place, '새 체육관');
  assert.equal(u.body.event.notice, '장소가 바뀌었어요');
  await post(admin, { action: 'cancel', id });
  assert.equal((await post(admin, { action: 'restore', id })).body.event.status, 'active');
  await post(admin, { action: 'delete', id });
  assert.equal((await get(admin)).body.events.length, 0);
});

test('인원 확정 → 포지션 배정 (참석만, 투표 닫힘), 다시 뽑기 · 취소', async () => {
  const { admin, ms, post } = await setup();
  const id = (await post(admin, { action: 'create', event: EVENT })).body.event.id;
  assert.equal((await post(admin, { action: 'confirm', id })).body.error, 'no_attendees');
  for (const m of ms) await post(m, { action: 'vote', id, answer: 'yes', wish: m.name === '회원0' ? ['C'] : [] });
  await post(ms[7], { action: 'vote', id, answer: 'no' });
  const c = await post(admin, { action: 'confirm', id });
  const lineup = c.body.event.lineup;
  assert.equal(lineup.teamCount, 1);
  assert.equal(lineup.teams[0].starters.C.name, '회원0', '혼자 C를 원하면 C');
  assert.equal(Object.keys(lineup.teams[0].starters).length, 7);
  assert.equal(lineup.teams[0].subs.length, 0, '참석 7명');
  assert.ok(c.body.event.vote_closed && c.body.event.confirmed_at);
  assert.ok(!JSON.stringify(lineup).includes('wish'), '저장은 이름 · id 만');
  await post(admin, { action: 'cancel', id });
  assert.equal((await post(admin, { action: 'restore', id })).body.event.vote_closed, true, '확정한 훈련은 되살려도 투표는 닫힘');
  assert.equal((await post(admin, { action: 'unconfirm', id })).body.event.lineup, null);
});

test('날짜 정하기 투표: 운영진이 후보를 올리고 → 회원 체크 → 정하면 훈련 일정이 생김', async () => {
  const { admin, ms, post, get } = await setup();
  assert.equal((await post(ms[0], { action: 'pollCreate', poll: {} })).body.error, 'not_admin');
  const poll = (await post(admin, { action: 'pollCreate', poll: { title: '11월 첫 훈련', options: [{ starts_at: '2026-11-05T10:00:00Z' }, { starts_at: '2026-11-06T10:00:00Z', place: '대운동장' }] } })).body.poll;
  await post(ms[0], { action: 'pollVote', id: poll.id, picks: [1, 2] });
  await post(ms[1], { action: 'pollVote', id: poll.id, picks: [2] });
  const view = (await get(ms[2])).body.polls[0];
  assert.deepEqual(view.options.map((o) => [o.count, o.best]), [[1, false], [2, true]]);
  assert.deepEqual(view.options[1].names, ['회원0', '회원1']);
  assert.deepEqual((await get(ms[0])).body.polls[0].my_picks, [1, 2]);
  assert.deepEqual((await get(null)).body.polls[0].options[1].names, [], '로그인 안 하면 이름 없이');
  const decided = await post(admin, { action: 'pollDecide', id: poll.id, option: 2 });
  assert.equal(decided.body.event.starts_at, '2026-11-06T10:00:00.000Z');
  assert.equal(decided.body.event.place, '대운동장');
  assert.equal(decided.body.event.title, '목요 정기 훈련');
  assert.equal((await post(ms[2], { action: 'pollVote', id: poll.id, picks: [1] })).body.error, 'poll_closed');
  assert.equal((await post(admin, { action: 'pollDecide', id: poll.id, option: 1 })).body.error, 'poll_decided');
});

test('학기 · 출석 순위: 회원은 1~3위, 운영진은 전체', async () => {
  const { admin, ms, post, get, events } = await setup();
  assert.equal((await post(admin, { action: 'semesterSave', semester: { name: '2학기', starts_on: '2026-09-01', ends_on: '2026-08-01' } })).body.error, 'bad_semester');
  await post(admin, { action: 'semesterSave', semester: { name: '2학기', starts_on: '2026-09-01', ends_on: '2026-12-20' } });
  // 지난 훈련 2번: 4명이 차례로 출석 수가 다르게
  for (const [day, who] of [['2026-10-06', [0, 1, 2, 3, 4]], ['2026-10-13', [0, 1, 2]]]) {
    const e = await events.createEvent({ title: '훈련', starts_at: `${day}T10:00:00.000Z` });
    for (const i of who) await events.putVote(e.id, ms[i].id, { answer: 'yes', wish: [], fallback: 'random' });
  }
  const forMember = (await get(ms[5])).body.ranking;
  assert.equal(forMember.month.label, '10월');
  assert.equal(forMember.month.total, 2);
  assert.deepEqual(forMember.month.rows.map((r) => [r.name, r.count, r.rank]), [['회원0', 2, 1], ['회원1', 2, 1], ['회원2', 2, 1]]);
  assert.equal(forMember.month.full, false);
  const forAdmin = (await get(admin)).body.ranking;
  assert.equal(forAdmin.semester.label, '2학기');
  assert.equal(forAdmin.semester.rows.length, 5, '운영진은 전체 순위');
  assert.equal((await get(null)).body.ranking, null);
});

test('표가 아직 없으면(SQL 실행 전) 500 대신 not_ready', async () => {
  const members = memoryMemberStore();
  const broken = { listEvents: async () => { throw new Error('relation "events" does not exist'); } };
  const handle = createEventHandler({ eventStore: broken, memberStore: members, env: ENV, now: () => NOW });
  const out = await handle({ method: 'GET', headers: {}, query: {} });
  assert.equal(out.status, 200);
  assert.equal(out.body.not_ready, true);
});
