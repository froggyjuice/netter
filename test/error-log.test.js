import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createErrorLogger, MAX_PER_SESSION } from '../src/shared/error-log.js';

const ORIGIN = 'https://netter-tan.vercel.app';
const setup = (stored = {}) => {
  const sent = [];
  const mem = { ...stored };
  const logger = createErrorLogger({
    send: (p) => sent.push(p),
    getContext: () => ({ page: 'snake' }),
    origin: ORIGIN,
    storage: { get: (k) => mem[k] ?? null, set: (k, v) => (mem[k] = v) },
  });
  return { logger, sent, mem };
};
const e = (n = 1, over = {}) => ({ kind: 'error', message: `Boom ${n}`, source: `${ORIGIN}/assets/index.js`, line: n, col: 1, ...over });

test('우리 사이트 오류는 보내고, 화면 상황을 붙인다', () => {
  const { logger, sent } = setup();
  assert.ok(logger.report(e()));
  assert.equal(sent[0].message, 'Boom 1');
  assert.deepEqual(sent[0].context, { page: 'snake' });
  assert.deepEqual(logger.lastError(), { kind: 'error', message: 'Boom 1' });
});

test('같은 오류는 한 번만', () => {
  const { logger, sent } = setup();
  logger.report(e());
  logger.report(e());
  assert.equal(sent.length, 1);
});

test(`한 세션에 최대 ${MAX_PER_SESSION}개 (새로고침해도 세션 안에서는 이어서 센다)`, () => {
  const { logger, sent, mem } = setup();
  for (let i = 1; i <= 8; i++) logger.report(e(i));
  assert.equal(sent.length, MAX_PER_SESSION);
  assert.equal(logger.lastError().message, 'Boom 8', '못 보낸 오류도 마지막 오류로 기억 (직접 신고에 붙임)');
  const again = setup(mem);
  assert.equal(again.logger.report(e(99)), false);
});

test('다른 출처 · 브라우저 확장 · Script error. 는 버린다', () => {
  const { logger, sent } = setup();
  assert.equal(logger.report({ kind: 'error', message: 'Script error.' }), false);
  assert.equal(logger.report(e(1, { source: 'https://ads.example.com/x.js' })), false);
  assert.equal(logger.report(e(2, { source: '', stack: 'chrome-extension://abc/content.js' })), false);
  assert.equal(logger.report({ kind: 'rejection', message: '' }), false);
  assert.equal(sent.length, 0);
});

test('Promise 오류(소스 없음)도 보낸다', () => {
  const { logger, sent } = setup();
  assert.ok(logger.report({ kind: 'rejection', message: 'Failed to fetch dynamically imported module' }));
  assert.equal(sent[0].kind, 'rejection');
});
