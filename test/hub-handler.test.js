import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHubHandlers, normalizeName, DEFAULT_CHEER } from '../lib/hub-handler.js';
import { memoryBragStore, supabaseBragStore, nameKey } from '../lib/brag-store.js';
import { memoryReportStore } from '../lib/report-store.js';

const ENV = { ADMIN_CODE: 'netter', VERCEL: '1' };
function setup() {
  const bragStore = memoryBragStore();
  const reportStore = memoryReportStore();
  const hub = createHubHandlers({ bragStore, reportStore, env: ENV, now: () => 1e12 });
  const brag = (body, ip = 'x') => hub.handleBrag({ method: 'POST', ip, body });
  const admin = (method, body, code = 'netter', ip = 'a') => hub.handleAdmin({ method, body, ip, headers: { 'x-admin-code': code } });
  return { bragStore, reportStore, hub, brag, admin };
}

test('이름 정리: 앞뒤 · 겹친 공백, 1~20자', () => {
  assert.equal(normalizeName('  이  회원 '), '이 회원');
  assert.equal(normalizeName(''), null);
  assert.equal(normalizeName('가'.repeat(21)), null);
  assert.equal(nameKey('이 회원'), nameKey('이회원'));
});

test('자랑하기: 이름만 적으면 되고, 같은 이름(공백 무시) · 같은 종류는 한 번', async () => {
  const { brag } = setup();
  assert.equal((await brag({ name: '', kind: 'pass-stars' })).body.error, 'bad_name');
  assert.equal((await brag({ name: '이회원', kind: 'everything' })).body.error, 'bad_brag');
  assert.deepEqual((await brag({ name: '이회원', kind: 'pass-stars' })).body, { ok: true, id: 1, already: false });
  assert.deepEqual((await brag({ name: '이 회원', kind: 'pass-stars' })).body, { ok: true, id: 1, already: true });
  assert.equal((await brag({ name: '이회원', kind: 'rhythm-badges' })).body.id, 2);
});

test('자랑하기: 같은 IP는 1시간에 10번까지', async () => {
  const { brag } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await brag({ name: `사람${i}`, kind: 'pass-stars' }, 'spam')).status, 200);
  assert.equal((await brag({ name: '또', kind: 'pass-stars' }, 'spam')).status, 429);
  assert.equal((await brag({ name: '다른곳', kind: 'pass-stars' }, 'other')).status, 200);
});

test('운영진: 운영진 코드 하나로 연다 (로그인 없음), 틀린 코드는 1분 10번까지', async () => {
  const { admin, hub } = setup();
  assert.equal((await admin('GET', undefined, 'wrong')).body.error, 'bad_admin_code');
  assert.equal((await hub.handleAdmin({ method: 'GET', headers: {} })).status, 403);
  const ok = await admin('GET');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { brags: [], reports: [] });
  for (let i = 0; i < 10; i++) await admin('GET', undefined, 'nope', 'brute');
  assert.equal((await admin('GET', undefined, 'netter', 'brute')).status, 429, '틀린 시도가 많으면 맞는 코드도 잠깐 막힌다');
});

test('운영진 코드가 배포 환경에 없으면 503 (로컬은 dev)', async () => {
  const prod = createHubHandlers({ bragStore: memoryBragStore(), reportStore: null, env: { VERCEL: '1' } });
  assert.equal((await prod.handleAdmin({ method: 'GET', headers: { 'x-admin-code': 'dev' } })).status, 503);
  const local = createHubHandlers({ bragStore: memoryBragStore(), reportStore: null, env: {} });
  assert.equal((await local.handleAdmin({ method: 'GET', headers: { 'x-admin-code': 'dev' } })).status, 200);
});

test('자랑 → 운영진 목록 · 봤음 표시 · 축하 보내기 → 그 기기에서 축하 확인', async () => {
  const { brag, admin, hub } = setup();
  const { id } = (await brag({ name: '이회원', kind: 'pass-stars' })).body;
  await brag({ name: '박회원', kind: 'snake-badges' });
  let list = (await admin('GET')).body.brags;
  assert.deepEqual(list.map((b) => [b.name, b.kind, b.seen]), [['박회원', 'snake-badges', false], ['이회원', 'pass-stars', false]]);
  assert.equal((await admin('PATCH', { bragsSeen: true })).status, 200);
  list = (await admin('GET')).body.brags;
  assert.ok(list.every((b) => b.seen));
  // 아직 축하 전에는 비어 있다
  assert.deepEqual((await hub.handleBrag({ method: 'GET', query: { ids: String(id) } })).body.cheers, []);
  const out = await admin('PATCH', { brag: id, cheer: '' });
  assert.equal(out.body.brag.cheer, DEFAULT_CHEER);
  const cheers = (await hub.handleBrag({ method: 'GET', query: { ids: `${id},2,abc` } })).body.cheers;
  assert.deepEqual(cheers.map((c) => [c.id, c.kind, c.cheer]), [[id, 'pass-stars', DEFAULT_CHEER]]);
  assert.equal((await admin('PATCH', { brag: 999 })).status, 404);
});

test('운영진: 받은 메시지 처리 완료 · 되돌리기 (메모 200자)', async () => {
  const { admin, reportStore } = setup();
  await reportStore.insert({ kind: 'bug', message: '공이 안 보여요', meta: null });
  const done = await admin('PATCH', { report: 1, status: 'done', note: '  고침  ' });
  assert.equal(done.body.report.status, 'done');
  assert.equal(done.body.report.note, '고침');
  assert.ok(done.body.report.done_at);
  const back = await admin('PATCH', { report: 1, status: 'new' });
  assert.equal(back.body.report.done_at, null);
  assert.equal((await admin('PATCH', { report: 1, status: 'weird' })).status, 400);
  assert.equal((await admin('PATCH', { report: 9, status: 'done' })).status, 404);
});

test('자랑 테이블이 아직 없어도(SQL 실행 전) 운영진 화면은 열린다', async () => {
  const { bragStore, admin } = setup();
  bragStore.list = async () => {
    throw new Error('supabase 404: relation "brags" does not exist');
  };
  const out = await admin('GET');
  assert.equal(out.status, 200);
  assert.equal(out.body.brags, null);
});

test('Supabase 저장소: 같은 이름(공백 무시)이 있으면 새로 넣지 않고, 축하는 id 목록으로 찾는다', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: decodeURIComponent(url), method: init.method ?? 'GET', body: init.body });
    if ((init.method ?? 'GET') === 'GET' && url.includes('kind=eq')) return { ok: true, json: async () => [{ id: 4, name: '이 회원' }] };
    return { ok: true, json: async () => [{ id: 9 }] };
  };
  const s = supabaseBragStore({ url: 'https://x.supabase.co/', key: 'k', fetchImpl });
  assert.deepEqual(await s.add({ name: '이회원', kind: 'pass-stars' }), { id: 4, created: false });
  assert.equal(calls.length, 1, '이미 있으면 POST 하지 않는다');
  await s.cheersFor([3, 4]);
  assert.match(calls.at(-1).url, /id=in\.\(3,4\)&cheered_at=not\.is\.null/);
  assert.deepEqual(await s.cheersFor([]), []);
});
