import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentHandler, normalizeMessage, hashToken, MAX_COMMENT } from '../lib/comment-handler.js';
import { memoryCommentStore } from '../lib/comment-store.js';

function setup() {
  let t = 1_000_000;
  const store = memoryCommentStore();
  const handle = createCommentHandler({ store, now: () => t });
  return { store, handle, advance: (ms) => (t += ms) };
}

test('댓글 작성 → 목록은 최신순, 공개 칸만 (삭제 해시·숨김 여부는 비노출)', async () => {
  const { handle, advance } = setup();
  const a = await handle({ method: 'POST', ip: '1.1.1.1', body: { nickname: '은서', message: '재밌어요!' } });
  assert.equal(a.status, 201);
  assert.equal(typeof a.body.deleteToken, 'string');
  advance(20_000);
  await handle({ method: 'POST', ip: '1.1.1.1', body: { nickname: 'B', message: '두 번째' } });
  const list = await handle({ method: 'GET', query: {} });
  assert.deepEqual(list.body.comments.map((c) => c.message), ['두 번째', '재밌어요!']);
  assert.deepEqual(Object.keys(list.body.comments[0]).sort(), ['created_at', 'id', 'message', 'nickname']);
});

test('더 보기: before 보다 오래된 것만, limit 만큼', async () => {
  const { handle, advance } = setup();
  for (let i = 1; i <= 5; i++) {
    await handle({ method: 'POST', ip: `ip${i}`, body: { nickname: 'A', message: `글 ${i}` } });
    advance(1);
  }
  const page1 = (await handle({ method: 'GET', query: { limit: '2' } })).body.comments;
  assert.deepEqual(page1.map((c) => c.message), ['글 5', '글 4']);
  const page2 = (await handle({ method: 'GET', query: { limit: '2', before: String(page1[1].id) } })).body.comments;
  assert.deepEqual(page2.map((c) => c.message), ['글 3', '글 2']);
});

test('숨김 처리된 댓글은 목록에 나오지 않는다 (관리자가 Supabase에서 hidden 체크)', async () => {
  const { store, handle } = setup();
  await handle({ method: 'POST', ip: 'x', body: { nickname: 'A', message: '나쁜 말' } });
  store.rows[0].hidden = true;
  assert.equal((await handle({ method: 'GET' })).body.comments.length, 0);
});

test('삭제는 그 글의 토큰으로만, 서버에는 토큰 해시만 저장', async () => {
  const { store, handle } = setup();
  const { body } = await handle({ method: 'POST', ip: 'x', body: { nickname: 'A', message: '지울 글' } });
  assert.equal(store.rows[0].delete_hash, hashToken(body.deleteToken));
  assert.ok(!JSON.stringify(store.rows).includes(body.deleteToken), '토큰 원문은 저장하지 않는다');
  const id = body.comment.id;
  assert.equal((await handle({ method: 'DELETE', body: { id, token: 'wrong' } })).status, 404);
  assert.equal((await handle({ method: 'DELETE', body: { id, token: body.deleteToken } })).status, 200);
  assert.equal(store.rows.length, 0);
  assert.equal((await handle({ method: 'DELETE', body: { id: 'x', token: 'y' } })).status, 400);
});

test('잘못된 댓글·연속 작성은 거절', async () => {
  const { handle, advance } = setup();
  const post = (body, ip = '9.9.9.9') => handle({ method: 'POST', body, ip });
  assert.equal((await post(null)).body.error, 'bad_body');
  assert.equal((await post({ nickname: '<script>', message: '안녕' })).body.error, 'bad_nickname');
  assert.equal((await post({ nickname: 'A', message: '   ' })).body.error, 'bad_message');
  assert.equal((await post({ nickname: 'A', message: 'a'.repeat(MAX_COMMENT + 1) })).body.error, 'bad_message');
  assert.equal((await post({ nickname: 'A', message: '1\n2\n3\n4\n5\n6\n7' })).body.error, 'bad_message');
  assert.equal((await post({ nickname: 'A', message: '첫 글' })).status, 201);
  advance(5000);
  assert.equal((await post({ nickname: 'A', message: '바로 또' })).status, 429);
  advance(11_000);
  assert.equal((await post({ nickname: 'A', message: '이제 돼요' })).status, 201);
  assert.equal((await handle({ method: 'PUT' })).status, 405);
});

test('normalizeMessage: 공백·빈 줄 정리', () => {
  assert.equal(normalizeMessage('  안녕  '), '안녕');
  assert.equal(normalizeMessage('a\r\n\n\n\nb'), 'a\n\nb');
  assert.equal(normalizeMessage(5), null);
});

test('저장소가 없으면 503', async () => {
  const handle = createCommentHandler({ store: null });
  assert.equal((await handle({ method: 'GET' })).status, 503);
});
