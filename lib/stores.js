// 점수 저장소 어댑터. 같은 인터페이스(insert / list / countHigher)를 가진 세 가지 구현:
//   supabaseStore : 배포용 (SUPABASE_URL + SUPABASE_SERVICE_KEY 필요)
//   fileStore     : 로컬 개발용 (.data/scores.json)
//   memoryStore   : 테스트용
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function memoryStore() {
  const rows = [];
  return {
    kind: 'memory',
    async insert(row) {
      rows.push({ ...row, created_at: row.created_at ?? new Date().toISOString() });
    },
    async list(game, limit) {
      return sortRows(rows.filter((r) => r.game === game)).slice(0, limit).map(publicRow);
    },
    async countHigher(game, score) {
      return rows.filter((r) => r.game === game && r.score > score).length;
    },
  };
}

export function fileStore(file = path.join(process.cwd(), '.data', 'scores.json')) {
  let queue = Promise.resolve(); // 동시에 들어온 쓰기를 순서대로 처리

  async function read() {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  return {
    kind: 'file',
    insert(row) {
      const job = queue.then(async () => {
        const rows = await read();
        rows.push({ ...row, created_at: new Date().toISOString() });
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(rows, null, 2));
      });
      queue = job.catch(() => {}); // 실패해도 다음 쓰기는 정상 처리
      return job;
    },
    async list(game, limit) {
      await queue;
      return sortRows((await read()).filter((r) => r.game === game)).slice(0, limit).map(publicRow);
    },
    async countHigher(game, score) {
      await queue;
      return (await read()).filter((r) => r.game === game && r.score > score).length;
    },
  };
}

export function supabaseStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;

  async function call(pathAndQuery, init = {}) {
    const res = await fetchImpl(`${base}/${pathAndQuery}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  }

  return {
    kind: 'supabase',
    async insert(row) {
      await call('scores', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ game: row.game, nickname: row.nickname, score: row.score, meta: row.meta ?? null }),
      });
    },
    async list(game, limit) {
      const q = new URLSearchParams({
        select: 'nickname,score,created_at',
        game: `eq.${game}`,
        order: 'score.desc,created_at.asc',
        limit: String(limit),
      });
      const res = await call(`scores?${q}`);
      return res.json();
    },
    async countHigher(game, score) {
      const q = new URLSearchParams({ select: 'id', game: `eq.${game}`, score: `gt.${score}`, limit: '1' });
      const res = await call(`scores?${q}`, { headers: { Prefer: 'count=exact' } });
      const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
      return m ? Number(m[1]) : 0;
    },
  };
}

/** 환경에 맞는 저장소를 고른다. Vercel에서 설정이 빠졌으면 null (→ 503). */
export function createStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 환경의 파일시스템은 영구 저장소가 아니다
  return fileStore();
}

function sortRows(rows) {
  return [...rows].sort((a, b) => b.score - a.score || String(a.created_at).localeCompare(String(b.created_at)));
}

function publicRow(r) {
  return { nickname: r.nickname, score: r.score, created_at: r.created_at };
}
