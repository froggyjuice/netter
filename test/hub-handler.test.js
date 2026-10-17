import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHubHandlers, normalizeName, normalizePhone, MAX_SAVE_BYTES } from '../lib/hub-handler.js';
import { memoryMemberStore, supabaseMemberStore, nameKey } from '../lib/member-store.js';
import { signSession, verifySession, bearer } from '../lib/session.js';

const ENV = { SESSION_SECRET: 'test-secret', ADMIN_CODE: 'netter', VERCEL: '1' };
async function setup() {
  const store = memoryMemberStore();
  const hub = createHubHandlers({ store, env: ENV, now: () => 1e12 });
  const admin = await store.insert({ name: '김운영', phone: '01011112222', role: 'admin' });
  const member = await store.insert({ name: '이회원', phone: '01033334444', role: 'member' });
  const login = async (name, phone) => (await hub.handleAuth({ method: 'POST', ip: 'x', body: { name, phone } })).body.token;
  const auth = (token, code) => ({ authorization: `Bearer ${token}`, ...(code ? { 'x-admin-code': code } : {}) });
  return { store, hub, admin, member, login, auth };
}

test('이름 · 전화번호 정리: 공백 · 하이픈 무시', () => {
  assert.equal(normalizeName('  이  회원 '), '이 회원');
  assert.equal(normalizeName(''), null);
  assert.equal(normalizePhone('010-3333-4444'), '01033334444');
  assert.equal(normalizePhone('02-123-4567'), null);
  assert.equal(nameKey('이 회원'), nameKey('이회원'));
});

test('세션 토큰: 서명 · 만료 · 위조', () => {
  const t = signSession({ mid: 7 }, 's', 1000);
  assert.equal(verifySession(t, 's', 2000).mid, 7);
  assert.equal(verifySession(t, 'other', 2000), null, '다른 비밀값');
  assert.equal(verifySession(t.replace(/^./, 'x'), 's', 2000), null, '내용 바꿈');
  assert.equal(verifySession(t, 's', 1000 + 181 * 86400000), null, '만료');
  assert.equal(bearer({ authorization: 'Bearer abc' }), 'abc');
});

test('로그인: 등록된 이름 + 전화번호면 바로 (공백·하이픈 달라도 OK)', async () => {
  const { hub } = await setup();
  const ok = await hub.handleAuth({ method: 'POST', ip: 'a', body: { name: '이 회원', phone: '010-3333-4444' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.deepEqual(ok.body.member, { id: 2, name: '이회원', role: 'member' });
  assert.equal((await hub.handleAuth({ method: 'POST', ip: 'a', body: { name: '모르는사람', phone: '01033334444' } })).status, 401);
  assert.equal((await hub.handleAuth({ method: 'POST', ip: 'a', body: { name: '이회원', phone: '123' } })).status, 400);
});

test('로그인: 비활성 회원은 안 됨, 같은 IP 1분 10번까지', async () => {
  const { hub, store, member } = await setup();
  await store.update(member.id, { active: false });
  assert.equal((await hub.handleAuth({ method: 'POST', ip: 'b', body: { name: '이회원', phone: '01033334444' } })).status, 401);
  for (let i = 0; i < 9; i++) await hub.handleAuth({ method: 'POST', ip: 'b', body: { name: 'x', phone: '01000000000' } });
  assert.equal((await hub.handleAuth({ method: 'POST', ip: 'b', body: { name: 'x', phone: '01000000000' } })).status, 429);
});

test('내 정보 · 기록 계정 저장 (로그인 필요, 64KB까지)', async () => {
  const { hub, login, auth } = await setup();
  assert.equal((await hub.handleMe({ method: 'GET' })).status, 401);
  const token = await login('이회원', '01033334444');
  let out = await hub.handleMe({ method: 'GET', headers: auth(token) });
  assert.equal(out.body.member.name, '이회원');
  assert.equal(out.body.save, null);
  const save = { 'netball.pass': '{"first":3}' };
  assert.equal((await hub.handleMe({ method: 'PUT', headers: auth(token), body: { save } })).status, 200);
  out = await hub.handleMe({ method: 'GET', headers: auth(token) });
  assert.deepEqual(out.body.save.data, save);
  const big = { x: 'y'.repeat(MAX_SAVE_BYTES) };
  assert.equal((await hub.handleMe({ method: 'PUT', headers: auth(token), body: { save: big } })).status, 413);
  assert.equal((await hub.handleMe({ method: 'PUT', headers: auth(token), body: { save: [1] } })).status, 400);
});

test('운영진: 회원은 못 들어오고, 운영진도 운영진 코드가 맞아야', async () => {
  const { hub, login, auth } = await setup();
  const m = await login('이회원', '01033334444');
  const a = await login('김운영', '01011112222');
  assert.equal((await hub.handleAdmin({ method: 'GET', headers: auth(m, 'netter') })).body.error, 'not_admin');
  assert.equal((await hub.handleAdmin({ method: 'GET', headers: auth(a, 'wrong') })).body.error, 'bad_admin_code');
  const out = await hub.handleAdmin({ method: 'GET', headers: auth(a, 'netter') });
  assert.equal(out.status, 200);
  assert.equal(out.body.members.length, 2);
  assert.ok(out.body.members[0].phone, '운영진 화면에서는 연락처가 보인다');
});

test('운영진: 회원 추가 · 수정, 전화번호 중복 막기, 자기 자신은 내리지 못함', async () => {
  const { hub, login, auth, admin } = await setup();
  const a = auth(await login('김운영', '01011112222'), 'netter');
  const add = await hub.handleAdmin({ method: 'POST', headers: a, body: { name: '박새내기', phone: '010-5555-6666' } });
  assert.equal(add.status, 201);
  assert.equal(add.body.member.role, 'member');
  assert.equal((await hub.handleAdmin({ method: 'POST', headers: a, body: { name: '중복', phone: '01055556666' } })).status, 409);
  const up = await hub.handleAdmin({ method: 'PATCH', headers: a, body: { id: add.body.member.id, role: 'admin' } });
  assert.equal(up.body.member.role, 'admin');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: a, body: { id: admin.id, role: 'member' } })).body.error, 'cannot_demote_self');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: a, body: { id: 999, name: '없음' } })).status, 404);
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: a, body: { id: admin.id, role: 'boss' } })).status, 400);
});

test('운영진 비활성화하면 그 토큰으로는 더 못 쓴다', async () => {
  const { hub, store, login, auth, member } = await setup();
  const token = await login('이회원', '01033334444');
  await store.update(member.id, { active: false });
  assert.equal((await hub.handleMe({ method: 'GET', headers: auth(token) })).status, 401);
});

test('배포에서 비밀값이 없으면 503 (로컬은 개발용 값으로 동작)', async () => {
  const store = memoryMemberStore();
  const prod = createHubHandlers({ store, env: { VERCEL: '1' } });
  assert.equal((await prod.handleAuth({ method: 'POST', body: { name: 'a', phone: '01011112222' } })).status, 503);
  const local = createHubHandlers({ store, env: {} });
  await store.insert({ name: 'a', phone: '01011112222', role: 'admin' });
  assert.equal((await local.handleAuth({ method: 'POST', body: { name: 'a', phone: '01011112222' } })).status, 200);
});

test('Supabase 저장소: 전화번호로 찾고 이름은 공백 무시로 맞춰 본다, 중복은 duplicate_phone', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', prefer: init.headers?.Prefer });
    if (init.method === 'POST' && url.includes('members')) return { ok: false, status: 409, text: async () => 'duplicate key value' };
    return { ok: true, json: async () => [{ id: 1, name: '이 회원', phone: '01033334444', role: 'member', active: true }], text: async () => '' };
  };
  const s = supabaseMemberStore({ url: 'https://x.supabase.co', key: 'k', fetchImpl });
  assert.equal((await s.findByLogin(nameKey('이회원'), '01033334444')).id, 1);
  assert.match(decodeURIComponent(calls[0].url), /phone=eq\.01033334444/);
  await assert.rejects(s.insert({ name: 'a', phone: '01033334444', role: 'member' }), { code: 'duplicate_phone' });
  await s.putSave(1, { a: 1 });
  assert.match(calls.at(-1).url, /play_saves\?on_conflict=member_id/);
  assert.match(calls.at(-1).prefer, /merge-duplicates/);
});

test('로컬 파일 저장소: 한 요청이 실패(전화번호 중복)해도 다음 요청은 정상', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const { fileMemberStore } = await import('../lib/member-store.js');
  const file = path.join(os.tmpdir(), `members-${process.pid}-${Date.now()}.json`);
  const s = fileMemberStore(file);
  await s.insert({ name: '가', phone: '01011112222', role: 'admin' });
  await assert.rejects(s.insert({ name: '나', phone: '01011112222', role: 'member' }), { code: 'duplicate_phone' });
  assert.equal((await s.findByLogin('가', '01011112222')).name, '가');
  assert.equal((await s.insert({ name: '다', phone: '01033334444', role: 'member' })).id, 2);
});
