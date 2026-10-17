// 훈련 일정 · 참석 투표 저장소. 다른 저장소와 같은 방식:
//   Supabase(배포) / 파일 .data/events.json(로컬 개발) / 메모리(테스트)
// 인터페이스
//   listEvents({ from, to }) → 시작 시각 순 · getEvent(id) · createEvent(e) → 일정 · updateEvent(id, patch) → 일정|null · deleteEvent(id)
//   listVotes(eventIds) → [{ event_id, member_id, answer, comment, wish, fallback, by_admin, updated_at }]
//   putVote(eventId, memberId, vote) · deleteVote(eventId, memberId)
//   날짜 정하기 투표: listPolls() · getPoll(id) · createPoll(p) · updatePoll(id, patch) · deletePoll(id) · listPollVotes(ids) · putPollVote(pollId, memberId, picks)
//   학기: listSemesters() · saveSemester(s) (id 있으면 고치기) · deleteSemester(id)
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EVENT_DEFAULTS = { ends_at: null, place: null, memo: null, vote_deadline: null, vote_closed: false, status: 'active', notice: null, notice_at: null, confirmed_at: null, lineup: null };

function core(state, persist = async () => {}) {
  const find = (id) => state.events.find((e) => e.id === id);
  return {
    async listEvents({ from, to } = {}) {
      const a = from ? Date.parse(from) : -Infinity;
      const b = to ? Date.parse(to) : Infinity;
      return state.events
        .filter((e) => Date.parse(e.starts_at) >= a && Date.parse(e.starts_at) < b)
        .sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at))
        .map((e) => ({ ...e }));
    },
    async getEvent(id) {
      const e = find(id);
      return e ? { ...e } : null;
    },
    async createEvent(e) {
      const id = state.events.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      const now = new Date().toISOString();
      const row = { ...EVENT_DEFAULTS, ...e, id, created_at: now, updated_at: now };
      state.events.push(row);
      await persist();
      return { ...row };
    },
    async updateEvent(id, patch) {
      const e = find(id);
      if (!e) return null;
      Object.assign(e, patch, { updated_at: new Date().toISOString() });
      await persist();
      return { ...e };
    },
    async deleteEvent(id) {
      state.events = state.events.filter((e) => e.id !== id);
      state.votes = state.votes.filter((v) => v.event_id !== id);
      await persist();
    },
    async listVotes(eventIds) {
      const set = new Set(eventIds);
      return state.votes.filter((v) => set.has(v.event_id)).map((v) => ({ ...v }));
    },
    async putVote(eventId, memberId, vote) {
      const row = { event_id: eventId, member_id: memberId, by_admin: false, ...vote, updated_at: new Date().toISOString() };
      const i = state.votes.findIndex((v) => v.event_id === eventId && v.member_id === memberId);
      if (i >= 0) state.votes[i] = row;
      else state.votes.push(row);
      await persist();
    },
    async deleteVote(eventId, memberId) {
      state.votes = state.votes.filter((v) => !(v.event_id === eventId && v.member_id === memberId));
      await persist();
    },
    // ----- 날짜 정하기 투표 -----
    async listPolls() {
      return [...(state.polls ?? [])].sort((a, b) => b.id - a.id).map((p) => ({ ...p }));
    },
    async getPoll(id) {
      const p = (state.polls ?? []).find((x) => x.id === id);
      return p ? { ...p } : null;
    },
    async createPoll(p) {
      state.polls ??= [];
      const id = state.polls.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      const row = { status: 'open', event_id: null, ...p, id, created_at: new Date().toISOString() };
      state.polls.push(row);
      await persist();
      return { ...row };
    },
    async updatePoll(id, patch) {
      const p = (state.polls ?? []).find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, patch);
      await persist();
      return { ...p };
    },
    async deletePoll(id) {
      state.polls = (state.polls ?? []).filter((p) => p.id !== id);
      state.pollVotes = (state.pollVotes ?? []).filter((v) => v.poll_id !== id);
      await persist();
    },
    async listPollVotes(ids) {
      const set = new Set(ids);
      return (state.pollVotes ?? []).filter((v) => set.has(v.poll_id)).map((v) => ({ ...v }));
    },
    async putPollVote(pollId, memberId, picks) {
      state.pollVotes ??= [];
      state.pollVotes = state.pollVotes.filter((v) => !(v.poll_id === pollId && v.member_id === memberId));
      if (picks.length) state.pollVotes.push({ poll_id: pollId, member_id: memberId, picks, updated_at: new Date().toISOString() });
      await persist();
    },
    // ----- 학기 -----
    async listSemesters() {
      return [...(state.semesters ?? [])].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1)).map((s) => ({ ...s }));
    },
    async saveSemester(s) {
      state.semesters ??= [];
      if (s.id) {
        const old = state.semesters.find((x) => x.id === s.id);
        if (!old) return null;
        Object.assign(old, s);
        await persist();
        return { ...old };
      }
      const row = { ...s, id: state.semesters.reduce((m, x) => Math.max(m, x.id), 0) + 1 };
      state.semesters.push(row);
      await persist();
      return { ...row };
    },
    async deleteSemester(id) {
      state.semesters = (state.semesters ?? []).filter((s) => s.id !== id);
      await persist();
    },
  };
}

export function memoryEventStore() {
  const state = { events: [], votes: [], polls: [], pollVotes: [], semesters: [] };
  return { kind: 'memory', state, ...core(state) };
}

export function fileEventStore(file = path.join(process.cwd(), '.data', 'events.json')) {
  let queue = Promise.resolve();
  const run = (fn) => {
    const job = queue.then(async () => {
      let state = { events: [], votes: [], polls: [], pollVotes: [], semesters: [] };
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
  const names = ['listEvents', 'getEvent', 'createEvent', 'updateEvent', 'deleteEvent', 'listVotes', 'putVote', 'deleteVote',
    'listPolls', 'getPoll', 'createPoll', 'updatePoll', 'deletePoll', 'listPollVotes', 'putPollVote', 'listSemesters', 'saveSemester', 'deleteSemester'];
  return { kind: 'file', ...Object.fromEntries(names.map((n) => [n, (...a) => run((s) => s[n](...a))])) };
}

export function supabaseEventStore({ url, key, fetchImpl = globalThis.fetch }) {
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  async function call(q, init = {}) {
    const res = await fetchImpl(`${base}/${q}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res;
  }
  const rep = { Prefer: 'return=representation' };
  return {
    kind: 'supabase',
    async listEvents({ from, to } = {}) {
      const q = new URLSearchParams({ select: '*', order: 'starts_at.asc' });
      if (from) q.append('starts_at', `gte.${from}`);
      if (to) q.append('starts_at', `lt.${to}`);
      return (await call(`events?${q}`)).json();
    },
    async getEvent(id) {
      return (await (await call(`events?select=*&id=eq.${Number(id)}`)).json())[0] ?? null;
    },
    async createEvent(e) {
      return (await (await call('events?select=*', { method: 'POST', headers: rep, body: JSON.stringify(e) })).json())[0];
    },
    async updateEvent(id, patch) {
      const body = JSON.stringify({ ...patch, updated_at: new Date().toISOString() });
      return (await (await call(`events?id=eq.${Number(id)}&select=*`, { method: 'PATCH', headers: rep, body })).json())[0] ?? null;
    },
    async deleteEvent(id) {
      await call(`events?id=eq.${Number(id)}`, { method: 'DELETE' });
    },
    async listVotes(eventIds) {
      if (!eventIds.length) return [];
      return (await call(`event_votes?select=*&event_id=in.(${eventIds.map(Number).join(',')})`)).json();
    },
    async putVote(eventId, memberId, vote) {
      await call('event_votes?on_conflict=event_id,member_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ event_id: Number(eventId), member_id: Number(memberId), by_admin: false, ...vote, updated_at: new Date().toISOString() }),
      });
    },
    async deleteVote(eventId, memberId) {
      await call(`event_votes?event_id=eq.${Number(eventId)}&member_id=eq.${Number(memberId)}`, { method: 'DELETE' });
    },
    async listPolls() {
      return (await call('polls?select=*&order=id.desc&limit=50')).json();
    },
    async getPoll(id) {
      return (await (await call(`polls?select=*&id=eq.${Number(id)}`)).json())[0] ?? null;
    },
    async createPoll(p) {
      return (await (await call('polls?select=*', { method: 'POST', headers: rep, body: JSON.stringify(p) })).json())[0];
    },
    async updatePoll(id, patch) {
      return (await (await call(`polls?id=eq.${Number(id)}&select=*`, { method: 'PATCH', headers: rep, body: JSON.stringify(patch) })).json())[0] ?? null;
    },
    async deletePoll(id) {
      await call(`polls?id=eq.${Number(id)}`, { method: 'DELETE' });
    },
    async listPollVotes(ids) {
      if (!ids.length) return [];
      return (await call(`poll_votes?select=*&poll_id=in.(${ids.map(Number).join(',')})`)).json();
    },
    async putPollVote(pollId, memberId, picks) {
      if (!picks.length) {
        await call(`poll_votes?poll_id=eq.${Number(pollId)}&member_id=eq.${Number(memberId)}`, { method: 'DELETE' });
        return;
      }
      await call('poll_votes?on_conflict=poll_id,member_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ poll_id: Number(pollId), member_id: Number(memberId), picks, updated_at: new Date().toISOString() }),
      });
    },
    async listSemesters() {
      return (await call('semesters?select=*&order=starts_on.desc')).json();
    },
    async saveSemester(s) {
      if (s.id) {
        const { id, ...patch } = s;
        return (await (await call(`semesters?id=eq.${Number(id)}&select=*`, { method: 'PATCH', headers: rep, body: JSON.stringify(patch) })).json())[0] ?? null;
      }
      return (await (await call('semesters?select=*', { method: 'POST', headers: rep, body: JSON.stringify(s) })).json())[0];
    },
    async deleteSemester(id) {
      await call(`semesters?id=eq.${Number(id)}`, { method: 'DELETE' });
    },
  };
}

export function createEventStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return supabaseEventStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY });
  if (env.VERCEL) return null;
  return fileEventStore();
}
