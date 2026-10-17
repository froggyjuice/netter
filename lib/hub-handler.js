// 동아리 허브 API 핵심 로직 (로그인 · 내 정보 · 운영진). Vercel 함수(api/auth · me · admin)와 로컬 개발 서버가 함께 쓴다.
//   POST  /api/auth   { name, phone }            → { token, member }   운영진이 미리 등록한 이름 + 전화번호로 바로 로그인
//   GET   /api/me                                → { member, save }    (Authorization: Bearer 토큰)
//   PUT   /api/me     { save }                   → { ok, updated_at }  놀이터 기록 계정 저장
//   GET   /api/admin                             → { members }         운영진 + 운영진 코드(x-admin-code) 필요
//   POST  /api/admin  { name, phone, role }      → { member }
//   PATCH /api/admin  { id, name?, phone?, role?, active? } → { member }
// 사용자 결정: 메일 인증 없이 이름 + 전화번호로 로그인(보안보다 편의). 연락처가 보이는 운영진 화면만 운영진 코드를 더 확인한다.
import { createMemberStore, nameKey } from './member-store.js';
import { signSession, verifySession, bearer } from './session.js';

export const ROLES = Object.freeze(['member', 'admin']);
export const MAX_SAVE_BYTES = 64 * 1024;
const LOGIN_PER_MIN = 10; // 같은 IP의 1분 로그인 시도
const DEV_SECRET = 'local-dev-session-secret';
const DEV_ADMIN_CODE = 'dev';

const res = (status, body) => ({ status, body });

/** 이름: 앞뒤 공백 정리, 1~20자 */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const n = [...s].length;
  return n >= 1 && n <= 20 ? s : null;
}

/** 전화번호: 숫자만 남겨 010xxxxxxxx (10~11자리 휴대폰) */
export function normalizePhone(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const d = String(raw).replace(/\D/g, '');
  return /^01\d{8,9}$/.test(d) ? d : null;
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

/** 로컬 개발에서는 비밀값이 없어도 동작하게 (배포에서는 꼭 필요) */
const secretOf = (env) => env.SESSION_SECRET || (env.VERCEL ? null : DEV_SECRET);
const adminCodeOf = (env) => env.ADMIN_CODE || (env.VERCEL ? null : DEV_ADMIN_CODE);

export function createHubHandlers({ store, now = Date.now, env = process.env } = {}) {
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createMemberStore(env)) : cached);
  const attempts = new Map(); // ip -> { start, count }

  /** 토큰 → 활성 회원 (없으면 null) */
  async function memberOf(headers, db) {
    const p = verifySession(bearer(headers), secretOf(env), now());
    if (!p) return null;
    const m = await db.get(p.mid);
    return m && m.active ? m : null;
  }
  const publicMember = (m) => ({ id: m.id, name: m.name, role: m.role });

  async function handleAuth({ method, body, ip = 'unknown' }) {
    try {
      if (method !== 'POST') return res(405, { error: 'method_not_allowed' });
      const db = getStore();
      const secret = secretOf(env);
      if (!db || !secret) return res(503, { error: 'storage_not_configured' });
      const t = now();
      const a = attempts.get(ip) ?? { start: t, count: 0 };
      if (t - a.start >= 60_000) Object.assign(a, { start: t, count: 0 });
      if (a.count >= LOGIN_PER_MIN) return res(429, { error: 'too_fast' });
      a.count += 1;
      attempts.set(ip, a);
      if (attempts.size > 1000) attempts.clear();

      const data = parseBody(body);
      const name = normalizeName(data?.name);
      const phone = normalizePhone(data?.phone);
      if (!name || !phone) return res(400, { error: 'bad_login' });
      const m = await db.findByLogin(nameKey(name), phone);
      if (!m || !m.active) return res(401, { error: 'not_member' });
      return res(200, { token: signSession({ mid: m.id }, secret, t), member: publicMember(m) });
    } catch (err) {
      console.error('[auth]', err);
      return res(500, { error: 'server_error' });
    }
  }

  async function handleMe({ method, body, headers = {} }) {
    try {
      const db = getStore();
      if (!db || !secretOf(env)) return res(503, { error: 'storage_not_configured' });
      const me = await memberOf(headers, db);
      if (!me) return res(401, { error: 'not_logged_in' });
      if (method === 'GET') return res(200, { member: publicMember(me), save: await db.getSave(me.id) });
      if (method === 'PUT') {
        const data = parseBody(body);
        const save = data?.save;
        if (!save || typeof save !== 'object' || Array.isArray(save)) return res(400, { error: 'bad_save' });
        if (Buffer.byteLength(JSON.stringify(save)) > MAX_SAVE_BYTES) return res(413, { error: 'save_too_large' });
        await db.putSave(me.id, save);
        return res(200, { ok: true, updated_at: new Date(now()).toISOString() });
      }
      return res(405, { error: 'method_not_allowed' });
    } catch (err) {
      console.error('[me]', err);
      return res(500, { error: 'server_error' });
    }
  }

  async function handleAdmin({ method, body, headers = {} }) {
    try {
      const db = getStore();
      const code = adminCodeOf(env);
      if (!db || !secretOf(env) || !code) return res(503, { error: 'admin_not_configured' });
      const me = await memberOf(headers, db);
      if (!me) return res(401, { error: 'not_logged_in' });
      if (me.role !== 'admin') return res(403, { error: 'not_admin' });
      const given = headers['x-admin-code'] ?? headers['X-Admin-Code'];
      if (given !== code) return res(403, { error: 'bad_admin_code' });

      if (method === 'GET') return res(200, { members: await db.list() });
      const data = parseBody(body);
      if (!data) return res(400, { error: 'bad_body' });

      if (method === 'POST') {
        const name = normalizeName(data.name);
        const phone = normalizePhone(data.phone);
        const role = data.role ?? 'member';
        if (!name || !phone || !ROLES.includes(role)) return res(400, { error: 'bad_member' });
        return res(201, { member: await db.insert({ name, phone, role }) });
      }
      if (method === 'PATCH') {
        const id = Number(data.id);
        if (!Number.isInteger(id)) return res(400, { error: 'bad_member' });
        const patch = {};
        if (data.name !== undefined) patch.name = normalizeName(data.name);
        if (data.phone !== undefined) patch.phone = normalizePhone(data.phone);
        if (data.role !== undefined) patch.role = ROLES.includes(data.role) ? data.role : null;
        if (data.active !== undefined) patch.active = typeof data.active === 'boolean' ? data.active : null;
        if (Object.values(patch).some((v) => v === null) || !Object.keys(patch).length) return res(400, { error: 'bad_member' });
        // 자기 자신을 운영진에서 빼거나 비활성화하면 아무도 관리 못 할 수 있으니 막는다
        if (id === me.id && (patch.role === 'member' || patch.active === false)) return res(400, { error: 'cannot_demote_self' });
        const m = await db.update(id, patch);
        return m ? res(200, { member: m }) : res(404, { error: 'not_found' });
      }
      return res(405, { error: 'method_not_allowed' });
    } catch (err) {
      if (err.code === 'duplicate_phone') return res(409, { error: 'duplicate_phone' });
      console.error('[admin]', err);
      return res(500, { error: 'server_error' });
    }
  }

  return { handleAuth, handleMe, handleAdmin };
}

const hub = createHubHandlers();
export const handleAuth = hub.handleAuth;
export const handleMe = hub.handleMe;
export const handleAdmin = hub.handleAdmin;
