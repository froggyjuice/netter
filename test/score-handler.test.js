import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createScoreHandler, normalizeNickname } from '../lib/score-handler.js';
import { memoryStore, supabaseStore, createStore } from '../lib/stores.js';

const good = (over = {}) => ({ game: 'snake', nickname: '은서', score: 120, durationMs: 30000, meta: { balls: 10, offsides: 1, position: 'GS' }, ...over });

function setup() {
  let t = 1_000_000;
  const store = memoryStore();
  const handle = createScoreHandler({ store, now: () => t });
  return { store, handle, advance: (ms) => (t += ms) };
}

test('닉네임 정규화/검증', () => {
  assert.equal(normalizeNickname('  은서  '), '은서');
  assert.equal(normalizeNickname('a  b'), 'a b');
  assert.equal(normalizeNickname('Nick_1-2.'), 'Nick_1-2.');
  assert.equal(normalizeNickname(''), null);
  assert.equal(normalizeNickname('   '), null);
  assert.equal(normalizeNickname('열두글자를넘기는아주긴닉네임'), null);
  assert.equal(normalizeNickname('<script>'), null);
  assert.equal(normalizeNickname('a'.repeat(12)), 'a'.repeat(12));
  assert.equal(normalizeNickname(123), null);
});

test('POST 정상 등록 → 201과 순위, GET은 점수 내림차순', async () => {
  const { handle, advance } = setup();
  let r = await handle({ method: 'POST', body: good({ nickname: 'A', score: 100 }), ip: '1.1.1.1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.rank, 1);
  advance(5000);
  r = await handle({ method: 'POST', body: good({ nickname: 'B', score: 200 }), ip: '2.2.2.2' });
  assert.equal(r.body.rank, 1);
  advance(5000);
  r = await handle({ method: 'POST', body: good({ nickname: 'C', score: 150 }), ip: '3.3.3.3' });
  assert.equal(r.body.rank, 2);

  const list = await handle({ method: 'GET', query: { game: 'snake', limit: '2' } });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.scores.map((s) => s.nickname), ['B', 'C']);
  assert.deepEqual(Object.keys(list.body.scores[0]).sort(), ['created_at', 'nickname', 'score']); // 내부 필드 비노출
});

test('잘못된 요청은 거절된다', async () => {
  const { handle } = setup();
  const post = (body) => handle({ method: 'POST', body, ip: '9.9.9.9' });
  assert.equal((await post(null)).body.error, 'bad_body');
  assert.equal((await post(good({ game: 'nope' }))).body.error, 'unknown_game');
  assert.equal((await post(good({ nickname: '' }))).body.error, 'bad_nickname');
  assert.equal((await post(good({ score: -10 }))).body.error, 'bad_score');
  assert.equal((await post(good({ score: 15 }))).body.error, 'bad_score'); // 10의 배수 아님
  assert.equal((await post(good({ score: 99999 }))).body.error, 'bad_score');
  assert.equal((await post(good({ score: 12.5 }))).body.error, 'bad_score');
  assert.equal((await post(good({ durationMs: -1 }))).body.error, 'bad_duration');
  assert.equal((await post(good({ durationMs: 'x' }))).body.error, 'bad_duration');
  assert.equal((await handle({ method: 'GET', query: {} })).body.error, 'unknown_game');
  assert.equal((await handle({ method: 'DELETE' })).status, 405);
});

test('플레이 시간에 비해 비현실적으로 높은 점수는 거절 (422)', async () => {
  const { handle } = setup();
  const r = await handle({ method: 'POST', body: good({ score: 3000, durationMs: 5000 }), ip: '4.4.4.4' });
  assert.equal(r.status, 422);
  const r2 = await handle({ method: 'POST', body: good({ score: 10, durationMs: 200 }), ip: '5.5.5.5' });
  assert.equal(r2.status, 422); // 1초 미만 플레이
});

test('같은 IP는 3초 안에 연속 등록할 수 없다', async () => {
  const { handle, advance } = setup();
  assert.equal((await handle({ method: 'POST', body: good(), ip: '7.7.7.7' })).status, 201);
  advance(1000);
  const r = await handle({ method: 'POST', body: good(), ip: '7.7.7.7' });
  assert.equal(r.status, 429);
  assert.ok(r.body.retryAfterMs > 0);
  assert.equal((await handle({ method: 'POST', body: good(), ip: '8.8.8.8' })).status, 201); // 다른 IP는 가능
  advance(3000);
  assert.equal((await handle({ method: 'POST', body: good(), ip: '7.7.7.7' })).status, 201);
});

test('저장소가 없으면 503, 저장소 오류는 500 (내부 메시지 비노출)', async () => {
  const none = createScoreHandler({ store: null });
  assert.equal((await none({ method: 'GET', query: { game: 'snake' } })).status, 503);

  const broken = createScoreHandler({
    store: { list: async () => { throw new Error('secret db detail'); } },
  });
  const r = await broken({ method: 'GET', query: { game: 'snake' } });
  assert.equal(r.status, 500);
  assert.equal(JSON.stringify(r.body).includes('secret'), false);
});

test('createStore: 환경에 맞는 저장소 선택', () => {
  assert.equal(createStore({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' }).kind, 'supabase');
  assert.equal(createStore({}).kind, 'file');
  assert.equal(createStore({ VERCEL: '1' }), null);
  assert.equal(createStore({ VERCEL: '1', SUPABASE_URL: 'https://x.supabase.co' }), null); // 키가 빠지면 사용 불가
});

// Supabase(PostgREST) 요청 형식을 모의 서버로 확인한다. 실제 Supabase 연결 검증은 아님.
test('supabaseStore: PostgREST 요청 형식', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') return res.writeHead(201).end();
      if (req.url.includes('select=id')) {
        res.setHeader('Content-Range', '0-0/7');
        return res.writeHead(200).end('[{"id":1}]');
      }
      res.writeHead(200).end('[{"nickname":"A","score":50,"created_at":"2026-10-14T00:00:00Z"}]');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`; // 끝 슬래시 포함해도 동작해야 함
  try {
    const store = supabaseStore({ url, key: 'SERVICE_KEY' });
    await store.insert({ game: 'snake', nickname: 'A', score: 50, meta: { balls: 5 } });
    const rows = await store.list('snake', 10);
    const higher = await store.countHigher('snake', 40);

    const [ins, list, count] = seen;
    assert.equal(ins.method, 'POST');
    assert.equal(ins.url, '/rest/v1/scores');
    assert.equal(ins.headers.apikey, 'SERVICE_KEY');
    assert.equal(ins.headers.authorization, 'Bearer SERVICE_KEY');
    assert.equal(ins.headers.prefer, 'return=minimal');
    assert.deepEqual(JSON.parse(ins.body), { game: 'snake', nickname: 'A', score: 50, meta: { balls: 5 } });

    const q = new URL(list.url, 'http://x').searchParams;
    assert.equal(q.get('game'), 'eq.snake');
    assert.equal(q.get('order'), 'score.desc,created_at.asc');
    assert.equal(q.get('limit'), '10');
    assert.equal(rows[0].nickname, 'A');

    const cq = new URL(count.url, 'http://x').searchParams;
    assert.equal(cq.get('score'), 'gt.40');
    assert.equal(count.headers.prefer, 'count=exact');
    assert.equal(higher, 7);
  } finally {
    server.close();
  }
});

test('meta는 허용된 필드만 저장한다 (수비 모드의 실점·모드 포함)', async () => {
  const inserted = [];
  const store = { ...memoryStore(), insert: async (row) => inserted.push(row) };
  const handle = createScoreHandler({ store, now: () => 1_000_000 });
  const meta = { balls: 4, offsides: 0, conceded: 2, passes: 3, position: 'GK', mode: 'defence', evil: 'x' };
  const r = await handle({ method: 'POST', body: good({ meta }), ip: '4.4.4.4' });
  assert.equal(r.status, 201);
  assert.deepEqual(inserted[0].meta, { balls: 4, offsides: 0, conceded: 2, passes: 3, position: 'GK', mode: 'defence' });
});

test('리듬 슈팅: 플레이당 최대 50점 · 기록과 난이도는 meta 로 남는다', async () => {
  const rows = [];
  const store = {
    list: async () => [],
    insert: async (r) => rows.push(r),
    countHigher: async () => 0,
  };
  const handle = createScoreHandler({ store, now: () => 1e12 });
  const ok = await handle({
    method: 'POST', ip: 'r1',
    body: { game: 'rhythm', nickname: '네터', score: 1520, durationMs: 120_000, meta: { goals: 38, shots: 40, difficulty: 'hard', bogus: 'x', position: 'GS' } },
  });
  assert.equal(ok.status, 201);
  assert.deepEqual(rows[0].meta, { goals: 38, shots: 40, position: 'GS', difficulty: 'hard' });
  const tooMuch = await handle({ method: 'POST', ip: 'r2', body: { game: 'rhythm', nickname: '네터', score: 600, durationMs: 10_000 } });
  assert.equal(tooMuch.status, 422);
});
