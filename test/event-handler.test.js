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
  assert.equal((await post(admin, { action: 'unconfirm', id })).body.event.lineup, null);
});
