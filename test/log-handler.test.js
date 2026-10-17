import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogHandler, cleanLog, cleanLogContext, KEEP_DAYS } from '../lib/log-handler.js';
import { memoryLogStore, supabaseLogStore } from '../lib/log-store.js';

const DAY = 24 * 60 * 60 * 1000;
const err = (over = {}) => ({
  kind: 'error', message: "TypeError: Cannot read properties of undefined (reading 'x')",
  source: 'https://netter-tan.vercel.app/assets/index-abc.js?v=1#x', line: 12, col: 34,
  stack: 'TypeError: …\n    at f (index-abc.js:12:34)',
  context: { page: 'snake', playing: true, orientation: 'portrait', viewport: '375x812', ua: 'Mozilla/5.0', version: 'a1b2c3d', nickname: '몰래' },
  ...over,
});

test('저장: 정해진 칸만, 주소의 쿼리·해시는 빼고, 닉네임 같은 다른 값은 버린다', async () => {
  const store = memoryLogStore();
  const handle = createLogHandler({ store, now: () => 1e12 });
  const out = await handle({ method: 'POST', ip: 'a', body: err() });
  assert.equal(out.status, 201);
  const row = store.rows[0];
  assert.equal(row.source, 'https://netter-tan.vercel.app/assets/index-abc.js');
  assert.equal(row.line, 12);
  assert.deepEqual(Object.keys(row.meta).sort(), ['orientation', 'page', 'playing', 'ua', 'version', 'viewport']);
  assert.ok(!JSON.stringify(row).includes('몰래'));
});

test('길이 제한: 메시지 300자 · stack 1000자', () => {
  const row = cleanLog(err({ message: 'x'.repeat(500), stack: 'y'.repeat(5000) }));
  assert.equal(row.message.length, 300);
  assert.equal(row.stack.length, 1000);
});

test('잘못된 요청: 종류·메시지 없음 → 400, GET → 405', async () => {
  const handle = createLogHandler({ store: memoryLogStore() });
  assert.equal((await handle({ method: 'POST', body: err({ kind: 'oops' }) })).status, 400);
  assert.equal((await handle({ method: 'POST', body: err({ message: '  ' }) })).status, 400);
  assert.equal((await handle({ method: 'POST', body: '{not json' })).status, 400);
  assert.equal((await handle({ method: 'GET' })).status, 405);
  assert.equal(cleanLogContext({ viewport: '<script>' }), null);
});

test('같은 IP: 한꺼번에 몇 개는 받고, 1분에 10개 · 1시간에 30개까지', async () => {
  let t = 1e12;
  const store = memoryLogStore();
  const handle = createLogHandler({ store, now: () => t });
  assert.equal((await handle({ method: 'POST', ip: 'x', body: err() })).status, 201);
  assert.equal((await handle({ method: 'POST', ip: 'x', body: err() })).status, 201, '바로 이어진 오류도 받는다');
  for (let i = 0; i < 12; i++) await handle({ method: 'POST', ip: 'x', body: err() });
  assert.equal(store.rows.length, 10, '1분에 10개');
  for (let m = 0; m < 5; m++) {
    t += 61 * 1000;
    for (let i = 0; i < 10; i++) await handle({ method: 'POST', ip: 'x', body: err() });
  }
  assert.equal(store.rows.length, 30, '1시간에 30개');
  t += 60 * 60 * 1000;
  assert.equal((await handle({ method: 'POST', ip: 'x', body: err() })).status, 201, '한 시간 뒤 다시');
});

test(`${KEEP_DAYS}일 지난 기록은 새 기록이 들어올 때 지운다`, async () => {
  const t = 1e12;
  const store = memoryLogStore();
  store.rows.push({ kind: 'error', message: 'old', created_at: new Date(t - (KEEP_DAYS + 1) * DAY).toISOString() });
  store.rows.push({ kind: 'error', message: 'recent', created_at: new Date(t - 2 * DAY).toISOString() });
  const handle = createLogHandler({ store, now: () => t });
  await handle({ method: 'POST', ip: 'p', body: err() });
  assert.deepEqual(store.rows.map((r) => r.message).slice(0, 1), ['recent']);
  assert.equal(store.rows.length, 2);
});

test('저장소가 없으면 503', async () => {
  assert.equal((await createLogHandler({ store: null })({ method: 'POST', body: err() })).status, 503);
});

test('Supabase 저장소: client_errors 에 넣고, 오래된 기록은 created_at 으로 DELETE', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body });
    return { ok: true, text: async () => '' };
  };
  const s = supabaseLogStore({ url: 'https://x.supabase.co', key: 'k', fetchImpl });
  await s.insert({ kind: 'error', message: 'm', meta: { page: 'snake' } });
  await s.purgeBefore('2026-01-01T00:00:00.000Z');
  assert.equal(calls[0].url, 'https://x.supabase.co/rest/v1/client_errors');
  assert.equal(JSON.parse(calls[0].body).message, 'm');
  assert.equal(calls[1].method, 'DELETE');
  assert.match(decodeURIComponent(calls[1].url), /created_at=lt\.2026-01-01/);
});
