// 오류·아이디어 신고 API 핵심 로직. Vercel 함수(api/report.js)와 로컬 개발 서버(vite.config.js)가 함께 쓴다.
// 개인정보는 받지 않는다: 이름·연락처 칸이 없고, IP는 연속 신고 제한에만 잠깐 쓰고 저장하지 않는다.
import { createReportStore } from './report-store.js';

export const REPORT_KINDS = Object.freeze(['bug', 'idea']);
export const MAX_MESSAGE = 500;
const MIN_POST_GAP_MS = 10_000; // 같은 IP의 연속 신고 최소 간격

const res = (status, body) => ({ status, body });

/** 화면 상황 정보: 정해진 칸만, 짧게 */
export function cleanContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);
  const out = {
    page: str(ctx.page, 40),
    position: /^[A-Z]{1,2}$/.test(String(ctx.position ?? '')) ? ctx.position : undefined,
    mode: ctx.mode === 'attack' || ctx.mode === 'defence' ? ctx.mode : undefined,
    orientation: ctx.orientation === 'portrait' || ctx.orientation === 'landscape' ? ctx.orientation : undefined,
    viewport: /^\d{2,5}x\d{2,5}$/.test(String(ctx.viewport ?? '')) ? ctx.viewport : undefined,
    ua: str(ctx.ua, 200), // 기기·브라우저 종류 (재현용)
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

export function createReportHandler({ store, now = Date.now, env = process.env } = {}) {
  const lastPost = new Map(); // ip -> 마지막 신고 시각 (서버리스 인스턴스 단위의 가벼운 제한)
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createReportStore(env)) : cached);

  return async function handleReport({ method, body, ip = 'unknown' }) {
    try {
      if (method !== 'POST') return res(405, { error: 'method_not_allowed' });
      const db = getStore();
      if (!db) return res(503, { error: 'storage_not_configured' });

      let data = body;
      if (typeof body === 'string') {
        try {
          data = JSON.parse(body);
        } catch {
          data = null;
        }
      }
      if (!data || typeof data !== 'object') return res(400, { error: 'bad_body' });
      if (!REPORT_KINDS.includes(data.kind)) return res(400, { error: 'bad_kind' });
      const message = typeof data.message === 'string' ? data.message.normalize('NFC').trim() : '';
      if (message.length < 2 || message.length > MAX_MESSAGE) return res(400, { error: 'bad_message' });

      const t = now();
      const last = lastPost.get(ip);
      if (last !== undefined && t - last < MIN_POST_GAP_MS) {
        return res(429, { error: 'too_fast', retryAfterMs: MIN_POST_GAP_MS - (t - last) });
      }

      await db.insert({ kind: data.kind, message, meta: cleanContext(data.context) });
      lastPost.set(ip, t);
      if (lastPost.size > 1000) lastPost.clear();
      return res(201, { ok: true });
    } catch (err) {
      console.error('[report]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

/** 기본 핸들러 (저장소는 첫 요청 때 환경변수를 보고 결정) */
export const handleReport = createReportHandler();
