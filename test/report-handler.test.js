import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReportHandler, cleanContext, MAX_MESSAGE } from '../lib/report-handler.js';
import { memoryReportStore } from '../lib/report-store.js';

function setup() {
  let t = 1_000_000;
  const store = memoryReportStore();
  const handle = createReportHandler({ store, now: () => t });
  return { store, handle, advance: (ms) => (t += ms) };
}

test('신고 정상 등록: 종류·내용·정리된 상황 정보만 저장', async () => {
  const { store, handle } = setup();
  const r = await handle({
    method: 'POST',
    ip: '1.1.1.1',
    body: {
      kind: 'idea',
      message: '  공이 더 빨리 나왔으면 좋겠어요  ',
      context: { page: 'snake', position: 'GS', mode: 'attack', viewport: '375x812', evil: 'x', email: 'a@b.c' },
    },
  });
  assert.equal(r.status, 201);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].message, '공이 더 빨리 나왔으면 좋겠어요');
  assert.deepEqual(store.rows[0].meta, { page: 'snake', position: 'GS', mode: 'attack', viewport: '375x812' });
});

test('잘못된 신고는 거절된다', async () => {
  const { handle } = setup();
  const post = (body) => handle({ method: 'POST', body, ip: '2.2.2.2' });
  assert.equal((await handle({ method: 'GET' })).status, 405);
  assert.equal((await post(null)).body.error, 'bad_body');
  assert.equal((await post('not json')).body.error, 'bad_body');
  assert.equal((await post({ kind: 'spam', message: '안녕하세요' })).body.error, 'bad_kind');
  assert.equal((await post({ kind: 'bug', message: ' ' })).body.error, 'bad_message');
  assert.equal((await post({ kind: 'bug', message: 'a'.repeat(MAX_MESSAGE + 1) })).body.error, 'bad_message');
});

test('같은 IP는 10초 안에 다시 신고할 수 없다', async () => {
  const { handle, advance } = setup();
  const post = () => handle({ method: 'POST', ip: '3.3.3.3', body: { kind: 'bug', message: '화면이 멈춰요' } });
  assert.equal((await post()).status, 201);
  advance(5000);
  assert.equal((await post()).status, 429);
  advance(6000);
  assert.equal((await post()).status, 201);
});

test('저장소가 없으면 503 (배포에 환경변수 누락)', async () => {
  const handle = createReportHandler({ store: null });
  assert.equal((await handle({ method: 'POST', body: { kind: 'bug', message: '테스트' } })).status, 503);
});

test('cleanContext: 이상한 값은 버리고 기기 정보는 짧게 자른다', () => {
  assert.equal(cleanContext(null), null);
  assert.deepEqual(cleanContext({ position: 'XYZ', viewport: '9x9', orientation: 'sideways' }), null);
  assert.equal(cleanContext({ ua: 'u'.repeat(500) }).ua.length, 200);
});
