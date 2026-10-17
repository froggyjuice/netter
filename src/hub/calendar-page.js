// 📅 훈련 캘린더 (허브 2단계): 달력 · 다가오는 훈련 · 참석 투표 · 운영진 일정 관리 · 포지션 배정
// ctx: { hub, showToast, openLogin }
import { HUB_ERROR_TEXT } from './hub-client.js';
import {
  ANSWER_LABEL, ANSWERS, LIMITS, PLACES, voteOpen, deadlineOf, summarize, dayKey, whenText, toLocalInput, fromLocalInput, monthCells, icsFor, googleCalendarUrl, shareText,
} from '../shared/event-logic.js';
import { COURT, defaultTeams } from '../shared/position-assign.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const errText = (err) => HUB_ERROR_TEXT[err?.code] ?? '잠시 뒤 다시 시도해 주세요.';
const KST = 9 * 3_600_000;
const todayKey = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const pageUrl = () => `${location.origin}${location.pathname}#/calendar`;

export async function renderCalendar(el, { hub, showToast, openLogin }) {
  const isAdmin = hub.isAdmin();
  let data = { events: [], me: null };
  const t = todayKey().split('-').map(Number);
  let month = { y: t[0], m: t[1] };
  const open = new Set(); // 펼친 일정 id
  let editing = null; // 수정 중인 일정 (null 이면 새로 만들기)

  el.innerHTML = `
    <div class="intro-head"><h2>📅 훈련 캘린더</h2>${isAdmin ? '<button type="button" class="btn small" id="ev-new">➕ 일정 만들기</button>' : ''}</div>
    ${hub.session ? '' : '<p class="small">🔑 <a href="#" id="cal-login">로그인</a>하면 참석 투표와 참석 명단을 볼 수 있어요.</p>'}
    <form class="ev-form" id="ev-form" hidden>
      <h3 id="ev-form-title">➕ 일정 만들기</h3>
      <label>제목 <input id="f-title" maxlength="${LIMITS.title}" placeholder="훈련" /></label>
      <label>날짜 · 시간 <input id="f-start" type="datetime-local" required /></label>
      <label>장소 <select id="f-place-pick">${PLACES.map((p) => `<option value="${p}">${p}</option>`).join('')}<option value="">그 외 (직접 적기)</option></select></label>
      <label id="f-place-row" hidden>장소 직접 적기 <input id="f-place" maxlength="${LIMITS.place}" placeholder="예) ○○공원 농구장" /></label>
      <label>메모 (선택) <textarea id="f-memo" rows="2" maxlength="${LIMITS.memo}" placeholder="준비물 · 전달 사항"></textarea></label>
      <label>투표 마감 (선택 · 비우면 훈련 2시간 전) <input id="f-deadline" type="datetime-local" /></label>
      <label id="f-notice-row" hidden>변경 알림 (선택 · 쓰면 홈 배너로 알려요) <input id="f-notice" maxlength="${LIMITS.notice}" placeholder="예) 장소가 ○○체육관으로 바뀌었어요" /></label>
      <div class="row"><button type="button" class="btn ghost small" id="f-cancel">닫기</button><button type="submit" class="btn primary small" id="f-save">저장</button></div>
    </form>
    <section class="cal-month" aria-label="달력">
      <div class="cal-nav"><button type="button" class="pg" id="m-prev" aria-label="이전 달">‹</button><b id="m-title"></b><button type="button" class="pg" id="m-next" aria-label="다음 달">›</button></div>
      <div class="cal-grid" id="cal-grid"></div>
    </section>
    <h3 class="cal-h">다가오는 훈련</h3>
    <div class="ev-list" id="ev-upcoming"><p class="muted small">불러오는 중…</p></div>
    <details class="ev-past"><summary>지난 훈련</summary><div class="ev-list" id="ev-past"></div></details>`;
  const $ = (s) => el.querySelector(s);
  $('#cal-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLogin();
  });

  // ----- 불러오기 · 그리기 -----
  async function load() {
    try {
      data = await hub.events();
      draw();
    } catch (err) {
      $('#ev-upcoming').innerHTML = `<p class="small">${esc(errText(err))}</p>`;
    }
  }
  const byDay = () => {
    const m = new Map();
    for (const e of data.events) m.set(dayKey(e.starts_at), [...(m.get(dayKey(e.starts_at)) ?? []), e]);
    return m;
  };
  function draw() {
    const days = byDay();
    const today = todayKey();
    $('#m-title').textContent = `${month.y}년 ${month.m}월`;
    $('#cal-grid').innerHTML =
      ['일', '월', '화', '수', '목', '금', '토'].map((w) => `<span class="cal-w">${w}</span>`).join('') +
      monthCells(month.y, month.m)
        .map((c) => {
          const evs = days.get(c.key) ?? [];
          const cls = [c.inMonth ? '' : 'out', c.key === today ? 'today' : '', evs.length ? 'has' : '', evs.some((e) => e.status === 'cancelled') && evs.every((e) => e.status === 'cancelled') ? 'cancelled' : ''].join(' ');
          return `<button type="button" class="cal-day ${cls}" data-day="${c.key}" ${evs.length ? '' : 'tabindex="-1"'}>${c.day}${evs.length ? '<i></i>' : ''}</button>`;
        })
        .join('');
    const now = Date.now();
    const upcoming = data.events.filter((e) => Date.parse(e.ends_at ?? e.starts_at) >= now - 3 * 3_600_000);
    const past = data.events.filter((e) => !upcoming.includes(e)).reverse();
    $('#ev-upcoming').innerHTML = upcoming.length ? upcoming.map(card).join('') : '<p class="muted small">다가오는 훈련이 없어요.</p>';
    $('#ev-past').innerHTML = past.length ? past.map(card).join('') : '<p class="muted small">지난 훈련이 없어요.</p>';
  }

  // ----- 일정 카드 -----
  function card(e) {
    const isOpen = open.has(e.id);
    const can = voteOpen(e);
    const mine = e.votes?.find((v) => v.member_id === data.me?.id);
    const chips = [
      e.status === 'cancelled' ? '<span class="ev-chip bad">취소됨</span>' : '',
      e.confirmed_at ? '<span class="ev-chip good">확정 · 포지션 배정</span>' : !can && e.status !== 'cancelled' ? '<span class="ev-chip">투표 마감</span>' : '',
      mine ? `<span class="ev-chip mine">내 투표 ${ANSWER_LABEL[mine.answer]}</span>` : '',
    ].join('');
    return `<article class="ev-card ${e.status === 'cancelled' ? 'cancelled' : ''}" data-id="${e.id}">
      <button type="button" class="ev-head" data-act="toggle" aria-expanded="${isOpen}">
        <span class="ev-when">${esc(whenText(e))}</span>
        <b class="ev-title">${esc(e.title)}</b>${e.place ? `<span class="muted small">📍 ${esc(e.place)}</span>` : ''}
        <span class="ev-counts small">✅ ${e.counts.yes} · ❌ ${e.counts.no} · 🤔 ${e.counts.maybe}</span>
        <span class="ev-chips">${chips}</span>
      </button>
      ${isOpen ? body(e, mine, can) : ''}
    </article>`;
  }

  function body(e, mine, can) {
    const s = summarize(e.votes ?? []);
    const who = (v) => `<span class="ev-name" title="${esc(v.comment ?? '')}">${esc(v.name)}${v.wish?.length ? `<small>(${v.wish.join('·')})</small>` : ''}${v.comment ? ' 💬' : ''}${v.by_admin ? '<small> · 운영진 추가</small>' : ''}</span>`;
    const voteBox =
      !data.me
        ? '<p class="small">🔑 로그인하면 참석 투표를 할 수 있어요.</p>'
        : can
          ? `<div class="ev-vote">
              <div class="ev-answers">${ANSWERS.map((a) => `<button type="button" class="chip" data-answer="${a}" aria-pressed="${mine?.answer === a}">${ANSWER_LABEL[a]}</button>`).join('')}</div>
              <div class="ev-wish" ${mine?.answer === 'yes' ? '' : 'hidden'}>
                <p class="small">🎯 희망 포지션 (선택 · ${LIMITS.wish}개까지) — 겹치면 그 안에서 랜덤</p>
                <div class="ev-pos">${COURT.map((p) => `<button type="button" class="chip small-chip" data-wish="${p}" aria-pressed="${Boolean(mine?.wish?.includes(p))}">${p}</button>`).join('')}</div>
                <p class="small">희망 포지션이 안 되면:
                  <label><input type="radio" name="fb-${e.id}" value="random" ${mine?.fallback !== 'sub' ? 'checked' : ''} /> 남은 포지션 중 랜덤</label>
                  <label><input type="radio" name="fb-${e.id}" value="sub" ${mine?.fallback === 'sub' ? 'checked' : ''} /> 그 포지션 교체</label></p>
              </div>
              <input class="ev-comment" maxlength="${LIMITS.comment}" placeholder="한마디 (선택) 예) 20분 늦어요" value="${esc(mine?.comment ?? '')}" />
              <div class="row"><button type="button" class="btn primary small" data-act="vote">${mine ? '투표 바꾸기' : '투표하기'}</button>${mine ? '<button type="button" class="btn ghost small" data-act="unvote">투표 지우기</button>' : ''}</div>
              <p class="muted small">마감 ${esc(whenText({ starts_at: deadlineOf(e) }))}</p>
            </div>`
          : `<p class="small muted">${e.status === 'cancelled' ? '취소된 훈련이에요.' : '투표가 마감됐어요.'}</p>`;
    const lineup = e.lineup
      ? `<div class="ev-lineup"><h4>🏐 포지션 배정</h4>${e.lineup.teams
          .map(
            (tm, i) => `${e.lineup.teams.length > 1 ? `<p class="small"><b>${i + 1}팀</b></p>` : ''}
            <div class="lineup-grid">${COURT.filter((p) => tm.starters[p]).map((p) => `<span class="lp"><b>${p}</b>${esc(tm.starters[p].name)}</span>`).join('')}</div>
            ${tm.subs.length ? `<p class="small">🔁 교체: ${tm.subs.map((x) => `${esc(x.player.name)}(${x.pos})`).join(', ')}</p>` : ''}`,
          )
          .join('')}</div>`
      : '';
    const admin = isAdmin
      ? `<div class="ev-admin">
          <p class="small"><b>⚙️ 운영진</b></p>
          <div class="row wrap">
            <button type="button" class="btn small ghost" data-act="edit">✏️ 수정</button>
            ${e.status === 'cancelled' ? '<button type="button" class="btn small ghost" data-act="restore">↩️ 취소 되돌리기</button>' : '<button type="button" class="btn small ghost" data-act="cancel">🚫 취소</button>'}
            <button type="button" class="btn small ghost" data-act="close">${e.vote_closed ? '🔓 투표 다시 열기' : '🔒 투표 지금 닫기'}</button>
            <button type="button" class="btn small ghost" data-act="delete">🗑️ 지우기</button>
          </div>
          <div class="row wrap">
            <select class="ev-add-who"><option value="">회원 골라 추가 · 바꾸기…</option>${(data.members ?? []).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
            <select class="ev-add-answer">${ANSWERS.map((a) => `<option value="${a}">${ANSWER_LABEL[a]}</option>`).join('')}<option value="">투표 지우기</option></select>
            <button type="button" class="btn small ghost" data-act="setVote">적용</button>
          </div>
          <div class="row wrap">
            ${e.confirmed_at
              ? '<button type="button" class="btn small" data-act="confirm">🔄 다시 뽑기</button><button type="button" class="btn small ghost" data-act="unconfirm">확정 취소</button><button type="button" class="btn small ghost" data-act="share-lineup">📋 배정 결과 카톡 문구</button>'
              : `<button type="button" class="btn small primary" data-act="confirm" ${s.yes.length ? '' : 'disabled'}>✅ 인원 확정 · 포지션 배정 (${s.yes.length}명)</button>`}
          </div>
        </div>`
      : '';
    return `<div class="ev-body">
      ${e.notice ? `<p class="ev-notice">📢 ${esc(e.notice)}</p>` : ''}
      ${e.memo ? `<p class="ev-memo">${esc(e.memo)}</p>` : ''}
      ${voteBox}
      ${e.votes
        ? `<div class="ev-who">
            <p><b>✅ 참석 ${s.yes.length}</b> ${s.yes.map(who).join('')}</p>
            <p><b>🤔 미정 ${s.maybe.length}</b> ${s.maybe.map(who).join('')}</p>
            <p><b>❌ 불참 ${s.no.length}</b> ${s.no.map(who).join('')}</p>
          </div>`
        : ''}
      ${lineup}
      <div class="row wrap ev-share">
        <button type="button" class="btn small ghost" data-act="ics">📅 내 캘린더에 추가</button>
        <a class="btn small ghost" href="${esc(googleCalendarUrl(e, pageUrl()))}" target="_blank" rel="noopener">구글 캘린더</a>
        <button type="button" class="btn small ghost" data-act="share">📋 카톡 공유 문구</button>
      </div>
      ${admin}
    </div>`;
  }

  // ----- 동작 -----
  const find = (id) => data.events.find((e) => e.id === id);
  const replace = (ev) => {
    data.events = data.events.map((e) => (e.id === ev.id ? ev : e));
    draw();
  };
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what}을(를) 복사했어요. 카톡에 붙여넣어 주세요 📋`, 'good', 4000);
    } catch {
      window.prompt('아래 문구를 복사해 주세요', text);
    }
  };
  const act = async (body, ok) => {
    try {
      const out = await hub.eventAction(body);
      if (out.event) replace(out.event);
      else await load();
      if (ok) showToast(ok, 'good');
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  };

  el.addEventListener('click', async (ev) => {
    const day = ev.target.closest('[data-day]');
    if (day) {
      const first = data.events.find((e) => dayKey(e.starts_at) === day.dataset.day);
      if (!first) return;
      open.add(first.id);
      draw();
      el.querySelector(`.ev-card[data-id="${first.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const cardEl = ev.target.closest('.ev-card');
    const btn = ev.target.closest('[data-act], [data-answer], [data-wish]');
    if (!cardEl || !btn) return;
    const id = Number(cardEl.dataset.id);
    const e = find(id);
    if (btn.dataset.answer) {
      cardEl.querySelectorAll('[data-answer]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      cardEl.querySelector('.ev-wish').hidden = btn.dataset.answer !== 'yes';
      return;
    }
    if (btn.dataset.wish) {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      if (on && cardEl.querySelectorAll('[data-wish][aria-pressed="true"]').length >= LIMITS.wish) return showToast(`희망 포지션은 ${LIMITS.wish}개까지예요`);
      btn.setAttribute('aria-pressed', String(on));
      return;
    }
    switch (btn.dataset.act) {
      case 'toggle':
        if (open.has(id)) open.delete(id);
        else open.add(id);
        return draw();
      case 'vote': {
        const answer = cardEl.querySelector('[data-answer][aria-pressed="true"]')?.dataset.answer;
        if (!answer) return showToast('참석 · 불참 · 미정 중 하나를 골라 주세요');
        const wish = [...cardEl.querySelectorAll('[data-wish][aria-pressed="true"]')].map((b) => b.dataset.wish);
        const fallback = cardEl.querySelector(`input[name="fb-${id}"]:checked`)?.value ?? 'random';
        return act({ action: 'vote', id, answer, wish, fallback, comment: cardEl.querySelector('.ev-comment').value }, '투표했어요 🗳️');
      }
      case 'unvote':
        return act({ action: 'unvote', id }, '투표를 지웠어요');
      case 'ics': {
        const url = URL.createObjectURL(new Blob([icsFor(e, pageUrl())], { type: 'text/calendar;charset=utf-8' }));
        Object.assign(document.createElement('a'), { href: url, download: `netter-${dayKey(e.starts_at)}.ics` }).click();
        return setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      case 'share':
        return copy(shareText(e, { kind: e.status === 'cancelled' ? 'cancel' : e.notice ? 'change' : 'invite', url: pageUrl() }), '공유 문구');
      case 'share-lineup':
        return copy(shareText(e, { kind: 'lineup', lineup: e.lineup, url: pageUrl() }), '배정 결과');
      case 'edit':
        return openForm(e);
      case 'cancel': {
        const notice = window.prompt('취소 알림 문구 (홈 배너 · 카톡 문구에 나와요)', '이번 훈련은 취소됐어요.');
        if (notice === null) return;
        return act({ action: 'cancel', id, notice }, '훈련을 취소했어요. 카톡 공유 문구로 알려 주세요');
      }
      case 'restore':
        return act({ action: 'restore', id }, '취소를 되돌렸어요');
      case 'delete':
        if (!window.confirm('이 일정을 지울까요? 투표도 함께 지워져요. (알림이 필요하면 지우기 대신 취소를 써 주세요)')) return;
        return act({ action: 'delete', id }, '일정을 지웠어요');
      case 'close':
        return act({ action: 'close', id, closed: !e.vote_closed }, e.vote_closed ? '투표를 다시 열었어요' : '투표를 닫았어요');
      case 'setVote': {
        const mid = Number(cardEl.querySelector('.ev-add-who').value);
        if (!mid) return showToast('회원을 골라 주세요');
        const answer = cardEl.querySelector('.ev-add-answer').value || null;
        return act({ action: 'setVote', id, member_id: mid, answer }, '참석 명단을 바꿨어요');
      }
      case 'confirm': {
        const n = summarize(e.votes ?? []).yes.length;
        let teams;
        if (n >= 14) {
          const v = window.prompt(`참석 ${n}명이에요. 몇 팀으로 나눌까요?`, String(defaultTeams(n)));
          if (v === null) return;
          teams = Number(v);
          if (!(teams >= 1)) return showToast('팀 수를 숫자로 적어 주세요');
        } else if (!window.confirm(`참석 ${n}명으로 확정하고 포지션을 랜덤 배정할까요? (투표는 닫혀요)`)) return;
        return act({ action: 'confirm', id, teams }, '포지션을 배정했어요 🏐');
      }
      case 'unconfirm':
        return act({ action: 'unconfirm', id }, '확정을 취소했어요 (투표는 닫힌 채로 있어요)');
      default:
    }
  });

  // ----- 일정 만들기 · 수정 -----
  const form = $('#ev-form');
  function openForm(e = null) {
    editing = e;
    form.hidden = false;
    $('#ev-form-title').textContent = e ? '✏️ 일정 수정' : '➕ 일정 만들기';
    $('#f-title').value = e?.title ?? '훈련';
    $('#f-start').value = toLocalInput(e?.starts_at);
    // 장소: 목록에 있으면 고르고, 없으면 '그 외'에 직접 적기 (새 일정은 체육관)
    const place = e ? e.place ?? '' : PLACES[0];
    $('#f-place-pick').value = PLACES.includes(place) ? place : '';
    $('#f-place').value = PLACES.includes(place) ? '' : place;
    $('#f-place-row').hidden = PLACES.includes(place);
    $('#f-memo').value = e?.memo ?? '';
    $('#f-deadline').value = toLocalInput(e?.vote_deadline);
    $('#f-notice-row').hidden = !e;
    $('#f-notice').value = '';
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  $('#ev-new')?.addEventListener('click', () => openForm());
  $('#f-place-pick').addEventListener('change', () => {
    $('#f-place-row').hidden = Boolean($('#f-place-pick').value);
    if (!$('#f-place-pick').value) $('#f-place').focus();
  });
  $('#f-cancel').addEventListener('click', () => {
    form.hidden = true;
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const event = {
      title: $('#f-title').value,
      starts_at: fromLocalInput($('#f-start').value),
      ends_at: null, // 끝 시각은 받지 않는다 (날짜 · 시간 하나)
      place: $('#f-place-pick').value || $('#f-place').value,
      memo: $('#f-memo').value,
      vote_deadline: fromLocalInput($('#f-deadline').value),
    };
    $('#f-save').disabled = true;
    try {
      const out = editing
        ? await hub.eventAction({ action: 'update', id: editing.id, event, notice: $('#f-notice').value })
        : await hub.eventAction({ action: 'create', event });
      form.hidden = true;
      showToast(editing ? '일정을 고쳤어요' : '일정을 만들었어요 📅 카톡 공유 문구로 투표를 알려 주세요', 'good', 4500);
      open.add(out.event.id);
      const [y, m] = dayKey(out.event.starts_at).split('-').map(Number);
      month = { y, m };
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
    } finally {
      $('#f-save').disabled = false;
    }
  });

  $('#m-prev').addEventListener('click', () => {
    month = month.m === 1 ? { y: month.y - 1, m: 12 } : { y: month.y, m: month.m - 1 };
    draw();
  });
  $('#m-next').addEventListener('click', () => {
    month = month.m === 12 ? { y: month.y + 1, m: 1 } : { y: month.y, m: month.m + 1 };
    draw();
  });
  await load();
  // 가장 가까운 다가오는 훈련은 펼쳐 둔다
  const next = data.events.find((e) => Date.parse(e.starts_at) >= Date.now() - 3 * 3_600_000 && e.status !== 'cancelled');
  if (next && !open.size) {
    open.add(next.id);
    draw();
  }
}

/** 홈에 보일 것: 다음 훈련 한 줄 + 최근 7일 안의 취소 · 변경 알림 (다가오는 일정만) */
export function homeNotices(events, me) {
  const now = Date.now();
  const upcoming = events.filter((e) => Date.parse(e.starts_at) >= now - 3 * 3_600_000);
  const notices = upcoming.filter((e) => e.notice && e.notice_at && now - Date.parse(e.notice_at) < 7 * 86_400_000);
  const next = upcoming.find((e) => e.status !== 'cancelled');
  const mine = next?.votes?.find((v) => v.member_id === me?.id);
  return { next, mine, notices };
}
