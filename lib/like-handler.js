// '좋아요' API 핵심 로직 (개발 중인 게임의 개발 우선순위 정하기). Vercel 함수(api/likes.js)와 로컬 개발 서버가 함께 쓴다.
//   GET  /api/likes                              → { counts: { whistle: 3, ... } }
//   POST /api/likes { game, token, like: bool }  → { ok, counts }
// token: 기기(브라우저)마다 한 번 만들어 저장해 두는 무작위 문자열. 서버에는 SHA-256 해시만 저장한다.
// IP는 연속 요청 제한에만 잠깐 쓰고 저장하지 않는다.
import { createHash } from 'node:crypto';
import { createLikeStore } from './like-store.js';

/** 좋아요를 받을 수 있는 게임 (registry.js 의 개발 중 게임) */
export const LIKE_GAMES = Object.freeze(['whistle', 'throwin', 'steps']);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MIN_GAP_MS = 1000; // 같은 IP의 연속 누르기 최소 간격

const res = (status, body) => ({ status, body });
export const hashVoter = (token) => createHash('sha256').update(`like:${token}`).digest('hex');

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

export function createLikeHandler({ store, now = Date.now, env = process.env } = {}) {
  const last = new Map(); // ip -> 마지막 요청 시각
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createLikeStore(env)) : cached);

  return async function handleLikes({ method, body, ip = 'unknown' }) {
    try {
      const db = getStore();
      if (!db) return res(503, { error: 'storage_not_configured' });

      if (method === 'GET') return res(200, { counts: await db.counts(LIKE_GAMES) });

      if (method === 'POST') {
        const data = parseBody(body);
        if (!data) return res(400, { error: 'bad_body' });
        if (!LIKE_GAMES.includes(data.game)) return res(400, { error: 'unknown_game' });
        if (typeof data.token !== 'string' || !TOKEN_RE.test(data.token)) return res(400, { error: 'bad_token' });
        if (typeof data.like !== 'boolean') return res(400, { error: 'bad_body' });

        const t = now();
        const prev = last.get(ip);
        if (prev !== undefined && t - prev < MIN_GAP_MS) return res(429, { error: 'too_fast', retryAfterMs: MIN_GAP_MS - (t - prev) });
        last.set(ip, t);
        if (last.size > 1000) last.clear();

        const voter = hashVoter(data.token);
        if (data.like) await db.add(data.game, voter);
        else await db.remove(data.game, voter);
        return res(200, { ok: true, counts: await db.counts(LIKE_GAMES) });
      }

      return res(405, { error: 'method_not_allowed' });
    } catch (err) {
      console.error('[likes]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

export const handleLikes = createLikeHandler();
