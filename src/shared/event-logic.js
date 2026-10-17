// 훈련 캘린더 · 참석 투표 공통 로직 (허브 2-A). 서버(lib/event-handler.js)와 화면이 함께 쓴다.
import { COURT } from './position-assign.js';

export const ANSWERS = Object.freeze(['yes', 'no', 'maybe']);
export const ANSWER_LABEL = Object.freeze({ yes: '✅ 참석', no: '❌ 불참', maybe: '🤔 미정' });
export const FALLBACKS = Object.freeze(['random', 'sub']);
export const LIMITS = Object.freeze({ title: 40, place: 60, memo: 300, comment: 60, notice: 200, wish: 3 });
const KST = 9 * 3_600_000;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const time = (v) => {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** 투표 마감을 따로 정하지 않으면 훈련 시작 2시간 전 */
export const DEFAULT_DEADLINE_MS = 2 * 3_600_000;
export const deadlineOf = (ev) => ev.vote_deadline ?? new Date(Date.parse(ev.starts_at) - DEFAULT_DEADLINE_MS).toISOString();
/** 훈련 장소 고르기 (그 외는 직접 적기) */
export const PLACES = Object.freeze(['전북사대부고 체육관', '전북사대부고 대운동장']);

/** 지금 투표할 수 있나: 취소 · 운영진이 닫음 · 마감 지남이면 못 함 */
export function voteOpen(ev, now = Date.now()) {
  return ev.status !== 'cancelled' && !ev.vote_closed && now < Date.parse(deadlineOf(ev));
}

/** 일정 입력값 정리 → { ok, value } | { ok: false, error } (partial: 고칠 칸만) */
export function cleanEvent(input, { partial = false } = {}) {
  const v = {};
  const has = (k) => input?.[k] !== undefined;
  if (!partial || has('title')) v.title = str(input?.title, LIMITS.title) || '훈련';
  if (!partial || has('starts_at')) {
    v.starts_at = time(input?.starts_at);
    if (!v.starts_at) return { ok: false, error: 'bad_time' };
  }
  if (!partial || has('ends_at')) v.ends_at = input?.ends_at ? time(input.ends_at) : null;
  if (!partial || has('place')) v.place = str(input?.place, LIMITS.place) || null;
  if (!partial || has('memo')) v.memo = str(input?.memo, LIMITS.memo) || null;
  if (!partial || has('vote_deadline')) v.vote_deadline = input?.vote_deadline ? time(input.vote_deadline) : null;
  if (v.ends_at && v.starts_at && Date.parse(v.ends_at) <= Date.parse(v.starts_at)) return { ok: false, error: 'bad_time' };
  return { ok: true, value: v };
}

/** 투표 입력값 정리 → { ok, value } | { ok: false, error } */
export function cleanVote(input) {
  if (!ANSWERS.includes(input?.answer)) return { ok: false, error: 'bad_vote' };
  const wish = input.answer === 'yes' && Array.isArray(input.wish) ? [...new Set(input.wish.filter((p) => COURT.includes(p)))].slice(0, LIMITS.wish) : [];
  return {
    ok: true,
    value: {
      answer: input.answer,
      comment: str(input.comment, LIMITS.comment) || null,
      wish,
      fallback: FALLBACKS.includes(input.fallback) ? input.fallback : 'random',
    },
  };
}

/** 투표 모으기 → { yes: [...], no: [...], maybe: [...] } (이름순) */
export function summarize(votes = []) {
  const out = { yes: [], no: [], maybe: [] };
  for (const v of votes) out[v.answer]?.push(v);
  for (const k of ANSWERS) out[k].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
  return out;
}

// ----- 날짜 (한국 시간) -----
/** ISO → 'YYYY-MM-DD' (한국 날짜) */
export const dayKey = (iso) => new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
const parts = (iso) => {
  const d = new Date(Date.parse(iso) + KST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
};
const W = ['일', '월', '화', '수', '목', '금', '토'];
const hm = (p) => `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
/** '10월 21일 (화) 19:00~21:00' */
export function whenText(ev) {
  const a = parts(ev.starts_at);
  const end = ev.ends_at ? parts(ev.ends_at) : null;
  return `${a.m}월 ${a.d}일 (${W[a.w]}) ${hm(a)}${end ? `~${hm(end)}` : ''}`;
}
/** 'YYYY-MM-DDTHH:mm' (한국 시간, <input type="datetime-local"> 값) */
export function toLocalInput(iso) {
  if (!iso) return '';
  return new Date(Date.parse(iso) + KST).toISOString().slice(0, 16);
}
/** <input type="datetime-local"> 값(한국 시간) → ISO */
export function fromLocalInput(v) {
  if (!v) return null;
  const t = Date.parse(`${v}:00+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** 달력 칸: 그 달을 포함한 6주(일요일 시작) → [{ key: 'YYYY-MM-DD', day, inMonth }] */
export function monthCells(year, month) {
  const first = Date.UTC(year, month - 1, 1);
  const start = first - new Date(first).getUTCDay() * 86_400_000;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1 };
  });
}

// ----- 내 캘린더에 추가 -----
const icsTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const endOf = (ev) => ev.ends_at ?? new Date(Date.parse(ev.starts_at) + 2 * 3_600_000).toISOString();

/** .ics 파일 내용 (애플 · 삼성 · 구글 캘린더에서 열림) */
export function icsFor(ev, url = '') {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Netter//Training//KO',
    'BEGIN:VEVENT',
    `UID:netter-event-${ev.id}@netter`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(ev.starts_at)}`,
    `DTEND:${icsTime(endOf(ev))}`,
    `SUMMARY:${icsText(`🏐 ${ev.title}`)}`,
    ev.place ? `LOCATION:${icsText(ev.place)}` : null,
    `DESCRIPTION:${icsText([ev.memo, url].filter(Boolean).join('\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

/** 구글 캘린더 '일정 추가' 링크 */
export function googleCalendarUrl(ev, url = '') {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `🏐 ${ev.title}`,
    dates: `${icsTime(ev.starts_at)}/${icsTime(endOf(ev))}`,
    details: [ev.memo, url].filter(Boolean).join('\n'),
    location: ev.place ?? '',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** 카톡 공유 문구: kind 'invite' (투표 부탁) · 'cancel' · 'change' · 'lineup' (포지션 배정 결과) */
export function shareText(ev, { kind = 'invite', url = '', lineup = null } = {}) {
  const head = { invite: '📅 훈련 참석 투표', cancel: '🚫 훈련 취소 알림', change: '📢 훈련 변경 알림', lineup: '🏐 훈련 포지션 배정' }[kind];
  const lines = [`${head}`, `${ev.title} · ${whenText(ev)}${ev.place ? ` · ${ev.place}` : ''}`];
  if ((kind === 'cancel' || kind === 'change') && ev.notice) lines.push(`→ ${ev.notice}`);
  if (kind === 'invite') lines.push(`투표 마감: ${whenText({ starts_at: deadlineOf(ev) }).replace(/~.*/, '')}`);
  if (kind === 'lineup' && lineup) {
    lineup.teams.forEach((t, i) => {
      if (lineup.teams.length > 1) lines.push(`[${i + 1}팀]`);
      lines.push(COURT.filter((p) => t.starters[p]).map((p) => `${p} ${t.starters[p].name}`).join(' · '));
      if (t.subs.length) lines.push(`교체: ${t.subs.map((s) => `${s.player.name}(${s.pos})`).join(', ')}`);
    });
  }
  if (url) lines.push(`👉 ${url}`);
  return lines.join('\n');
}
