// 허브 회원 · 놀이터 기록(계정 저장) 저장소. 다른 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/members.json(로컬 개발) / 메모리(테스트)
// 인터페이스
//   list() · get(id) · findByLogin(nameKey, phone) · insert({ name, phone, role }) → 회원 · update(id, patch) → 회원|null
//   getSave(memberId) → { data, updated_at } | null · putSave(memberId, data)
// phone 이 이미 있으면 insert/update 가 { code: 'duplicate_phone' } 오류를 던진다.
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 이름 맞춰 보기용: 공백을 모두 뺀다 ('김 넷볼' = '김넷볼') */
export const nameKey = (name) => String(name ?? '').normalize('NFC').replace(/\s+/g, '');

const dup = () => Object.assign(new Error('duplicate_phone'), { code: 'duplicate_phone' });
const pub = (m) => ({ id: m.id, name: m.name, phone: m.phone, role: m.role, active: m.active, created_at: m.created_at });

function core(state, persist = async () => {}) {
  const find = (id) => state.members.find((m) => m.id === id);
  return {
    async list() {
      return [...state.members].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(pub);
    },
    async get(id) {
      const m = find(id);
      return m ? pub(m) : null;
    },
    async findByLogin(key, phone) {
      const m = state.members.find((x) => x.phone === phone && nameKey(x.name) === key);
      return m ? pub(m) : null;
    },
    async insert({ name, phone, role }) {
      if (state.members.some((m) => m.phone === phone)) throw dup();
      const m = { id: (state.members.reduce((a, x) => Math.max(a, x.id), 0) || 0) + 1, name, phone, role, active: true, created_at: new Date().toISOString() };
      state.members.push(m);
      await persist();
      return pub(m);
    },
    async update(id, patch) {
      const m = find(id);
      if (!m) return null;
      if (patch.phone && state.members.some((x) => x.id !== id && x.phone === patch.phone)) throw dup();
      Object.assign(m, patch);
      await persist();
      return pub(m);
    },
    async getSave(memberId) {
      return state.saves[memberId] ?? null;
    },
    async putSave(memberId, data) {
      state.saves[memberId] = { data, updated_at: new Date().toISOString() };
      await persist();
    },
  };
}

export function memoryMemberStore() {
  const state = { members: [], saves: {} };
  return { kind: 'memory', state, ...core(state) };
}

export function fileMemberStore(file = path.join(process.cwd(), '.data', 'members.json')) {
  let queue = Promise.resolve();
  const load = async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return { members: [], saves: {} };
      throw e;
    }
  };
  // 요청마다 파일을 새로 읽어 그 상태로 처리하고, 바꿨으면 다시 쓴다 (순서대로)
  const run = (fn) => {
    const job = queue.then(async () => {
      const state = await load();
      const api = core(state, async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(state, null, 2));
      });
      return fn(api);
    });
    queue = job.catch(() => {}); // 한 요청이 실패해도(예: 전화번호 중복) 다음 요청은 정상 처리
    return job;
  };
  const wrap = (name) => (...args) => run((api) => api[name](...args));
  return { kind: 'file', ...Object.fromEntries(['list', 'get', 'findByLogin', 'insert', 'update', 'getSave', 'putSave'].map((n) => [n, wrap(n)])) };
}

export function supabaseMemberStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  async function call(pathAndQuery, init = {}) {
    const res = await fetchImpl(`${base}/${pathAndQuery}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 409 || /duplicate key|23505/.test(text)) throw dup();
      throw new Error(`supabase ${res.status}: ${text}`);
    }
    return res;
  }
  const cols = 'id,name,phone,role,active,created_at';
  return {
    kind: 'supabase',
    async list() {
      return (await call(`members?select=${cols}&order=name.asc`)).json();
    },
    async get(id) {
      return (await (await call(`members?select=${cols}&id=eq.${Number(id)}`)).json())[0] ?? null;
    },
    async findByLogin(key, phone) {
      const rows = await (await call(`members?${new URLSearchParams({ select: cols, phone: `eq.${phone}` })}`)).json();
      return rows.find((m) => nameKey(m.name) === key) ?? null;
    },
    async insert({ name, phone, role }) {
      const res = await call(`members?select=${cols}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, phone, role }) });
      return (await res.json())[0];
    },
    async update(id, patch) {
      const res = await call(`members?id=eq.${Number(id)}&select=${cols}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return (await res.json())[0] ?? null;
    },
    async getSave(memberId) {
      return (await (await call(`play_saves?select=data,updated_at&member_id=eq.${Number(memberId)}`)).json())[0] ?? null;
    },
    async putSave(memberId, data) {
      await call('play_saves?on_conflict=member_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ member_id: Number(memberId), data, updated_at: new Date().toISOString() }),
      });
    },
  };
}

export function createMemberStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return supabaseMemberStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  if (env.VERCEL) return null;
  return fileMemberStore();
}
