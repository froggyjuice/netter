// 오류 자동 기록 API 핵심 로직. Vercel 함수(api/log.js)와 로컬 개발 서버가 함께 쓴다.
//   POST /api/log { kind, message, source, line, col, stack, context } → 201 { ok }
// 개인정보는 받지 않는다: 닉네임·이름 칸이 없고, IP는 연속 전송 제한에만 잠깐 쓰고 저장하지 않는다.
// 30일 지난 기록은 새 기록이 들어올 때 함께 지운다(인스턴스마다 한 시간에 한 번).
import { createLogStore } from './log-store.js';

export const LOG_KINDS = Object.freeze(['error', 'rejection', 'load']);
export const KEEP_DAYS = 30;
// 같은 IP 제한: 한꺼번에 생긴 오류 몇 개는 받되, 계속 쏟아지면 막는다
const MAX_PER_IP_MIN = 10; // 1분에 최대
const MAX_PER_IP_HOUR = 30; // 1시간에 최대
const PURGE_EVERY_MS = 60 * 60 * 1000;

const res = (status, body) => ({ status, body });
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.normalize('NFC').trim().slice(0, max) : undefined);
const int = (v) => (Number.isInteger(v) && v >= 0 && v < 10_000_000 ? v : undefined);

/** 화면 상황: 정해진 칸만, 짧게 */
export function cleanLogContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const out = {
    page: str(ctx.page, 40),
    playing: typeof ctx.playing === 'boolean' ? ctx.playing : undefined,
    orientation: ctx.orientation === 'portrait' || ctx.orientation === 'landscape' ? ctx.orientation : undefined,
    viewport: /^\d{2,5}x\d{2,5}$/.test(String(ctx.viewport ?? '')) ? ctx.viewport : undefined,
    ua: str(ctx.ua, 200),
    version: /^[\w.-]{1,40}$/.test(String(ctx.version ?? '')) ? ctx.version : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

/** 받은 오류 하나를 저장할 행으로 (잘못됐으면 null) */
export function cleanLog(data) {
  if (!data || typeof data !== 'object' || !LOG_KINDS.includes(data.kind)) return null;
  const message = str(data.message, 300);
  if (!message) return null;
  // 파일 위치는 주소 경로만 (쿼리 문자열에 개인 정보가 섞이지 않게)
  const source = str(typeof data.source === 'string' ? data.source.split(/[?#]/)[0] : undefined, 200);
  const row = { kind: data.kind, message, source, line: int(data.line), col: int(data.col), stack: str(data.stack, 1000), meta: cleanLogContext(data.context) };
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
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

export function createLogHandler({ store, now = Date.now, env = process.env } = {}) {
  const seen = new Map(); // ip -> { minStart, minCount, hourStart, count }
  let lastPurge = 0;
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createLogStore(env)) : cached);

  return async function handleLog({ method, body, ip = 'unknown' }) {
    try {
      if (method !== 'POST') return res(405, { error: 'method_not_allowed' });
      const db = getStore();
      if (!db) return res(503, { error: 'storage_not_configured' });
      const row = cleanLog(parseBody(body));
      if (!row) return res(400, { error: 'bad_body' });

      const t = now();
      const s = seen.get(ip) ?? { minStart: t, minCount: 0, hourStart: t, count: 0 };
      if (t - s.minStart >= 60 * 1000) Object.assign(s, { minStart: t, minCount: 0 });
      if (t - s.hourStart >= 60 * 60 * 1000) Object.assign(s, { hourStart: t, count: 0 });
      if (s.minCount >= MAX_PER_IP_MIN || s.count >= MAX_PER_IP_HOUR) return res(429, { error: 'too_fast' });
      s.minCount += 1;
      s.count += 1;
      seen.set(ip, s);
      if (seen.size > 1000) seen.clear();

      await db.insert(row);
      if (t - lastPurge >= PURGE_EVERY_MS) {
        lastPurge = t;
        await db.purgeBefore(new Date(t - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString());
      }
      return res(201, { ok: true });
    } catch (err) {
      console.error('[log]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

export const handleLog = createLogHandler();
