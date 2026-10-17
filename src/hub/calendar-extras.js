// 훈련 캘린더 덧붙이기: 🗓️ 날짜 정하기 투표 (허브 4단계) · 🏅 출석 순위 + 📆 학기 설정 (허브 5단계)
// calendar-page.js 가 불러 쓴다. getData(): 지금 /api/events 응답, reload(): 다시 불러오기
import { HUB_ERROR_TEXT } from './hub-client.js';
import { whenText, fromLocalInput, PLACES, LIMITS } from '../shared/event-logic.js';
import { MAX_OPTIONS } from '../shared/poll-logic.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const errText = (err) => HUB_ERROR_TEXT[err?.code] ?? '잠시 뒤 다시 시도해 주세요.';
const MEDAL = ['🥇', '🥈', '🥉'];
const pageUrl = () => `${location.origin}${location.pathname}#/calendar`;

function placeSelect(value = PLACES[0]) {
  const custom = !PLACES.includes(value);
  return `<select class="po-place">${PLACES.map((p) => `<option value="${p}" ${p === value ? 'selected' : ''}>${p}</option>`).join('')}<option value="" ${custom ? 'selected' : ''}>그 외 (직접 적기)</option></select>
    <input class="po-place-text" maxlength="${LIMITS.place}" placeholder="장소 직접 적기" value="${custom ? esc(value) : ''}" ${custom ? '' : 'hidden'} />`;
}
const optionRow = () => `<div class="po-row"><input class="po-time" type="datetime-local" />${placeSelect()}<button type="button" class="btn small ghost" data-poll-act="row-del" aria-label="후보 빼기">✕</button></div>`;

/** 날짜 투표 카톡 문구 */
export function pollShareText(p, url = '') {
  return [
    '🗓️ 훈련 날짜 정하기 투표',
    p.title,
    ...p.options.map((o) => `· ${whenText(o)}${o.place ? ` (${o.place})` : ''}`),
    p.deadline ? `마감: ${whenText({ starts_at: p.deadline })}` : null,
    '되는 날을 모두 체크해 주세요!',
    url ? `👉 ${url}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function createExtras(root, { hub, showToast, isAdmin, getData, reload }) {
  let rankTab = 'month';
  const pollsBox = root.querySelector('#cal-polls');
  const rankBox = root.querySelector('#cal-ranking');

  // ----- 🗓️ 날짜 정하기 투표 -----
  function pollCard(p, me) {
    const decided = p.status === 'decided';
    const state = decided ? '✅ 날짜를 정했어요' : p.open ? (p.deadline ? `마감 ${esc(whenText({ starts_at: p.deadline }))}` : '체크 받는 중') : '마감됨';
    const canPick = me && p.open;
    return `<article class="poll-card ${decided ? 'decided' : ''}" data-poll="${p.id}">
      <p class="poll-head"><b>🗓️ ${esc(p.title)}</b> <span class="muted small">${state} · ${p.voters}명 참여</span></p>
      ${p.memo ? `<p class="small">${esc(p.memo)}</p>` : ''}
      <ul class="poll-opts">${p.options
        .map(
          (o) => `<li class="${o.best ? 'best' : ''} ${p.decided_option === o.id ? 'chosen' : ''}">
            <label><input type="checkbox" data-pick="${o.id}" ${p.my_picks?.includes(o.id) ? 'checked' : ''} ${canPick ? '' : 'disabled'} />
              <span>${esc(whenText(o))}${o.place ? ` <span class="muted small">📍 ${esc(o.place)}</span>` : ''}</span></label>
            <span class="poll-count">${o.best ? '⭐ ' : ''}${o.count}명</span>
            ${o.names?.length ? `<details class="poll-names"><summary class="small">누가?</summary><span class="small">${o.names.map(esc).join(', ')}</span></details>` : ''}
            ${isAdmin && !decided ? `<button type="button" class="btn small ghost" data-poll-act="decide" data-opt="${o.id}">📌 이 날짜로 정하기</button>` : ''}
            ${p.decided_option === o.id ? '<span class="ev-chip good">이 날짜로 정함 → 훈련 일정에 있어요</span>' : ''}
          </li>`,
        )
        .join('')}</ul>
      ${canPick ? '<button type="button" class="btn small primary" data-poll-act="vote">✔️ 체크 저장</button>' : !me && p.open ? '<p class="small">🔑 로그인하면 되는 날을 체크할 수 있어요.</p>' : ''}
      <div class="row wrap">
        <button type="button" class="btn small ghost" data-poll-act="share">📋 카톡 공유 문구</button>
        ${isAdmin && !decided ? `<button type="button" class="btn small ghost" data-poll-act="close">${p.status === 'closed' ? '🔓 다시 열기' : '🔒 마감하기'}</button>` : ''}
        ${isAdmin ? '<button type="button" class="btn small ghost" data-poll-act="delete">🗑️ 지우기</button>' : ''}
      </div>
    </article>`;
  }

  function drawPolls() {
    const data = getData();
    const polls = data.polls ?? [];
    if (!polls.length && !isAdmin) {
      pollsBox.innerHTML = '';
      return;
    }
    pollsBox.innerHTML = `<h3 class="cal-h">🗓️ 날짜 정하기 투표</h3>
      ${isAdmin
        ? `<details class="poll-new"><summary class="small"><b>➕ 날짜 투표 만들기</b> (후보 날짜를 올리면 회원이 되는 날을 체크해요)</summary>
            <form class="poll-form" id="poll-form">
              <label>제목 <input id="pf-title" maxlength="${LIMITS.title}" value="훈련 날짜 정하기" /></label>
              <label>메모 (선택) <input id="pf-memo" maxlength="${LIMITS.memo}" placeholder="예) 11월 정기 훈련 요일을 정해요" /></label>
              <label>마감 (선택) <input id="pf-deadline" type="datetime-local" /></label>
              <p class="small">후보 날짜 · 시간 (2~${MAX_OPTIONS}개)</p>
              <div id="pf-rows">${optionRow()}${optionRow()}</div>
              <div class="row wrap"><button type="button" class="btn small ghost" data-poll-act="row-add">➕ 후보 추가</button><button type="submit" class="btn small primary">만들기</button></div>
            </form></details>`
        : ''}
      <div class="poll-list">${polls.length ? polls.map((p) => pollCard(p, data.me)).join('') : '<p class="muted small">진행 중인 날짜 투표가 없어요.</p>'}</div>`;
  }

  // ----- 🏅 출석 순위 + 📆 학기 -----
  function drawRanking() {
    const data = getData();
    if (!data.me) {
      rankBox.innerHTML = '<h3 class="cal-h">🏅 출석 순위</h3><p class="muted small">🔑 로그인하면 이번 달 · 이번 학기 출석 순위를 볼 수 있어요.</p>';
      return;
    }
    const r = data.ranking;
    const cur = r?.[rankTab] ?? null;
    const rows = cur?.rows ?? [];
    rankBox.innerHTML = `<h3 class="cal-h">🏅 출석 순위</h3>
      <div class="report-tabs">
        <button type="button" class="chip" data-rank-tab="month" aria-pressed="${rankTab === 'month'}">이번 달${r?.month ? ` (${esc(r.month.label)})` : ''}</button>
        <button type="button" class="chip" data-rank-tab="semester" aria-pressed="${rankTab === 'semester'}">이번 학기${r?.semester ? ` (${esc(r.semester.label)})` : ''}</button>
      </div>
      ${
        !cur
          ? `<p class="muted small">${rankTab === 'semester' ? '지금 학기가 정해지지 않았어요. 운영진이 학기 시작일 · 끝일을 정하면 보여요.' : '순위를 불러오지 못했어요.'}</p>`
          : `<p class="muted small">지난 훈련 ${cur.total}번 기준 · ${cur.full ? '운영진에게는 전체 순위가 보여요' : '1~3위만 보여요'}</p>
            ${rows.length
              ? `<ol class="att-list">${rows
                  .map((x) => `<li class="${x.member_id === data.me.id ? 'me' : ''}"><span class="rk">${MEDAL[x.rank - 1] ?? `${x.rank}위`}</span><b>${esc(x.name)}</b><span class="muted small">${x.count}회 · ${x.rate}%</span></li>`)
                  .join('')}</ol>`
              : '<p class="muted small">아직 출석 기록이 없어요.</p>'}`
      }
      ${isAdmin ? semestersHtml(data.semesters ?? []) : ''}`;
  }
  function semestersHtml(list) {
    return `<details class="sem-box"><summary class="small"><b>📆 학기 설정</b> (출석 순위 '이번 학기' 기준)</summary>
      <ul class="sem-list">${list.map((s) => `<li data-sem="${s.id}"><b>${esc(s.name)}</b> ${s.starts_on} ~ ${s.ends_on} <button type="button" class="btn small ghost" data-sem-act="delete">지우기</button></li>`).join('') || '<li class="muted small">아직 없어요</li>'}</ul>
      <form class="sem-form" id="sem-form">
        <input id="sem-name" maxlength="20" placeholder="예) 2026 2학기" required />
        <label class="small">시작 <input id="sem-start" type="date" required /></label>
        <label class="small">끝 <input id="sem-end" type="date" required /></label>
        <button type="submit" class="btn small primary">저장</button>
      </form></details>`;
  }

  // ----- 동작 -----
  const run = async (body, ok) => {
    try {
      await hub.eventAction(body);
      if (ok) showToast(ok, 'good');
      await reload();
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  };
  root.addEventListener('change', (e) => {
    const sel = e.target.closest?.('.po-place');
    if (sel) sel.parentElement.querySelector('.po-place-text').hidden = Boolean(sel.value);
  });
  root.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-rank-tab]');
    if (tab) {
      rankTab = tab.dataset.rankTab;
      return drawRanking();
    }
    const semBtn = e.target.closest('[data-sem-act]');
    if (semBtn) {
      if (!window.confirm('이 학기를 지울까요?')) return;
      return run({ action: 'semesterDelete', id: Number(semBtn.closest('[data-sem]').dataset.sem) }, '학기를 지웠어요');
    }
    const btn = e.target.closest('[data-poll-act]');
    if (!btn) return;
    const act = btn.dataset.pollAct;
    if (act === 'row-add') {
      const rows = root.querySelector('#pf-rows');
      if (rows.children.length >= MAX_OPTIONS) return showToast(`후보는 ${MAX_OPTIONS}개까지예요`);
      return rows.insertAdjacentHTML('beforeend', optionRow());
    }
    if (act === 'row-del') return btn.closest('.po-row').remove();
    const card = btn.closest('[data-poll]');
    const id = Number(card?.dataset.poll);
    const poll = getData().polls?.find((p) => p.id === id);
    if (!poll) return;
    switch (act) {
      case 'vote': {
        const picks = [...card.querySelectorAll('[data-pick]:checked')].map((c) => Number(c.dataset.pick));
        return run({ action: 'pollVote', id, picks }, picks.length ? '되는 날을 저장했어요 ✔️' : '체크를 모두 지웠어요');
      }
      case 'share':
        try {
          await navigator.clipboard.writeText(pollShareText(poll, pageUrl()));
          return showToast('공유 문구를 복사했어요. 카톡에 붙여넣어 주세요 📋', 'good', 4000);
        } catch {
          return window.prompt('아래 문구를 복사해 주세요', pollShareText(poll, pageUrl()));
        }
      case 'close':
        return run({ action: 'pollClose', id, closed: poll.status !== 'closed' }, poll.status === 'closed' ? '다시 열었어요' : '마감했어요');
      case 'delete':
        if (!window.confirm('이 날짜 투표를 지울까요?')) return;
        return run({ action: 'pollDelete', id }, '날짜 투표를 지웠어요');
      case 'decide': {
        const opt = poll.options.find((o) => o.id === Number(btn.dataset.opt));
        const title = window.prompt(`${whenText(opt)}로 정하고 훈련 일정을 만들까요? 일정 제목:`, '목요 정기 훈련');
        if (title === null) return;
        return run({ action: 'pollDecide', id, option: opt.id, title }, '날짜를 정했어요! 훈련 일정이 만들어졌어요 📅 (참석 투표를 알려 주세요)');
      }
      default:
    }
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id === 'poll-form') {
      e.preventDefault();
      const options = [...root.querySelectorAll('#pf-rows .po-row')].map((row) => ({
        starts_at: fromLocalInput(row.querySelector('.po-time').value),
        place: row.querySelector('.po-place').value || row.querySelector('.po-place-text').value,
      }));
      return run(
        {
          action: 'pollCreate',
          poll: { title: root.querySelector('#pf-title').value, memo: root.querySelector('#pf-memo').value, deadline: fromLocalInput(root.querySelector('#pf-deadline').value), options },
        },
        '날짜 투표를 만들었어요 🗓️ 카톡 공유 문구로 알려 주세요',
      );
    }
    if (e.target.id === 'sem-form') {
      e.preventDefault();
      return run(
        { action: 'semesterSave', semester: { name: root.querySelector('#sem-name').value, starts_on: root.querySelector('#sem-start').value, ends_on: root.querySelector('#sem-end').value } },
        '학기를 저장했어요',
      );
    }
  });

  return {
    draw() {
      drawPolls();
      drawRanking();
    },
  };
}
