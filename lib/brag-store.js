// '회장에게 자랑하기' 저장소. 다른 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/brags.json(로컬 개발) / 메모리(테스트)
// 로그인이 없어서 자랑은 '적은 이름'으로 남는다 (같은 이름 · 같은 종류는 한 번).
// 인터페이스
//   add({ name, kind }) → { id, created } · list() → 최근 200개 [{ id, name, kind, seen, created_at, cheer, cheered_at }]
//   countNew() · markSeen() · cheer(id, message) → 자랑|null · cheersFor(ids) → 축하받은 것만 [{ id, kind, cheer, cheered_at }]
import { promises as fs } from 'node:fs';
import path from 'node:path';

const LIST_LIMIT = 200;
/** 같은 사람인지 볼 때: 공백을 모두 뺀다 ('김 넷볼' = '김넷볼') */
export const nameKey = (name) => String(name ?? '').normalize('NFC').replace(/\s+/g, '');
const pub = ({ id, name, kind, seen, created_at, cheer = null, cheered_at = null }) => ({ id, name, kind, seen, created_at, cheer, cheered_at });

function core(state, persist = async () => {}) {
  return {
    async add({ name, kind }) {
      const old = state.brags.find((b) => b.kind === kind && nameKey(b.name) === nameKey(name));
      if (old) return { id: old.id, created: false };
      const id = state.brags.reduce((a, b) => Math.max(a, b.id), 0) + 1;
      state.brags.push({ id, name, kind, seen: false, created_at: new Date().toISOString() });
      await persist();
      return { id, created: true };
    },
    async list() {
      return [...state.brags].sort((a, b) => b.id - a.id).slice(0, LIST_LIMIT).map(pub);
    },
    async countNew() {
      return state.brags.filter((b) => !b.seen).length;
    },
    async markSeen() {
      let changed = false;
      for (const b of state.brags) if (!b.seen) changed = b.seen = true;
      if (changed) await persist();
    },
    async cheer(id, message) {
      const b = state.brags.find((x) => x.id === id);
      if (!b) return null;
      Object.assign(b, { cheer: message, cheered_at: new Date().toISOString(), seen: true });
      await persist();
      return pub(b);
    },
    async cheersFor(ids) {
      return state.brags.filter((b) => ids.includes(b.id) && b.cheered_at).map(({ id, kind, cheer, cheered_at }) => ({ id, kind, cheer, cheered_at }));
    },
  };
}

export function memoryBragStore() {
  const state = { brags: [] };
  return { kind: 'memory', state, ...core(state) };
}

export function fileBragStore(file = path.join(process.cwd(), '.data', 'brags.json')) {
  let queue = Promise.resolve();
  // 요청마다 파일을 새로 읽어 그 상태로 처리하고, 바꿨으면 다시 쓴다 (순서대로)
  const run = (fn) => {
    const job = queue.then(async () => {
      let state = { brags: [] };
      try {
        state = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      return fn(
        core(state, async () => {
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, JSON.stringify(state, null, 2));
        }),
      );
    });
    queue = job.catch(() => {});
    return job;
  };
  const wrap = (name) => (...args) => run((api) => api[name](...args));
  return { kind: 'file', ...Object.fromEntries(['add', 'list', 'countNew', 'markSeen', 'cheer', 'cheersFor'].map((n) => [n, wrap(n)])) };
}

export function supabaseBragStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1/brags`;
  const call = async (q, init = {}) => {
    const res = await fetchImpl(`${base}${q}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  };
  const cols = 'id,name,kind,seen,created_at,cheer,cheered_at';
  return {
    kind: 'supabase',
    async add({ name, kind }) {
      // 같은 이름(공백 무시) · 같은 종류가 이미 있으면 그 자랑
      const same = await (await call(`?${new URLSearchParams({ select: 'id,name', kind: `eq.${kind}` })}&order=id.asc&limit=1000`)).json();
      const old = same.find((b) => nameKey(b.name) === nameKey(name));
      if (old) return { id: old.id, created: false };
      const rows = await (await call('?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, kind }) })).json();
      return { id: rows[0].id, created: true };
    },
    async list() {
      return (await call(`?select=${cols}&order=created_at.desc&limit=${LIST_LIMIT}`)).json();
    },
    async countNew() {
      return (await (await call('?select=id&seen=eq.false&limit=1000')).json()).length;
    },
    async markSeen() {
      await call('?seen=eq.false', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ seen: true }) });
    },
    async cheer(id, message) {
      const rows = await (
        await call(`?id=eq.${Number(id)}&select=${cols}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ cheer: message, cheered_at: new Date().toISOString(), seen: true }),
        })
      ).json();
      return rows[0] ?? null;
    },
    async cheersFor(ids) {
      if (!ids.length) return [];
      return (await call(`?select=id,kind,cheer,cheered_at&id=in.(${ids.map(Number).join(',')})&cheered_at=not.is.null`)).json();
    },
  };
}

export function createBragStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return supabaseBragStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  if (env.VERCEL) return null;
  return fileBragStore();
}
