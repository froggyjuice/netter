// 자랑하기 · 운영진 API 핵심 로직. Vercel 함수(api/brag · admin)와 로컬 개발 서버가 함께 쓴다.
// 로그인은 없다 (회원·일정은 동아리 앱 netter-app-one 이 맡는다).
//   POST  /api/brag   { name, kind }             → { ok, id, already }   '회장에게 자랑하기' (배지 · 별을 다 모았을 때, 이름만 적는다)
//   GET   /api/brag?ids=1,2                      → { cheers: [{ id, kind, cheer, cheered_at }] }  이 기기에서 한 자랑 중 축하받은 것
//   GET   /api/admin                             → { brags, reports }    운영진 코드(x-admin-code) 하나로 연다 (공용 장벽)
//   PATCH /api/admin  { bragsSeen: true }        → { ok }                자랑 목록을 봤다
//   PATCH /api/admin  { brag: id, cheer? }       → { brag }              자랑에 '축하 보내기' (한마디, 비우면 기본 문구)
//   PATCH /api/admin  { report: id, status: 'new'|'done', note? } → { report }   받은 메시지 처리
//   GET /api/admin 의 brags · reports 는 테이블 · 칸이 아직 없으면 null
import { createBragStore } from './brag-store.js';
import { createReportStore } from './report-store.js';

export const DEFAULT_CHEER = '정말 대단해요! 축하해요 🎉';
/** 자랑할 수 있는 것: 존 스네이크 배지 전부 · 리듬 슈팅 배지 전부 · 패스 퍼즐 별 전부 */
export const BRAG_KINDS = Object.freeze(['snake-badges', 'rhythm-badges', 'pass-stars']);
const BRAG_PER_HOUR = 10; // 같은 IP의 1시간 자랑
const ADMIN_PER_MIN = 10; // 같은 IP의 1분 운영진 코드 시도 (틀린 것만 센다)
const MAX_IDS = 20;
const DEV_ADMIN_CODE = 'dev';

const res = (status, body) => ({ status, body });

/** 이름: 앞뒤 공백 정리, 1~20자 */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const n = [...s].length;
  return n >= 1 && n <= 20 ? s : null;
}

export function parseBody(body) {
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

/** 로컬 개발에서는 운영진 코드가 없어도 'dev' 로 (배포에서는 꼭 필요) */
const adminCodeOf = (env) => env.ADMIN_CODE || (env.VERCEL ? null : DEV_ADMIN_CODE);

/** ip 별 시간당 횟수 제한 */
function limiter(windowMs, max) {
  const hits = new Map();
  return {
    blocked(ip, t) {
      const h = hits.get(ip);
      return Boolean(h && t - h.start < windowMs && h.count >= max);
    },
    hit(ip, t) {
      const h = hits.get(ip) ?? { start: t, count: 0 };
      if (t - h.start >= windowMs) Object.assign(h, { start: t, count: 0 });
      h.count += 1;
      hits.set(ip, h);
      if (hits.size > 1000) hits.clear();
    },
  };
}

export function createHubHandlers({ bragStore, reportStore, now = Date.now, env = process.env } = {}) {
  let cachedBrags = bragStore;
  const getBrags = () => (cachedBrags === undefined ? (cachedBrags = createBragStore(env)) : cachedBrags);
  let cachedReports = reportStore;
  const getReports = () => (cachedReports === undefined ? (cachedReports = createReportStore(env)) : cachedReports);
  const bragLimit = limiter(3_600_000, BRAG_PER_HOUR);
  const codeLimit = limiter(60_000, ADMIN_PER_MIN);

  async function handleBrag({ method, body, query = {}, ip = 'unknown' }) {
    try {
      const db = getBrags();
      if (!db) return res(503, { error: 'storage_not_configured' });
      if (method === 'GET') {
        const ids = String(query.ids ?? '')
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
          .slice(0, MAX_IDS);
        return res(200, { cheers: ids.length ? await db.cheersFor(ids) : [] });
      }
      if (method !== 'POST') return res(405, { error: 'method_not_allowed' });
      const data = parseBody(body);
      const name = normalizeName(data?.name);
      if (!name) return res(400, { error: 'bad_name' });
      if (!BRAG_KINDS.includes(data.kind)) return res(400, { error: 'bad_brag' });
      const t = now();
      if (bragLimit.blocked(ip, t)) return res(429, { error: 'too_fast' });
      bragLimit.hit(ip, t);
      const { id, created } = await db.add({ name, kind: data.kind });
      return res(200, { ok: true, id, already: !created });
    } catch (err) {
      console.error('[brag]', err);
      return res(500, { error: 'server_error' });
    }
  }

  async function handleAdmin({ method, body, headers = {}, ip = 'unknown' }) {
    try {
      const code = adminCodeOf(env);
      if (!code) return res(503, { error: 'admin_not_configured' });
      const t = now();
      if (codeLimit.blocked(ip, t)) return res(429, { error: 'too_fast' });
      const given = headers['x-admin-code'] ?? headers['X-Admin-Code'];
      if (given !== code) {
        codeLimit.hit(ip, t);
        return res(403, { error: 'bad_admin_code' });
      }
      const brags = getBrags();
      const reports = getReports();

      if (method === 'GET') {
        return res(200, {
          brags: (await brags?.list().catch(() => null)) ?? null,
          reports: (await reports?.list().catch(() => null)) ?? null,
        });
      }
      const data = parseBody(body);
      if (!data) return res(400, { error: 'bad_body' });
      if (method !== 'PATCH') return res(405, { error: 'method_not_allowed' });

      if (data.report !== undefined) {
        const id = Number(data.report);
        if (!Number.isInteger(id) || !['new', 'done'].includes(data.status)) return res(400, { error: 'bad_report' });
        const patch = { status: data.status };
        if (data.note !== undefined) patch.note = typeof data.note === 'string' ? data.note.trim().slice(0, 200) || null : null;
        const r = await reports?.update(id, patch);
        return r ? res(200, { report: r }) : res(404, { error: 'not_found' });
      }
      if (data.brag !== undefined) {
        const id = Number(data.brag);
        if (!Number.isInteger(id)) return res(400, { error: 'bad_brag' });
        const cheer = (typeof data.cheer === 'string' ? data.cheer.trim().slice(0, 100) : '') || DEFAULT_CHEER;
        const b = await brags?.cheer(id, cheer);
        return b ? res(200, { brag: b }) : res(404, { error: 'not_found' });
      }
      if (data.bragsSeen === true) {
        await brags?.markSeen();
        return res(200, { ok: true });
      }
      return res(400, { error: 'bad_body' });
    } catch (err) {
      console.error('[admin]', err);
      return res(500, { error: 'server_error' });
    }
  }

  return { handleBrag, handleAdmin };
}

const hub = createHubHandlers();
export const handleBrag = hub.handleBrag;
export const handleAdmin = hub.handleAdmin;
