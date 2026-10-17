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

test('운영진: 엑셀 일괄 등록 — 문제 있는 줄만 따로, 중복 번호는 건너뜀, 200명까지', async () => {
  const { hub, login, auth, store } = await setup();
  const a = auth(await login('김운영', '01011112222'), 'netter');
  const out = await hub.handleAdmin({
    method: 'POST', headers: a,
    body: { members: [
      { name: '새회원', phone: '010-5555-6666' },
      { name: '새운영', phone: '01077778888', role: 'admin' },
      { name: '기존번호', phone: '01033334444' },
      { name: '', phone: '01099990000' },
    ] },
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.results.map((r) => r.ok || r.error), [true, true, 'duplicate_phone', 'bad_member']);
  assert.equal((await store.list()).length, 4);
  assert.equal(out.body.results[1].member.role, 'admin');
  const many = Array.from({ length: 201 }, (_, i) => ({ name: 'x', phone: '0101000' + String(1000 + i) }));
  assert.equal((await hub.handleAdmin({ method: 'POST', headers: a, body: { members: many } })).body.error, 'too_many');
  const m = auth(await login('이회원', '01033334444'), 'netter');
  assert.equal((await hub.handleAdmin({ method: 'POST', headers: m, body: { members: [] } })).status, 403, '회원은 못 함');
});

test('회장에게 자랑하기: 로그인 회원만, 종류마다 한 번 → 운영진 화면 목록 · 홈 알림 수 · 봤음 표시', async () => {
  const { hub, login, auth } = await setup();
  const m = await login('이회원', '01033334444');
  const a = await login('김운영', '01011112222');
  assert.equal((await hub.handleMe({ method: 'POST', headers: {}, body: { brag: 'pass-stars' } })).status, 401);
  assert.equal((await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'everything' } })).body.error, 'bad_brag');
  assert.deepEqual((await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'pass-stars' } })).body, { ok: true, already: false });
  assert.deepEqual((await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'pass-stars' } })).body, { ok: true, already: true });
  await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'rhythm-badges' } });
  // 회원의 내 정보에는 알림 수가 없고, 운영진에게만
  assert.equal((await hub.handleMe({ method: 'GET', headers: auth(m) })).body.new_brags, undefined);
  assert.equal((await hub.handleMe({ method: 'GET', headers: auth(a) })).body.new_brags, 2);
  const list = (await hub.handleAdmin({ method: 'GET', headers: auth(a, 'netter') })).body.brags;
  assert.deepEqual(list.map((b) => [b.name, b.kind, b.seen]), [['이회원', 'rhythm-badges', false], ['이회원', 'pass-stars', false]]);
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: auth(a, 'netter'), body: { bragsSeen: true } })).status, 200);
  assert.equal((await hub.handleMe({ method: 'GET', headers: auth(a) })).body.new_brags, 0);
});

test('자랑 테이블이 아직 없어도(SQL 실행 전) 로그인 · 운영진 화면은 동작', async () => {
  const { store, hub, login, auth } = await setup();
  const boom = async () => {
    throw new Error('supabase 404: relation "brags" does not exist');
  };
  Object.assign(store, { countNewBrags: boom, listBrags: boom });
  const a = await login('김운영', '01011112222');
  const me = await hub.handleMe({ method: 'GET', headers: auth(a) });
  assert.equal(me.status, 200);
  assert.equal(me.body.new_brags, 0);
  const adm = await hub.handleAdmin({ method: 'GET', headers: auth(a, 'netter') });
  assert.equal(adm.status, 200);
  assert.equal(adm.body.brags, null);
});

test('가입 승인 요청: 등록 안 된 사람 → 운영진이 승인하면 바로 로그인, 거절 · 중복 · 이미 회원', async () => {
  const store = memoryMemberStore();
  const hub = createHubHandlers({ store, reportStore: null, env: ENV, now: () => 1e12 });
  await store.insert({ name: '김운영', phone: '01011112222', role: 'admin' });
  const auth = async (body, ip = 'x') => hub.handleAuth({ method: 'POST', ip, body });
  assert.equal((await auth({ name: '새회원', phone: '010-5555-6666' })).body.error, 'not_member');
  assert.deepEqual((await auth({ name: '새회원', phone: '010-5555-6666', join: true, message: '수요일 반이에요' })).body, { ok: true, already: false });
  assert.deepEqual((await auth({ name: '새 회원', phone: '01055556666', join: true })).body, { ok: true, already: true }, '같은 번호는 새 요청으로 덮기');
  assert.equal((await auth({ name: '김운영', phone: '01011112222', join: true })).body.error, 'already_member');
  await auth({ name: '거절할', phone: '01077778888', join: true });

  const a = (await auth({ name: '김운영', phone: '01011112222' })).body.token;
  const h = { authorization: `Bearer ${a}`, 'x-admin-code': 'netter' };
  assert.equal((await hub.handleMe({ method: 'GET', headers: h })).body.new_joins, 2);
  const joins = (await hub.handleAdmin({ method: 'GET', headers: h })).body.joins;
  assert.deepEqual(joins.map((j) => [j.name, j.status]), [['거절할', 'pending'], ['새 회원', 'pending']]);
  const ok = await hub.handleAdmin({ method: 'PATCH', headers: h, body: { join: joins[1].id, action: 'approve' } });
  assert.equal(ok.body.member.phone, '01055556666');
  assert.equal(ok.body.join.status, 'approved');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: h, body: { join: joins[1].id, action: 'approve' } })).body.error, 'join_done');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: h, body: { join: joins[0].id, action: 'reject' } })).body.join.status, 'rejected');
  assert.ok((await auth({ name: '새회원', phone: '01055556666' })).body.token, '승인되면 바로 로그인');
  assert.equal((await hub.handleMe({ method: 'GET', headers: h })).body.new_joins, 0);
});

test('가입 요청은 같은 IP 1시간에 5번까지', async () => {
  const hub = createHubHandlers({ store: memoryMemberStore(), reportStore: null, env: ENV, now: () => 1e12 });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await hub.handleAuth({ method: 'POST', ip: 'y', body: { name: `요청${i}`, phone: `0109999000${i}`, join: true } })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

test('받은 메시지: 운영진 화면 목록 · 처리 완료 + 메모 · 새 메시지 수', async () => {
  const { memoryReportStore } = await import('../lib/report-store.js');
  const reports = memoryReportStore();
  await reports.insert({ kind: 'bug', message: '버튼이 안 눌려요', meta: { page: 'rules' } });
  await reports.insert({ kind: 'idea', message: '다크 모드 주세요' });
  const store = memoryMemberStore();
  const hub = createHubHandlers({ store, reportStore: reports, env: ENV, now: () => 1e12 });
  await store.insert({ name: '김운영', phone: '01011112222', role: 'admin' });
  const a = (await hub.handleAuth({ method: 'POST', ip: 'x', body: { name: '김운영', phone: '01011112222' } })).body.token;
  const h = { authorization: `Bearer ${a}`, 'x-admin-code': 'netter' };
  const list = (await hub.handleAdmin({ method: 'GET', headers: h })).body.reports;
  assert.deepEqual(list.map((r) => [r.id, r.kind, r.status]), [[2, 'idea', 'new'], [1, 'bug', 'new']]);
  assert.equal((await hub.handleMe({ method: 'GET', headers: h })).body.new_reports, 2);
  const done = await hub.handleAdmin({ method: 'PATCH', headers: h, body: { report: 1, status: 'done', note: '고쳤어요' } });
  assert.equal(done.body.report.status, 'done');
  assert.equal(done.body.report.note, '고쳤어요');
  assert.ok(done.body.report.done_at);
  assert.equal((await hub.handleMe({ method: 'GET', headers: h })).body.new_reports, 1);
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: h, body: { report: 1, status: 'weird' } })).body.error, 'bad_report');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: h, body: { report: 99, status: 'done' } })).status, 404);
});

test('축하 보내기: 운영진이 자랑에 축하 → 그 회원의 내 정보에 보이고, 보면 사라짐', async () => {
  const { hub, login, auth } = await setup();
  const m = await login('이회원', '01033334444');
  const a = await login('김운영', '01011112222');
  await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'pass-stars' } });
  const [b] = (await hub.handleAdmin({ method: 'GET', headers: auth(a, 'netter') })).body.brags;
  assert.deepEqual((await hub.handleMe({ method: 'GET', headers: auth(m) })).body.cheers, []);
  const out = await hub.handleAdmin({ method: 'PATCH', headers: auth(a, 'netter'), body: { brag: b.id, cheer: '최고예요!' } });
  assert.equal(out.body.brag.cheer, '최고예요!');
  const cheers = (await hub.handleMe({ method: 'GET', headers: auth(m) })).body.cheers;
  assert.deepEqual(cheers.map((c) => [c.kind, c.cheer]), [['pass-stars', '최고예요!']]);
  assert.equal((await hub.handleMe({ method: 'POST', headers: auth(m), body: { cheersSeen: true } })).status, 200);
  assert.deepEqual((await hub.handleMe({ method: 'GET', headers: auth(m) })).body.cheers, []);
  // 한마디를 비우면 기본 문구
  await hub.handleMe({ method: 'POST', headers: auth(m), body: { brag: 'rhythm-badges' } });
  const b2 = (await hub.handleAdmin({ method: 'GET', headers: auth(a, 'netter') })).body.brags.find((x) => x.kind === 'rhythm-badges');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: auth(a, 'netter'), body: { brag: b2.id, cheer: '  ' } })).body.brag.cheer, '정말 대단해요! 축하해요 🎉');
  assert.equal((await hub.handleAdmin({ method: 'PATCH', headers: auth(a, 'netter'), body: { brag: 999 } })).status, 404);
});
