import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLikeHandler, hashVoter, LIKE_GAMES } from '../lib/like-handler.js';
import { memoryLikeStore, supabaseLikeStore } from '../lib/like-store.js';

const TOKEN = 'abcdefghijklmnop1234';
const setup = () => {
  const store = memoryLikeStore();
  let t = 1e12;
  const handle = createLikeHandler({ store, now: () => (t += 5000) });
  return { store, handle };
};

test('GET: 개발 중인 게임마다 좋아요 수 (처음엔 0)', async () => {
  const { handle } = setup();
  const out = await handle({ method: 'GET' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.counts, Object.fromEntries(LIKE_GAMES.map((g) => [g, 0])));
});

test('좋아요 · 취소: 한 기기는 게임마다 한 번만 센다', async () => {
  const { handle, store } = setup();
  let out = await handle({ method: 'POST', ip: 'a', body: { game: 'whistle', token: TOKEN, like: true } });
  assert.equal(out.body.counts.whistle, 1);
  out = await handle({ method: 'POST', ip: 'a', body: { game: 'whistle', token: TOKEN, like: true } });
  assert.equal(out.body.counts.whistle, 1, '두 번 눌러도 1');
  out = await handle({ method: 'POST', ip: 'b', body: { game: 'whistle', token: 'zzzzzzzzzzzzzzzz9999', like: true } });
  assert.equal(out.body.counts.whistle, 2);
  out = await handle({ method: 'POST', ip: 'a', body: { game: 'whistle', token: TOKEN, like: false } });
  assert.equal(out.body.counts.whistle, 1, '취소');
  assert.ok(store.rows.every((r) => r.voter_hash !== TOKEN), '토큰 원문은 저장하지 않는다');
  assert.equal(store.rows[0].voter_hash, hashVoter('zzzzzzzzzzzzzzzz9999'));
});

test('잘못된 요청: 없는 게임 · 짧은 토큰 · like 누락', async () => {
  const { handle } = setup();
  assert.equal((await handle({ method: 'POST', body: { game: 'snake', token: TOKEN, like: true } })).body.error, 'unknown_game');
  assert.equal((await handle({ method: 'POST', body: { game: 'steps', token: 'short', like: true } })).body.error, 'bad_token');
  assert.equal((await handle({ method: 'POST', body: { game: 'steps', token: TOKEN } })).body.error, 'bad_body');
  assert.equal((await handle({ method: 'DELETE' })).status, 405);
});

test('같은 IP가 너무 빨리 누르면 429', async () => {
  const store = memoryLikeStore();
  const handle = createLikeHandler({ store, now: () => 1e12 });
  await handle({ method: 'POST', ip: 'x', body: { game: 'steps', token: TOKEN, like: true } });
  const out = await handle({ method: 'POST', ip: 'x', body: { game: 'steps', token: TOKEN, like: false } });
  assert.equal(out.status, 429);
});

test('저장소가 없으면 503', async () => {
  const handle = createLikeHandler({ store: null });
  assert.equal((await handle({ method: 'GET' })).status, 503);
});

test('Supabase 저장소: 중복은 무시하고(on_conflict), 취소는 DELETE', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', prefer: init.headers?.Prefer, body: init.body });
    return { ok: true, json: async () => [{ game: 'whistle' }, { game: 'whistle' }, { game: 'steps' }], text: async () => '' };
  };
  const s = supabaseLikeStore({ url: 'https://x.supabase.co/', key: 'k', fetchImpl });
  assert.deepEqual(await s.counts(['whistle', 'throwin', 'steps']), { whistle: 2, throwin: 0, steps: 1 });
  await s.add('whistle', 'h');
  await s.remove('whistle', 'h');
  assert.ok(calls[1].url.endsWith('/rest/v1/likes?on_conflict=game,voter_hash'));
  assert.match(calls[1].prefer, /ignore-duplicates/);
  assert.equal(calls[2].method, 'DELETE');
  assert.match(calls[2].url, /voter_hash=eq\.h/);
});
