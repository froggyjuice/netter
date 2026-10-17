// 동아리 허브 API 핵심 로직 (로그인 · 내 정보 · 운영진). Vercel 함수(api/auth · me · admin)와 로컬 개발 서버가 함께 쓴다.
//   POST  /api/auth   { name, phone }            → { token, member }   운영진이 미리 등록한 이름 + 전화번호로 바로 로그인
//   POST  /api/auth   { name, phone, join: true, message? } → { ok, already }  등록 안 된 사람의 가입 승인 요청
//   GET   /api/me                                → { member, save }    (Authorization: Bearer 토큰)
//   PUT   /api/me     { save }                   → { ok, updated_at }  놀이터 기록 계정 저장
//   POST  /api/me     { brag }                   → { ok, already }     '회장에게 자랑하기' (배지 · 별을 다 모았을 때)
//   POST  /api/me     { cheersSeen: true }       → { ok }              운영진이 보낸 축하를 봤다
//   (GET /api/me 의 cheers: 아직 안 본 축하 [{ id, kind, cheer, cheered_at }])
//   (운영진이면 GET /api/me 에 new_brags · new_reports · new_joins: 아직 처리 안 한 자랑 · 메시지 · 가입 요청 수)
//   GET   /api/admin                             → { members }         운영진 + 운영진 코드(x-admin-code) 필요
//   POST  /api/admin  { name, phone, role }      → { member }
//   POST  /api/admin  { members: [{ name, phone, role }, …] } → { results: [{ ok, member | error }] }  엑셀 일괄 등록 (200명까지)
//   PATCH /api/admin  { id, name?, phone?, role?, active? } → { member }
//   PATCH /api/admin  { bragsSeen: true }        → { ok }              자랑 목록을 봤다 (홈 알림 끄기)
//   PATCH /api/admin  { brag: id, cheer? }       → { brag }            자랑에 '축하 보내기' (한마디, 비우면 기본 문구)
//   PATCH /api/admin  { report: id, status: 'new'|'done', note? } → { report }   받은 메시지 처리
//   PATCH /api/admin  { join: id, action: 'approve'|'reject', role? } → { join, member? }  가입 요청 승인(바로 회원 등록) · 거절
//   GET /api/admin 은 { members, brags, reports, joins } (테이블 · 칸이 아직 없으면 그 항목은 null)
// 사용자 결정: 메일 인증 없이 이름 + 전화번호로 로그인(보안보다 편의). 연락처가 보이는 운영진 화면만 운영진 코드를 더 확인한다.
import { createMemberStore, nameKey } from './member-store.js';
import { createReportStore } from './report-store.js';
import { signSession, verifySession, bearer } from './session.js';

export const ROLES = Object.freeze(['member', 'admin']);
export const MAX_SAVE_BYTES = 64 * 1024;
export const MAX_BULK = 200;
export const MAX_JOIN_MESSAGE = 100;
export const DEFAULT_CHEER = '정말 대단해요! 축하해요 🎉';
const JOIN_PER_HOUR = 5; // 같은 IP의 1시간 가입 요청
/** 자랑할 수 있는 것: 존 스네이크 배지 전부 · 리듬 슈팅 배지 전부 · 패스 퍼즐 별 전부 */
export const BRAG_KINDS = Object.freeze(['snake-badges', 'rhythm-badges', 'pass-stars']);
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

export function createHubHandlers({ store, reportStore, now = Date.now, env = process.env } = {}) {
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createMemberStore(env)) : cached);
  let cachedReports = reportStore;
  const getReports = () => (cachedReports === undefined ? (cachedReports = createReportStore(env)) : cachedReports);
  const joinTries = new Map(); // ip -> { start, count }
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
      if (data.join === true) {
        // 가입 승인 요청: 이미 회원이면 로그인하면 되고, 같은 IP는 1시간에 5번까지
        const known = await db.findByLogin(nameKey(name), phone);
        if (known?.active) return res(409, { error: 'already_member' });
        const j = joinTries.get(ip) ?? { start: t, count: 0 };
        if (t - j.start >= 3_600_000) Object.assign(j, { start: t, count: 0 });
        if (j.count >= JOIN_PER_HOUR) return res(429, { error: 'too_fast' });
        j.count += 1;
        joinTries.set(ip, j);
        if (joinTries.size > 1000) joinTries.clear();
        const message = typeof data.message === 'string' ? data.message.trim().slice(0, MAX_JOIN_MESSAGE) : '';
        const { created } = await db.addJoin({ name, phone, message });
        return res(200, { ok: true, already: !created });
      }
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
      if (method === 'GET') {
        const out = { member: publicMember(me), save: await db.getSave(me.id), cheers: await db.listCheers(me.id).catch(() => []) };
        // 운영진: 아직 안 본 자랑 수 (테이블이 아직 없어도 로그인은 되게)
        if (me.role === 'admin') {
          out.new_brags = await db.countNewBrags().catch(() => 0);
          out.new_reports = (await getReports()?.countNew().catch(() => 0)) ?? 0;
          out.new_joins = await db.countNewJoins().catch(() => 0);
        }
        return res(200, out);
      }
      if (method === 'POST' && parseBody(body)?.cheersSeen === true) {
        await db.markCheersSeen(me.id);
        return res(200, { ok: true });
      }
      if (method === 'POST') {
        const kind = parseBody(body)?.brag;
        if (!BRAG_KINDS.includes(kind)) return res(400, { error: 'bad_brag' });
        const { created } = await db.addBrag(me.id, kind);
        return res(200, { ok: true, already: !created });
      }
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

      if (method === 'GET') {
        return res(200, {
          members: await db.list(),
          brags: await db.listBrags().catch(() => null),
          reports: (await getReports()?.list().catch(() => null)) ?? null,
          joins: await db.listJoins().catch(() => null),
        });
      }
      const data = parseBody(body);
      if (!data) return res(400, { error: 'bad_body' });

      if (method === 'POST' && Array.isArray(data.members)) {
        // 엑셀 일괄 등록: 한 명씩 넣고, 문제가 있는 줄만 따로 알려준다 (중복 번호는 건너뜀)
        if (data.members.length > MAX_BULK) return res(400, { error: 'too_many' });
        const results = [];
        for (const raw of data.members) {
          const name = normalizeName(raw?.name);
          const phone = normalizePhone(raw?.phone);
          const role = raw?.role ?? 'member';
          if (!name || !phone || !ROLES.includes(role)) {
            results.push({ ok: false, error: 'bad_member' });
            continue;
          }
          try {
            results.push({ ok: true, member: await db.insert({ name, phone, role }) });
          } catch (err) {
            if (err.code !== 'duplicate_phone') throw err;
            results.push({ ok: false, error: 'duplicate_phone' });
          }
        }
        return res(200, { results });
      }
      if (method === 'POST') {
        const name = normalizeName(data.name);
        const phone = normalizePhone(data.phone);
        const role = data.role ?? 'member';
        if (!name || !phone || !ROLES.includes(role)) return res(400, { error: 'bad_member' });
        return res(201, { member: await db.insert({ name, phone, role }) });
      }
      if (method === 'PATCH' && data.report !== undefined) {
        const id = Number(data.report);
        if (!Number.isInteger(id) || !['new', 'done'].includes(data.status)) return res(400, { error: 'bad_report' });
        const patch = { status: data.status };
        if (data.note !== undefined) patch.note = typeof data.note === 'string' ? data.note.trim().slice(0, 200) || null : null;
        const r = await getReports()?.update(id, patch);
        return r ? res(200, { report: r }) : res(404, { error: 'not_found' });
      }
      if (method === 'PATCH' && data.join !== undefined) {
        const id = Number(data.join);
        if (!Number.isInteger(id) || !['approve', 'reject'].includes(data.action)) return res(400, { error: 'bad_join' });
        const req = (await db.listJoins()).find((j) => j.id === id);
        if (!req) return res(404, { error: 'not_found' });
        if (req.status !== 'pending') return res(409, { error: 'join_done' });
        if (data.action === 'reject') return res(200, { join: await db.setJoin(id, 'rejected') });
        const role = data.role ?? 'member';
        if (!ROLES.includes(role)) return res(400, { error: 'bad_member' });
        const member = await db.insert({ name: req.name, phone: req.phone, role }); // 번호가 이미 있으면 duplicate_phone
        return res(200, { join: await db.setJoin(id, 'approved'), member });
      }
      if (method === 'PATCH' && data.brag !== undefined) {
        const id = Number(data.brag);
        if (!Number.isInteger(id)) return res(400, { error: 'bad_brag' });
        const cheer = (typeof data.cheer === 'string' ? data.cheer.trim().slice(0, 100) : '') || DEFAULT_CHEER;
        const b = await db.cheerBrag(id, cheer);
        return b ? res(200, { brag: b }) : res(404, { error: 'not_found' });
      }
      if (method === 'PATCH' && data.bragsSeen === true) {
        await db.markBragsSeen();
        return res(200, { ok: true });
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
