// 오류 자동 기록 저장소. 신고·댓글 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/client-errors.json(로컬 개발) / 메모리(테스트)
// 인터페이스: insert(row) · purgeBefore(isoDate) → 오래된 기록 지우기
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function memoryLogStore() {
  const rows = [];
  return {
    kind: 'memory',
    rows,
    async insert(row) {
      rows.push({ ...row, created_at: row.created_at ?? new Date().toISOString() });
    },
    async purgeBefore(iso) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].created_at < iso) rows.splice(i, 1);
    },
  };
}

export function fileLogStore(file = path.join(process.cwd(), '.data', 'client-errors.json')) {
  let queue = Promise.resolve();
  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  };
  const write = async (rows) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(rows, null, 2));
  };
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {}); // 한 요청이 실패해도 다음 요청은 정상 처리
    return run;
  };
  return {
    kind: 'file',
    insert(row) {
      return serial(async () => {
        const rows = await read();
        rows.push({ ...row, created_at: new Date().toISOString() });
        await write(rows);
      });
    },
    purgeBefore(iso) {
      return serial(async () => {
        const rows = await read();
        const kept = rows.filter((r) => r.created_at >= iso);
        if (kept.length !== rows.length) await write(kept);
      });
    },
  };
}

export function supabaseLogStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/client_errors`;
  async function call(query, init = {}) {
    const res = await fetchImpl(`${base}${query}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  }
  return {
    kind: 'supabase',
    async insert(row) {
      await call('', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          kind: row.kind, message: row.message, source: row.source ?? null, line: row.line ?? null, col: row.col ?? null,
          stack: row.stack ?? null, meta: row.meta ?? null,
        }),
      });
    },
    async purgeBefore(iso) {
      await call(`?${new URLSearchParams({ created_at: `lt.${iso}` })}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    },
  };
}

export function createLogStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseLogStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 파일시스템은 영구 저장소가 아니다
  return fileLogStore();
}
