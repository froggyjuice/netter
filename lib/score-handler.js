// 리더보드 API 핵심 로직. Vercel 함수(api/score.js)와 로컬 개발 서버(vite.config.js)가 함께 쓴다.
// 입력: { method, query, body, ip }  →  출력: { status, body }
import { createStore } from './stores.js';

/** 게임별 검증 규칙. 새 게임을 만들면 여기에 항목을 추가한다. */
export const GAME_RULES = {
  snake: {
    maxScore: 5000,
    scoreStep: 10, // 점수는 10의 배수
    minTickMs: 110, // 로직상 한 칸 이동에 걸리는 최소 시간
    maxPointsPerTick: 30, // 한 칸 이동으로 얻을 수 있는 최대 점수
  },
  rhythm: {
    maxScore: 6000, // 어려움 수비 만점(플레이당 멈춤 30 + 블록 40 + 연속 10)도 들어가게
    scoreStep: 10,
    minTickMs: 1000, // 한 번의 플레이(패스가 날아오는 1박 + 다음 패스까지 1박)의 최소 시간 (120BPM)
    maxPointsPerTick: 50, // 어려움 Perfect 40 + 연속 보너스 10
  },
};

const NICK_RE = /^[\p{L}\p{N}_\-. ]+$/u;
const MAX_NICK = 12;
const MIN_POST_GAP_MS = 3000; // 같은 IP의 연속 등록 최소 간격
const MAX_DURATION_MS = 60 * 60 * 1000;

export function normalizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const len = [...s].length;
  if (len < 1 || len > MAX_NICK || !NICK_RE.test(s)) return null;
  return s;
}

const res = (status, body) => ({ status, body });

export function createScoreHandler({ store, now = Date.now, env = process.env } = {}) {
  const lastPost = new Map(); // ip -> 마지막 등록 시각 (서버리스 인스턴스 단위의 가벼운 제한)
  let cached = store;
  const getStore = () => (cached === undefined ? (cached = createStore(env)) : cached);

  return async function handleScore({ method, query = {}, body, ip = 'unknown' }) {
    try {
      const db = getStore();
      if (!db) return res(503, { error: 'storage_not_configured' });

      if (method === 'GET') {
        const game = String(query.game ?? '');
        if (!GAME_RULES[game]) return res(400, { error: 'unknown_game' });
        const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 10));
        return res(200, { scores: await db.list(game, limit) });
      }

      if (method === 'POST') {
        const data = parseBody(body);
        if (!data) return res(400, { error: 'bad_body' });

        const rules = GAME_RULES[data.game];
        if (!rules) return res(400, { error: 'unknown_game' });

        const nickname = normalizeNickname(data.nickname);
        if (!nickname) return res(400, { error: 'bad_nickname' });

        const { score, durationMs } = data;
        if (!Number.isInteger(score) || score < 0 || score > rules.maxScore || score % rules.scoreStep !== 0) {
          return res(400, { error: 'bad_score' });
        }
        if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) {
          return res(400, { error: 'bad_duration' });
        }
        const maxByTime = (Math.floor(durationMs / rules.minTickMs) + 1) * rules.maxPointsPerTick;
        if (score > 0 && (durationMs < 1000 || score > maxByTime)) {
          return res(422, { error: 'implausible_score' });
        }

        const t = now();
        const last = lastPost.get(ip);
        if (last !== undefined && t - last < MIN_POST_GAP_MS) {
          return res(429, { error: 'too_fast', retryAfterMs: MIN_POST_GAP_MS - (t - last) });
        }

        await db.insert({ game: data.game, nickname, score, meta: cleanMeta(data.meta) });
        lastPost.set(ip, t);
        if (lastPost.size > 1000) lastPost.clear();

        const rank = (await db.countHigher(data.game, score)) + 1;
        return res(201, { ok: true, rank });
      }

      return res(405, { error: 'method_not_allowed' });
    } catch (err) {
      console.error('[score]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

/** 기본 핸들러 (저장소는 첫 요청 때 환경변수를 보고 결정) */
export const handleScore = createScoreHandler();

function parseBody(body) {
  if (body && typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cleanMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  // 존 스네이크 · 리듬 슈팅 기록
  for (const k of ['balls', 'offsides', 'conceded', 'passes', 'goals', 'shots', 'perfects', 'bestCombo', 'rebounds', 'blocks']) {
    if (Number.isInteger(meta[k]) && meta[k] >= 0 && meta[k] < 100000) out[k] = meta[k];
  }
  if (typeof meta.position === 'string' && /^[A-Z]{1,2}$/.test(meta.position)) out.position = meta.position;
  if (meta.mode === 'attack' || meta.mode === 'defence') out.mode = meta.mode;
  if (['easy', 'normal', 'hard'].includes(meta.difficulty)) out.difficulty = meta.difficulty;
  return Object.keys(out).length ? out : null;
}
