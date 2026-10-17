// 날짜 정하기 투표 (허브 4단계): 운영진이 후보 날짜를 올리면 회원이 되는 날을 모두 체크하고,
// 운영진이 하나로 정하면 그 날짜로 훈련 일정이 만들어진다.
import { LIMITS } from './event-logic.js';

export const MAX_OPTIONS = 10;

const time = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 투표 입력 정리 → { ok, value } | { ok: false, error } */
export function cleanPoll(input) {
  const options = (Array.isArray(input?.options) ? input.options : [])
    .map((o) => ({ starts_at: time(o?.starts_at), place: str(o?.place, LIMITS.place) || null }))
    .filter((o) => o.starts_at);
  const seen = new Set();
  const uniq = options.filter((o) => !seen.has(o.starts_at) && seen.add(o.starts_at)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  if (uniq.length < 2) return { ok: false, error: 'few_options' };
  if (uniq.length > MAX_OPTIONS) return { ok: false, error: 'many_options' };
  return {
    ok: true,
    value: {
      title: str(input?.title, LIMITS.title) || '훈련 날짜 정하기',
      memo: str(input?.memo, LIMITS.memo) || null,
      deadline: input?.deadline ? time(input.deadline) : null,
      options: uniq.map((o, i) => ({ id: i + 1, ...o })),
    },
  };
}

/** 지금 체크할 수 있나 (운영진이 닫거나 정했거나, 마감이 지나면 끝) */
export const pollOpen = (poll, now = Date.now()) => poll.status === 'open' && (!poll.deadline || now < Date.parse(poll.deadline));

/** 체크 정리: 후보에 있는 번호만, 겹치지 않게 */
export const cleanPicks = (poll, picks) => [...new Set((Array.isArray(picks) ? picks : []).map(Number).filter((n) => poll.options.some((o) => o.id === n)))];

/** 후보별 모으기 → [{ ...option, count, names }] (가장 많은 후보에 best: true) */
export function tally(poll, votes = [], names = new Map()) {
  const rows = poll.options.map((o) => {
    const who = votes.filter((v) => v.picks?.includes(o.id));
    return { ...o, count: who.length, names: who.map((v) => names.get(v.member_id) ?? '(지운 회원)').sort((a, b) => a.localeCompare(b, 'ko')) };
  });
  const max = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, best: max > 0 && r.count === max }));
}
