// 허브 로그인 세션 토큰: { mid(회원 id), exp(만료 ms) } 를 서버 비밀값(SESSION_SECRET)으로 서명한다.
// 형식: base64url(JSON) + '.' + base64url(HMAC-SHA256). 역할(회원/운영진)은 토큰에 넣지 않고 요청마다 DB에서 확인한다.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 180;
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (body, secret) => b64(createHmac('sha256', secret).update(body).digest());

export function signSession({ mid }, secret, now = Date.now()) {
  if (!secret) throw new Error('SESSION_SECRET missing');
  const body = b64(JSON.stringify({ mid, exp: now + SESSION_DAYS * 24 * 60 * 60 * 1000 }));
  return `${body}.${sign(body, secret)}`;
}

/** 올바르고 만료되지 않았으면 { mid, exp }, 아니면 null */
export function verifySession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 500) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!Number.isInteger(p.mid) || !(p.exp > now)) return null;
    return p;
  } catch {
    return null;
  }
}

/** 'Authorization: Bearer <token>' 에서 토큰 */
export function bearer(headers = {}) {
  const h = headers.authorization ?? headers.Authorization ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : null;
}
