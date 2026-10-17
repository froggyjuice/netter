// 출석 순위 (허브 5단계): '이번 달' · '이번 학기' 기준. 1~3위는 회원 모두에게, 전체 순위는 운영진만.
// 출석으로 세는 것: 이미 지난, 취소되지 않은 훈련에서
//   · 운영진이 인원을 확정했으면 포지션 배정에 들어간 사람(교체 포함)
//   · 아니면 '참석'으로 투표한 사람
const KST = 9 * 3_600_000;

/** 그 훈련에 출석한 회원 id 들 */
export function attendeesOf(event, votes = []) {
  if (event.lineup?.teams) {
    const ids = new Set();
    for (const t of event.lineup.teams) {
      for (const p of Object.values(t.starters ?? {})) ids.add(p.id);
      for (const s of t.subs ?? []) ids.add(s.player.id);
    }
    return ids;
  }
  return new Set(votes.filter((v) => v.event_id === event.id && v.answer === 'yes').map((v) => v.member_id));
}

/** 한국 시간으로 그 달의 [시작, 다음 달 시작) ISO 와 이름 */
export function monthRange(now = Date.now()) {
  const d = new Date(now + KST);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1) - KST).toISOString(), to: new Date(Date.UTC(y, m + 1, 1) - KST).toISOString(), label: `${m + 1}월` };
}

/** 학기 { name, starts_on: 'YYYY-MM-DD', ends_on } → [시작, 끝 다음 날) ISO */
export function semesterRange(s) {
  const from = Date.parse(`${s.starts_on}T00:00:00+09:00`);
  const to = Date.parse(`${s.ends_on}T00:00:00+09:00`) + 86_400_000;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), label: s.name };
}

/** 오늘이 들어 있는 학기 (여러 개면 가장 늦게 시작한 것) */
export function currentSemester(semesters = [], now = Date.now()) {
  return (
    semesters
      .filter((s) => {
        const r = semesterRange(s);
        return now >= Date.parse(r.from) && now < Date.parse(r.to);
      })
      .sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1))[0] ?? null
  );
}

/**
 * 기간 [from, to) 안의 지난 훈련으로 순위 → { total, rows: [{ member_id, name, count, rate, rank }] }
 * rank 는 같은 출석 수면 같은 등수 (1, 1, 3 …), 출석 0회는 빼고, 이름순으로 정리.
 */
export function ranking(events, votes, members, { from, to, now = Date.now() }) {
  const a = Date.parse(from);
  const b = Math.min(Date.parse(to), now);
  const done = events.filter((e) => e.status !== 'cancelled' && Date.parse(e.starts_at) >= a && Date.parse(e.starts_at) < b);
  const count = new Map();
  for (const e of done) for (const id of attendeesOf(e, votes)) count.set(id, (count.get(id) ?? 0) + 1);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows = [...count.entries()]
    .filter(([id, n]) => n > 0 && names.has(id))
    .map(([id, n]) => ({ member_id: id, name: names.get(id), count: n, rate: done.length ? Math.round((n / done.length) * 100) : 0 }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, 'ko'));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].count === r.count ? rows[i - 1].rank : i + 1;
  });
  return { total: done.length, rows };
}

/** 회원 모두에게 보일 1~3위 (공동 순위 포함) */
export const podium = (rows) => rows.filter((r) => r.rank <= 3);
