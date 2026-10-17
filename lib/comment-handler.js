// 댓글 API 핵심 로직 (로그인 없이 닉네임으로). Vercel 함수(api/comments.js)와 로컬 개발 서버가 함께 쓴다.
//   GET    /api/comments?limit=20&before=123  → { comments: [...] } (최신순)
//   POST   /api/comments { nickname, message } → { comment, deleteToken }
//   DELETE /api/comments { id, token }         → { ok }
// 삭제: 글을 쓸 때 받은 deleteToken 을 그 기기(브라우저)에 저장해 두고, 같은 기기에서만 지울 수 있다.
//   서버에는 토큰의 SHA-256 해시만 저장한다. IP는 연속 작성 제한에만 잠깐 쓰고 저장하지 않는다.
import { createHash, randomBytes } from 'node:crypto';
import { createCommentStore } from './comment-store.js';
import { normalizeNickname } from './score-handler.js';

export const MAX_COMMENT = 300;
const MAX_LINES = 6;
const MIN_POST_GAP_MS = 15_000; // 같은 IP의 연속 작성 최소 간격

const res = (status, body) => ({ status, body });
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** 댓글 내용 정리: 앞뒤 공백 제거, 빈 줄 몰아쓰기 정리, 줄 수 제한 */
export function normalizeMessage(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const len = [...s].length;
  if (len < 1 || len > MAX_COMMENT) return null;
  if (s.split('\n').length > MAX_LINES) return null;
  return s;
}

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      const v = JSON.parse(body);
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function createCommentHandler({ store, now = Date.now, env = process.env } = {}) {
  const lastPost = new Map(); // ip -> 마지막 작성 시각 (서버리스 인스턴스 단위의 가벼운 제한)
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createCommentStore(env)) : cached);

  return async function handleComments({ method, query = {}, body, ip = 'unknown' }) {
    try {
      const db = getStore();
      if (!db) return res(503, { error: 'storage_not_configured' });

      if (method === 'GET') {
        const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
        const before = Number.parseInt(query.before, 10);
        return res(200, { comments: await db.list({ limit, before: Number.isInteger(before) && before > 0 ? before : null }) });
      }

      if (method === 'POST') {
        const data = parseBody(body);
        if (!data) return res(400, { error: 'bad_body' });
        const nickname = normalizeNickname(data.nickname);
        if (!nickname) return res(400, { error: 'bad_nickname' });
        const message = normalizeMessage(data.message);
        if (!message) return res(400, { error: 'bad_message' });

        const t = now();
        const last = lastPost.get(ip);
        if (last !== undefined && t - last < MIN_POST_GAP_MS) {
          return res(429, { error: 'too_fast', retryAfterMs: MIN_POST_GAP_MS - (t - last) });
        }
        const deleteToken = randomBytes(18).toString('base64url');
        const comment = await db.insert({ nickname, message, delete_hash: hashToken(deleteToken) });
        lastPost.set(ip, t);
        if (lastPost.size > 1000) lastPost.clear();
        return res(201, { comment, deleteToken });
      }

      if (method === 'DELETE') {
        const data = parseBody(body);
        const id = Number.parseInt(data?.id, 10);
        if (!Number.isInteger(id) || id < 1 || typeof data?.token !== 'string' || data.token.length > 100) {
          return res(400, { error: 'bad_body' });
        }
        const ok = await db.remove(id, hashToken(data.token));
        return ok ? res(200, { ok: true }) : res(404, { error: 'not_found' });
      }

      return res(405, { error: 'method_not_allowed' });
    } catch (err) {
      console.error('[comments]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

/** 기본 핸들러 (저장소는 첫 요청 때 환경변수를 보고 결정) */
export const handleComments = createCommentHandler();
