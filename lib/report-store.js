// 오류·아이디어 신고 저장소. 점수 저장소(stores.js)와 같은 방식:
//   Supabase(배포) / 파일 .data/reports.json(로컬 개발) / 메모리(테스트)
// insert(row) · list() → 최근 200개 [{ id, kind, message, meta, status, note, created_at, done_at }]
// update(id, { status, note }) → 행|null · countNew() → '새 메시지' 수
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LIST_LIMIT = 200;
const norm = (r, i) => ({ status: 'new', note: null, done_at: null, ...r, id: r.id ?? i + 1 });

function core(rows, persist = async () => {}) {
  return {
    async insert(row) {
      const id = rows.reduce((a, r, i) => Math.max(a, r.id ?? i + 1), 0) + 1;
      rows.push({ ...row, id, status: 'new', created_at: new Date().toISOString() });
      await persist();
    },
    async list() {
      return rows.map(norm).sort((a, b) => b.id - a.id).slice(0, LIST_LIMIT);
    },
    async update(id, patch) {
      const i = rows.findIndex((r, k) => (r.id ?? k + 1) === id);
      if (i < 0) return null;
      rows[i] = { ...norm(rows[i], i), ...patch, done_at: patch.status === 'done' ? new Date().toISOString() : null };
      await persist();
      return rows[i];
    },
    async countNew() {
      return rows.map(norm).filter((r) => r.status === 'new').length;
    },
  };
}

export function memoryReportStore() {
  const rows = [];
  return { kind: 'memory', rows, ...core(rows) };
}

export function fileReportStore(file = path.join(process.cwd(), '.data', 'reports.json')) {
  let queue = Promise.resolve(); // 동시에 들어온 쓰기를 순서대로 처리
  const run = (fn) => {
    const job = queue.then(async () => {
      let rows = [];
      try {
        rows = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      return fn(
        core(rows, async () => {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, JSON.stringify(rows, null, 2));
        }),
      );
    });
    queue = job.catch(() => {}); // 실패해도 다음 쓰기는 정상 처리
    return job;
  };
  return {
    kind: 'file',
    insert: (row) => run((s) => s.insert(row)),
    list: () => run((s) => s.list()),
    update: (id, patch) => run((s) => s.update(id, patch)),
    countNew: () => run((s) => s.countNew()),
  };
}

export function supabaseReportStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/reports`;
  const call = async (q, init = {}) => {
    const res = await fetchImpl(`${base}${q}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  };
  return {
    kind: 'supabase',
    async insert(row) {
      await call('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ kind: row.kind, message: row.message, meta: row.meta ?? null }) });
    },
    async list() {
      return (await call(`?select=id,kind,message,meta,status,note,created_at,done_at&order=created_at.desc&limit=${LIST_LIMIT}`)).json();
    },
    async update(id, patch) {
      const body = { ...patch, done_at: patch.status === 'done' ? new Date().toISOString() : null };
      const rows = await (await call(`?id=eq.${Number(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })).json();
      return rows[0] ?? null;
    },
    async countNew() {
      return (await (await call('?select=id&status=eq.new&limit=1000')).json()).length;
    },
  };
}

export function createReportStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return supabaseReportStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  }
  if (env.VERCEL) return null; // 서버리스 환경의 파일시스템은 영구 저장소가 아니다
  return fileReportStore();
}
