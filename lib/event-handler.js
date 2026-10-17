// 훈련 캘린더 · 참석 투표 · 포지션 배정 API (허브 2단계). Vercel 함수(api/events.js)와 로컬 개발 서버가 함께 쓴다.
//   GET  /api/events?from&to   → { events, me, members? }  (로그인하면 투표 명단 · 포지션 배정 결과까지, 운영진은 회원 이름 목록도)
//   POST /api/events { action, … } (로그인 필요)
//     회원:   vote { id, answer, comment?, wish?, fallback? } · unvote { id }
//     운영진: create { event } · update { id, event, notice? } · cancel { id, notice? } · restore { id } · delete { id }
//             close { id, closed } · setVote { id, member_id, answer|null } · confirm { id, teams? } · unconfirm { id }
//     날짜 정하기 투표: pollVote { id, picks } (회원) · pollCreate { poll } · pollClose { id, closed } · pollDecide { id, option, title? } · pollDelete { id } (운영진)
//     학기: semesterSave { semester: { id?, name, starts_on, ends_on } } · semesterDelete { id } (운영진)
//   GET 에는 polls(날짜 투표) · semesters · ranking(출석 순위: 회원은 1~3위, 운영진은 전체)도 함께.
//   표가 아직 없으면(SQL 실행 전) 500 대신 { not_ready: true } 로 빈 목록.
// 연락처(전화번호)는 여기서 절대 내보내지 않는다 (이름만).
import { createEventStore } from './event-store.js';
import { createMemberStore } from './member-store.js';
import { verifySession, bearer } from './session.js';
import { parseBody, secretOf } from './hub-handler.js';
import { cleanEvent, cleanVote, voteOpen, ANSWERS, LIMITS, DEFAULT_TITLE, PLACES } from '../src/shared/event-logic.js';
import { cleanPoll, pollOpen, cleanPicks, tally } from '../src/shared/poll-logic.js';
import { ranking, podium, monthRange, semesterRange, currentSemester } from '../src/shared/attendance.js';
import { assignPositions } from '../src/shared/position-assign.js';

const res = (status, body) => ({ status, body });
const DAY = 86_400_000;
const ADMIN_ACTIONS = ['create', 'update', 'cancel', 'restore', 'delete', 'close', 'setVote', 'confirm', 'unconfirm', 'pollCreate', 'pollClose', 'pollDecide', 'pollDelete', 'semesterSave', 'semesterDelete'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createEventHandler({ eventStore, memberStore, now = Date.now, env = process.env, rng = Math.random } = {}) {
  let ev = eventStore;
  let mem = memberStore;
  const events = () => (ev === undefined ? (ev = createEventStore(env)) : ev);
  const members = () => (mem === undefined ? (mem = createMemberStore(env)) : mem);

  async function memberOf(headers) {
    const p = verifySession(bearer(headers), secretOf(env), now());
    if (!p) return null;
    const m = await members().get(p.mid);
    return m && m.active ? m : null;
  }

  /** 일정 + 투표 → 화면에 보낼 모양 (로그인 안 했으면 이름 없이 수만) */
  function present(e, votes, names, me) {
    const mine = votes.filter((v) => v.event_id === e.id);
    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const v of mine) counts[v.answer] += 1;
    const out = { ...e, counts };
    if (!me) {
      out.lineup = null;
      return out;
    }
    out.votes = mine.map((v) => ({
      member_id: v.member_id,
      name: names.get(v.member_id) ?? '(지운 회원)',
      answer: v.answer,
      comment: v.comment ?? null,
      wish: v.wish ?? [],
      fallback: v.fallback ?? 'random',
      by_admin: Boolean(v.by_admin),
    }));
    return out;
  }

  /** 날짜 정하기 투표: 열린 것 + 최근 45일 안에 만든 것 */
  async function pollsView(me, names) {
    const t = now();
    const polls = (await events().listPolls()).filter((p) => p.status === 'open' || t - Date.parse(p.created_at) < 45 * DAY);
    const votes = await events().listPollVotes(polls.map((p) => p.id));
    return polls.map((p) => {
      const mine = votes.filter((v) => v.poll_id === p.id);
      const rows = tally(p, mine, me ? names : new Map());
      return {
        ...p,
        open: pollOpen(p, t),
        voters: mine.length,
        options: rows.map((r) => (me ? r : { ...r, names: [] })),
        my_picks: me ? (mine.find((v) => v.member_id === me.id)?.picks ?? []) : null,
      };
    });
  }

  /** 출석 순위: 이번 달 · 이번 학기 (회원은 1~3위, 운영진은 전체) */
  async function rankingView(me, semesters, all) {
    const t = now();
    const month = monthRange(t);
    const sem = currentSemester(semesters, t);
    const semR = sem ? semesterRange(sem) : null;
    const from = semR && semR.from < month.from ? semR.from : month.from;
    const list = await events().listEvents({ from, to: new Date(t).toISOString() });
    const votes = await events().listVotes(list.map((e) => e.id));
    const view = (r) => {
      const x = ranking(list, votes, all, { ...r, now: t });
      return { label: r.label, total: x.total, rows: me.role === 'admin' ? x.rows : podium(x.rows), full: me.role === 'admin' };
    };
    return { month: view(month), semester: semR ? view(semR) : null };
  }

  async function one(id, me) {
    const e = await events().getEvent(id);
    if (!e) return null;
    const votes = await events().listVotes([e.id]);
    const names = new Map((await members().list()).map((m) => [m.id, m.name]));
    return present(e, votes, names, me);
  }

  return async function handleEvents({ method, query = {}, body, headers = {} }) {
    try {
      const db = events();
      if (!db || !members() || !secretOf(env)) return res(503, { error: 'storage_not_configured' });
      const me = await memberOf(headers);

      if (method === 'GET') {
        const t = now();
        const from = Date.parse(query.from) || t - 45 * DAY;
        const to = Math.min(Date.parse(query.to) || t + 180 * DAY, from + 400 * DAY);
        const meOut = me ? { id: me.id, name: me.name, role: me.role } : null;
        let list;
        let votes;
        try {
          list = await db.listEvents({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
          votes = await db.listVotes(list.map((e) => e.id));
        } catch (err) {
          console.error('[events] 표가 없나요? schema.sql 을 실행해 주세요', err);
          return res(200, { events: [], polls: [], semesters: [], ranking: null, me: meOut, not_ready: true });
        }
        const all = me ? await members().list() : [];
        const names = new Map(all.map((m) => [m.id, m.name]));
        const semesters = await db.listSemesters().catch(() => []);
        return res(200, {
          events: list.map((e) => present(e, votes, names, me)),
          polls: await pollsView(me, names).catch(() => []),
          semesters,
          ranking: me ? await rankingView(me, semesters, all).catch(() => null) : null,
          me: meOut,
          ...(me?.role === 'admin' ? { members: all.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name })) } : {}),
        });
      }
      if (method !== 'POST') return res(405, { error: 'method_not_allowed' });
      if (!me) return res(401, { error: 'not_logged_in' });
      const data = parseBody(body) ?? {};
      const action = data.action;
      if (ADMIN_ACTIONS.includes(action) && me.role !== 'admin') return res(403, { error: 'not_admin' });

      // ----- 날짜 정하기 투표 -----
      if (action === 'pollCreate') {
        const c = cleanPoll(data.poll);
        if (!c.ok) return res(400, { error: c.error });
        return res(201, { poll: await db.createPoll({ ...c.value, created_by: me.id }) });
      }
      if (action?.startsWith('poll')) {
        const pid = Number(data.id);
        const p = Number.isInteger(pid) ? await db.getPoll(pid) : null;
        if (!p) return res(404, { error: 'not_found' });
        if (action === 'pollVote') {
          if (!pollOpen(p, now())) return res(409, { error: 'poll_closed' });
          await db.putPollVote(pid, me.id, cleanPicks(p, data.picks));
          return res(200, { ok: true });
        }
        if (action === 'pollDelete') {
          await db.deletePoll(pid);
          return res(200, { ok: true });
        }
        if (p.status === 'decided') return res(409, { error: 'poll_decided' });
        if (action === 'pollClose') return res(200, { poll: await db.updatePoll(pid, { status: data.closed ? 'closed' : 'open' }) });
        if (action === 'pollDecide') {
          const opt = p.options.find((o) => o.id === Number(data.option));
          if (!opt) return res(400, { error: 'bad_option' });
          const title = (typeof data.title === 'string' && data.title.trim().slice(0, LIMITS.title)) || DEFAULT_TITLE;
          const ev = await db.createEvent({ title, starts_at: opt.starts_at, ends_at: null, place: opt.place ?? PLACES[0], memo: p.memo ?? null, vote_deadline: null, created_by: me.id });
          await db.updatePoll(pid, { status: 'decided', event_id: ev.id, decided_option: opt.id });
          return res(200, { event: await one(ev.id, me) });
        }
        return res(400, { error: 'bad_action' });
      }
      // ----- 학기 -----
      if (action === 'semesterSave') {
        const s = data.semester ?? {};
        const name = typeof s.name === 'string' ? s.name.trim().slice(0, 20) : '';
        if (!name || !DATE.test(s.starts_on ?? '') || !DATE.test(s.ends_on ?? '') || s.ends_on < s.starts_on) return res(400, { error: 'bad_semester' });
        const row = { name, starts_on: s.starts_on, ends_on: s.ends_on };
        if (s.id !== undefined) row.id = Number(s.id);
        const saved = await db.saveSemester(row);
        return saved ? res(200, { semester: saved }) : res(404, { error: 'not_found' });
      }
      if (action === 'semesterDelete') {
        await db.deleteSemester(Number(data.id));
        return res(200, { ok: true });
      }

      if (action === 'create') {
        const c = cleanEvent(data.event);
        if (!c.ok) return res(400, { error: c.error });
        const e = await db.createEvent({ ...c.value, created_by: me.id });
        return res(201, { event: await one(e.id, me) });
      }

      const id = Number(data.id);
      const e = Number.isInteger(id) ? await db.getEvent(id) : null;
      if (!e) return res(404, { error: 'not_found' });
      const done = async (patch) => {
        if (patch) await db.updateEvent(id, patch);
        return res(200, { event: await one(id, me) });
      };
      const notice = typeof data.notice === 'string' ? data.notice.trim().slice(0, LIMITS.notice) : '';

      switch (action) {
        case 'vote': {
          if (!voteOpen(e, now())) return res(409, { error: 'vote_closed' });
          const v = cleanVote(data);
          if (!v.ok) return res(400, { error: v.error });
          await db.putVote(id, me.id, { ...v.value, by_admin: false });
          return done();
        }
        case 'unvote':
          if (!voteOpen(e, now())) return res(409, { error: 'vote_closed' });
          await db.deleteVote(id, me.id);
          return done();
        case 'update': {
          const c = cleanEvent(data.event ?? {}, { partial: true });
          if (!c.ok) return res(400, { error: c.error });
          const patch = { ...c.value };
          if (notice) Object.assign(patch, { notice, notice_at: new Date(now()).toISOString() });
          return done(patch);
        }
        case 'cancel':
          return done({ status: 'cancelled', vote_closed: true, notice: notice || '이번 훈련은 취소됐어요.', notice_at: new Date(now()).toISOString() });
        case 'restore':
          // 이미 인원을 확정했으면 투표는 닫힌 채로
          return done({ status: 'active', vote_closed: Boolean(e.confirmed_at), notice: null, notice_at: null });
        case 'delete':
          await db.deleteEvent(id);
          return res(200, { ok: true });
        case 'close':
          return done({ vote_closed: Boolean(data.closed) });
        case 'setVote': {
          const mid = Number(data.member_id);
          const target = Number.isInteger(mid) ? await members().get(mid) : null;
          if (!target) return res(404, { error: 'not_found' });
          if (data.answer == null) await db.deleteVote(id, mid);
          else {
            if (!ANSWERS.includes(data.answer)) return res(400, { error: 'bad_vote' });
            const old = (await db.listVotes([id])).find((v) => v.member_id === mid);
            await db.putVote(id, mid, { answer: data.answer, comment: old?.comment ?? null, wish: old?.wish ?? [], fallback: old?.fallback ?? 'random', by_admin: true });
          }
          return done();
        }
        case 'confirm': {
          const votes = (await db.listVotes([id])).filter((v) => v.answer === 'yes');
          if (!votes.length) return res(409, { error: 'no_attendees' });
          const names = new Map((await members().list()).map((m) => [m.id, m.name]));
          const players = votes.map((v) => ({ id: v.member_id, name: names.get(v.member_id) ?? '(지운 회원)', wish: v.wish ?? [], fallback: v.fallback ?? 'random' }));
          const teams = data.teams === undefined ? undefined : Number(data.teams);
          const r = assignPositions(players, { teams, rng });
          // 저장은 이름 · id 만
          const slim = (p) => ({ id: p.id, name: p.name });
          const lineup = {
            teamCount: r.teamCount,
            at: new Date(now()).toISOString(),
            teams: r.teams.map((t) => ({
              starters: Object.fromEntries(Object.entries(t.starters).map(([pos, p]) => [pos, slim(p)])),
              subs: t.subs.map((s) => ({ pos: s.pos, player: slim(s.player) })),
            })),
          };
          return done({ confirmed_at: lineup.at, lineup, vote_closed: true });
        }
        case 'unconfirm':
          return done({ confirmed_at: null, lineup: null });
        default:
          return res(400, { error: 'bad_action' });
      }
    } catch (err) {
      console.error('[events]', err);
      return res(500, { error: 'server_error' });
    }
  };
}

export const handleEvents = createEventHandler();
