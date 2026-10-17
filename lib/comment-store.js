// 댓글 저장소. 점수·신고 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/comments.json(로컬 개발) / 메모리(테스트)
// 인터페이스: list({ limit, before }) · insert(row) → 공개 댓글 · remove(id, deleteHash) → 지웠는지
// 숨김(hidden=true) 댓글은 목록에 나오지 않는다. 관리자는 Supabase Table Editor 에서 hidden 을 체크한다.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const publicRow = (r) => ({ id: r.id, nickname: r.nickname, message: r.message, created_at: r.created_at });

function listFrom(rows, { limit, before }) {
  return rows
    .filter((r) => !r.hidden && (before == null || r.id < before))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map(publicRow);
}

export function memoryCommentStore() {
  const rows = [];
  let nextId = 1;
  return {
    kind: 'memory',
    rows,
    async list(opts) {
      return listFrom(rows, opts);
    },
    async insert(row) {
      const saved = { ...row, id: nextId++, hidden: false, created_at: new Date().toISOString() };
      rows.push(saved);
      return publicRow(saved);
    },
    async remove(id, deleteHash) {
      const i = rows.findIndex((r) => r.id === id && r.delete_hash === deleteHash);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

export function fileCommentStore(file = path.join(process.cwd(), '.data', 'comments.json')) {
  let queue = Promise.resolve(); // 쓰기를 순서대로 처리
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
    async list(opts) {
      await queue;
      return listFrom(await read(), opts);
    },
    insert(row) {
      return serial(async () => {
        const rows = await read();
        const id = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        const saved = { ...row, id, hidden: false, created_at: new Date().toISOString() };
        rows.push(saved);
        await write(rows);
        return publicRow(saved);
      });
    },
    remove(id, deleteHash) {
      return serial(async () => {
        const rows = await read();
        const i = rows.findIndex((r) => r.id === id && r.delete_hash === deleteHash);
        if (i < 0) return false;
        rows.splice(i, 1);
        await write(rows);
        return true;
      });
    },
  };
}

export function supabaseCommentStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/comments`;
  async function call(query, init = {}) {
    const res = await fetchImpl(`${base}${query}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  }
  const cols = 'id,nickname,message,created_at';
  return {
    kind: 'supabase',
    async list({ limit, before }) {
      const q = new URLSearchParams({ select: cols, hidden: 'eq.false', order: 'id.desc', limit: String(limit) });
      if (before != null) q.set('id', `lt.${before}`);
      return (await call(`?${q}`)).json();
    },
    async insert(row) {
      const res = await call(`?select=${cols}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ nickname: row.nickname, message: row.message, delete_hash: row.delete_hash }),
      });
      return (await res.json())[0];
    },
    async remove(id, deleteHash) {
      const q = new URLSearchParams({ id: `eq.${id}`, delete_hash: `eq.${deleteHash}` });
      const res = await call(`?${q}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return (await res.json()).length > 0;
    },
  };
}

export function createCommentStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseCommentStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 환경의 파일시스템은 영구 저장소가 아니다
  return fileCommentStore();
}
