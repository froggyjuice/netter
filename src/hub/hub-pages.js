// 동아리 허브 화면: 🏠 홈 · 📅 캘린더(2단계 예정) · 👤 내 정보 · ⚙️ 운영진
// ctx: { hub, showToast, onSavesChanged(), openLogin() }
import { SAVE_LABELS, isEmptySave } from '../shared/save-bundle.js';
import { HUB_ERROR_TEXT } from './hub-client.js';
import { parseDelimited, rowsToMembers, IMPORT_ERROR_TEXT, TEMPLATE_CSV, MAX_IMPORT } from '../shared/member-import.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const errText = (err) => HUB_ERROR_TEXT[err?.code] ?? '잠시 뒤 다시 시도해 주세요.';
const fmtPhone = (p) => String(p).replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 🏠 홈 */
export function renderHome(el, { hub, openLogin }) {
  const me = hub.session?.member;
  el.innerHTML = `
    <div class="intro-head"><h2>🏠 홈</h2></div>
    <p class="hub-hello">${me ? `👋 <b>${esc(me.name)}</b>님, 반가워요!` : '👋 반가워요! 동아리 회원은 이름과 전화번호로 로그인할 수 있어요.'}</p>
    ${me ? '' : '<p><button type="button" class="btn primary" id="home-login">🔑 로그인</button></p>'}
    <div class="hub-cards">
      <a class="hub-card soon" href="#/calendar"><span class="i">📅</span><b>훈련 캘린더</b><small>훈련 일정 · 참석 투표 — 곧 만나요</small></a>
      <a class="hub-card" href="#/snake"><span class="i">🎮</span><b>넷볼 놀이터</b><small>존 스네이크 · 리듬 슈팅 · 패스 퍼즐</small></a>
      <a class="hub-card" href="#/rules"><span class="i">📖</span><b>넷볼 규칙 사전</b><small>Rule 1~21 요약</small></a>
      <a class="hub-card" href="#/board"><span class="i">🏆</span><b>랭킹 · 댓글</b><small>놀이터 기록과 한마디</small></a>
      ${me ? '<a class="hub-card" href="#/me"><span class="i">👤</span><b>내 정보</b><small>놀이터 기록 저장 위치</small></a>' : ''}
      ${hub.isAdmin() ? '<a class="hub-card" href="#/admin"><span class="i">⚙️</span><b>운영진</b><small>회원 명단 관리</small></a>' : ''}
    </div>`;
  el.querySelector('#home-login')?.addEventListener('click', openLogin);
  // 운영진: 아직 처리 안 한 가입 요청 · 메시지 · 자랑이 있으면 알림
  if (hub.isAdmin()) {
    hub
      .me()
      .then((out) => {
        const parts = [
          out?.new_joins > 0 && `📝 가입 요청 <b>${out.new_joins}</b>`,
          out?.new_reports > 0 && `💬 메시지 <b>${out.new_reports}</b>`,
          out?.new_brags > 0 && `🏆 자랑 <b>${out.new_brags}</b>`,
        ].filter(Boolean);
        if (!parts.length || !el.isConnected || el.querySelector('.brag-alert')) return;
        el.querySelector('.hub-hello')?.insertAdjacentHTML(
          'afterend',
          `<a class="brag-alert" href="#/admin">🔔 새 소식: ${parts.join(' · ')} — 운영진 화면에서 보기 ›</a>`,
        );
      })
      .catch(() => {});
  }
}

export const BRAG_LABELS = Object.freeze({
  'snake-badges': '🐍 존 스네이크 배지 전부',
  'rhythm-badges': '🎯 리듬 슈팅 배지 전부',
  'pass-stars': '🧩 패스 퍼즐 별 전부',
});

/** 📅 캘린더 (2단계에서 만든다) */
export function renderCalendar(el) {
  el.innerHTML = `
    <div class="intro-head"><h2>📅 훈련 캘린더</h2></div>
    <p class="dev-badge">🛠️ 다음 단계에서 만들어요</p>
    <div class="dev-plan"><b>🗺️ 만들 기능</b><ul>
      <li>월 달력 · 목록으로 훈련 일정 보기, 일정마다 <b>📅 내 캘린더에 추가</b></li>
      <li>일정별 참석 투표(참석 · 불참 · 미정 + 한마디), 참석 명단은 회원 모두에게 공개</li>
      <li>운영진이 인원을 확정하면 포지션을 랜덤 배정 (희망 포지션 가능, 7명이 넘으면 넓은 구역 순으로 교체)</li>
      <li>날짜 정하기 투표 · 카톡 공유 링크 · 출석률 순위(1~3위 공개)</li>
    </ul></div>`;
}

/** 👤 내 정보: 놀이터 기록 저장 위치 (이 기기 / 내 계정) 고르기 · 옮기기 */
export async function renderMe(el, { hub, showToast, onSavesChanged, openLogin }) {
  const me = hub.session?.member;
  if (!me) {
    el.innerHTML = `<div class="intro-head"><h2>👤 내 정보</h2></div>
      <p>로그인하면 놀이터 기록을 계정에도 저장할 수 있어요.</p>
      <p><button type="button" class="btn primary" id="me-login">🔑 로그인</button></p>`;
    el.querySelector('#me-login').addEventListener('click', openLogin);
    return;
  }
  el.innerHTML = `
    <div class="intro-head"><h2>👤 내 정보</h2><button type="button" class="btn small ghost" id="me-logout">로그아웃</button></div>
    <p class="hub-hello"><b>${esc(me.name)}</b> <span class="role-badge" data-role="${me.role}">${me.role === 'admin' ? '운영진' : '회원'}</span>
      ${hub.isAdmin() ? '<a class="btn small" href="#/admin">⚙️ 운영진 화면</a>' : ''}</p>
    <section class="save-box">
      <h3>💾 놀이터 기록 저장 위치</h3>
      <p class="muted small">저장하는 기록: ${Object.values(SAVE_LABELS).join(' · ')}</p>
      <div class="save-modes" role="radiogroup" aria-label="기록 저장 위치">
        <label><input type="radio" name="save-mode" value="device" /> <b>📱 이 기기에만</b><small>이 브라우저에만 남아요. 다른 기기에서는 안 보여요.</small></label>
        <label><input type="radio" name="save-mode" value="account" /> <b>☁️ 내 계정에도</b><small>기록이 바뀔 때마다 계정에 저장돼요. 다른 기기에서 로그인하면 이어서 할 수 있어요.</small></label>
      </div>
      <p class="small" id="save-status">계정 기록 확인 중…</p>
      <div class="row">
        <button type="button" class="btn small" id="save-up">⬆️ 기기 기록을 계정으로 업로드</button>
        <button type="button" class="btn small" id="save-down">⬇️ 계정 기록을 이 기기로 다운로드</button>
      </div>
      <p class="muted small">옮기면 받는 쪽의 기록을 덮어써요.</p>
    </section>`;
  el.querySelector('#me-logout').addEventListener('click', () => {
    hub.logout();
    showToast('로그아웃했어요', 'good');
    location.hash = '#/home';
  });
  const status = el.querySelector('#save-status');
  const radios = [...el.querySelectorAll('input[name="save-mode"]')];
  const syncRadios = () => radios.forEach((r) => (r.checked = r.value === hub.saveMode));
  syncRadios();

  let account = null;
  const showStatus = () => {
    status.textContent = account && !isEmptySave(account.data) ? `☁️ 계정에 저장된 기록이 있어요 (마지막 저장 ${fmtTime(account.updated_at)})` : '☁️ 계정에 저장된 기록이 아직 없어요';
  };
  try {
    account = await hub.accountSave();
    showStatus();
  } catch (err) {
    status.textContent = errText(err);
  }

  const upload = async () => {
    await hub.uploadSave();
    account = await hub.accountSave();
    showStatus();
  };
  const download = async () => {
    const written = await hub.downloadSave();
    onSavesChanged();
    return written;
  };

  radios.forEach((r) =>
    r.addEventListener('change', async () => {
      if (r.value === 'device') {
        hub.setSaveMode('device');
        showToast('이제 기록은 이 기기에만 저장돼요', 'good');
        return;
      }
      try {
        // 계정에 기록이 있으면 무엇을 남길지 묻는다
        if (account && !isEmptySave(account.data)) {
          if (window.confirm('계정에 저장된 기록이 있어요.\n[확인] 계정 기록을 이 기기로 가져오기\n[취소] 이 기기 기록으로 계정 덮어쓰기')) await download();
          else await upload();
        } else {
          await upload();
        }
        hub.setSaveMode('account');
        showToast('이제 기록이 계정에도 저장돼요 ☁️', 'good');
      } catch (err) {
        syncRadios();
        showToast(errText(err), 'bad');
      }
    }),
  );
  el.querySelector('#save-up').addEventListener('click', async () => {
    if (account && !isEmptySave(account.data) && !window.confirm('계정의 기록을 이 기기 기록으로 덮어쓸까요?')) return;
    try {
      await upload();
      showToast('이 기기 기록을 계정에 저장했어요 ⬆️', 'good');
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  });
  el.querySelector('#save-down').addEventListener('click', async () => {
    if (!account || isEmptySave(account.data)) {
      showToast('계정에 저장된 기록이 없어요', 'bad');
      return;
    }
    if (!window.confirm('이 기기의 기록을 계정 기록으로 덮어쓸까요?')) return;
    try {
      await download();
      showToast('계정 기록을 이 기기로 가져왔어요 ⬇️', 'good');
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  });
}

/** ⚙️ 운영진: 회원 명단 (연락처는 여기서만 보인다) */
export async function renderAdmin(el, { hub, showToast }) {
  if (!hub.isAdmin()) {
    el.innerHTML = '<div class="intro-head"><h2>⚙️ 운영진</h2></div><p>운영진만 볼 수 있어요.</p>';
    return;
  }
  const CODE_KEY = 'netball.adminCode';
  let code = '';
  try {
    code = sessionStorage.getItem(CODE_KEY) ?? '';
  } catch {
    code = '';
  }
  el.innerHTML = `
    <div class="intro-head"><h2>⚙️ 운영진 · 회원 명단</h2></div>
    <p class="muted small">회원 연락처는 이 화면에서만 보여요. 등록된 회원은 이름 + 전화번호로 바로 로그인해요.</p>
    <form class="admin-code" id="admin-code-form">
      <label>운영진 코드 <input id="admin-code" type="password" autocomplete="off" value="${esc(code)}" /></label>
      <button class="btn small" type="submit">확인</button>
    </form>
    <div id="admin-body" hidden>
      <section class="admin-box" id="join-list"></section>
      <section class="admin-box" id="report-list"></section>
      <section class="brag-list" id="brag-list"></section>
      <form class="admin-add" id="admin-add">
        <h3 id="admin-form-title">➕ 회원 등록</h3>
        <input id="m-name" placeholder="이름" maxlength="20" required />
        <input id="m-phone" placeholder="휴대폰 010-0000-0000" inputmode="tel" required />
        <select id="m-role"><option value="member">회원</option><option value="admin">운영진</option></select>
        <button class="btn primary small" type="submit" id="m-submit">등록</button>
        <button class="btn ghost small" type="button" id="m-cancel" hidden>취소</button>
      </form>
      <details class="bulk" id="bulk">
        <summary>📥 엑셀로 한꺼번에 등록</summary>
        <p class="small">엑셀에 <b>이름 · 전화번호 · 역할</b>(역할은 비우면 회원) 칸을 만들고, 파일을 올리거나 표를 복사해 아래에 붙여넣으세요. 한 번에 ${MAX_IMPORT}명까지.</p>
        <div class="row bulk-row">
          <button type="button" class="btn small ghost" id="bulk-template">📄 양식 받기</button>
          <label class="btn small ghost bulk-file">📂 파일 고르기 (.xlsx · .csv)<input type="file" id="bulk-file" accept=".xlsx,.csv,.txt" hidden /></label>
        </div>
        <textarea id="bulk-text" rows="5" placeholder="엑셀에서 표를 복사해 여기에 붙여넣기&#10;예) 이름	전화번호	역할&#10;홍길동	010-1234-5678	회원"></textarea>
        <button type="button" class="btn small" id="bulk-preview">👀 미리보기</button>
        <div id="bulk-result" hidden>
          <p class="small" id="bulk-summary"></p>
          <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>줄</th><th>이름</th><th>전화번호</th><th>역할</th><th>확인</th></tr></thead><tbody id="bulk-rows"></tbody></table></div>
          <button type="button" class="btn primary small" id="bulk-go">✅ 등록하기</button>
        </div>
      </details>
      <p class="small" id="admin-count"></p>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>이름</th><th>전화번호</th><th>역할</th><th>상태</th><th></th></tr></thead><tbody id="admin-rows"></tbody></table></div>
    </div>`;
  const body = el.querySelector('#admin-body');
  const rows = el.querySelector('#admin-rows');
  let members = [];
  let editing = null; // 수정 중인 회원 id

  const render = () => {
    const active = members.filter((m) => m.active);
    el.querySelector('#admin-count').textContent = `활동 중 ${active.length}명 (운영진 ${active.filter((m) => m.role === 'admin').length}명) · 전체 ${members.length}명`;
    rows.innerHTML = members
      .map(
        (m) => `<tr data-id="${m.id}" class="${m.active ? '' : 'inactive'}">
          <td><b>${esc(m.name)}</b></td><td>${fmtPhone(m.phone)}</td>
          <td><span class="role-badge" data-role="${m.role}">${m.role === 'admin' ? '운영진' : '회원'}</span></td>
          <td>${m.active ? '활동' : '쉬는 중'}</td>
          <td class="acts"><button type="button" class="btn small ghost" data-act="edit">수정</button>
            <button type="button" class="btn small ghost" data-act="role">${m.role === 'admin' ? '회원으로' : '운영진으로'}</button>
            <button type="button" class="btn small ghost" data-act="active">${m.active ? '쉬게 하기' : '다시 활동'}</button></td></tr>`,
      )
      .join('');
  };
  // 🏆 회장에게 자랑하기 목록 (보면 홈 알림이 꺼진다)
  const renderBrags = (brags) => {
    const box = el.querySelector('#brag-list');
    if (brags == null) {
      box.innerHTML = '<h3>🏆 자랑 목록</h3><p class="muted small">자랑 목록을 쓰려면 Supabase SQL Editor 에서 schema.sql 의 brags 테이블을 한 번 만들어 주세요.</p>';
      return;
    }
    const fresh = brags.filter((b) => !b.seen).length;
    box.innerHTML = `<h3>🏆 자랑 목록 <small>${fresh ? `새 자랑 ${fresh}개` : ''}</small></h3>${
      brags.length
        ? `<ul>${brags
            .map((b) => `<li class="${b.seen ? '' : 'new'}">${b.seen ? '' : '<span class="new-tag">NEW</span>'}<b>${esc(b.name)}</b> · ${BRAG_LABELS[b.kind] ?? esc(b.kind)} <span class="muted small">${fmtTime(b.created_at)}</span></li>`)
            .join('')}</ul>`
        : '<p class="muted small">아직 자랑이 없어요. 배지나 별을 모두 모은 회원이 자랑하면 여기에 보여요.</p>'
    }`;
    if (fresh) hub.adminBragsSeen(code).catch(() => {});
  };
  // 📝 가입 승인 요청
  const needSql = (title, what) => `<h3>${title}</h3><p class="muted small">${what}을(를) 쓰려면 Supabase SQL Editor 에서 schema.sql 의 새 부분을 한 번 실행해 주세요.</p>`;
  const JOIN_STATUS = { approved: '✅ 승인함', rejected: '✖ 거절함' };
  const renderJoins = (joins) => {
    const box = el.querySelector('#join-list');
    if (joins == null) return void (box.innerHTML = needSql('📝 가입 승인 요청', '가입 승인 요청'));
    const pending = joins.filter((j) => j.status === 'pending');
    const done = joins.filter((j) => j.status !== 'pending').slice(0, 10);
    const row = (j) => `<li data-join="${j.id}" class="${j.status}">
        <b>${esc(j.name)}</b> · ${fmtPhone(j.phone)} <span class="muted small">${fmtTime(j.created_at)}</span>
        ${j.message ? `<br /><span class="small">“${esc(j.message)}”</span>` : ''}
        ${j.status === 'pending'
          ? `<span class="admin-acts"><button type="button" class="btn small primary" data-join-act="approve">✅ 승인</button><button type="button" class="btn small ghost" data-join-act="reject">✖ 거절</button></span>`
          : ` <span class="muted small">${JOIN_STATUS[j.status] ?? ''}</span>`}
      </li>`;
    box.innerHTML = `<h3>📝 가입 승인 요청 <small>${pending.length ? `대기 ${pending.length}명` : ''}</small></h3>${
      pending.length ? `<ul>${pending.map(row).join('')}</ul>` : '<p class="muted small">기다리는 요청이 없어요. 등록되지 않은 이름 + 번호로 로그인하려던 사람이 요청하면 여기에 보여요.</p>'
    }${done.length ? `<details><summary class="small">처리한 요청 ${done.length}개</summary><ul>${done.map(row).join('')}</ul></details>` : ''}`;
  };
  el.querySelector('#join-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-join-act]');
    if (!btn) return;
    const li = btn.closest('[data-join]');
    const name = li.querySelector('b').textContent;
    const act = btn.dataset.joinAct;
    if (!window.confirm(act === 'approve' ? `${name} 님을 회원으로 등록할까요?` : `${name} 님의 요청을 거절할까요?`)) return;
    btn.disabled = true;
    try {
      await hub.adminJoin(code, Number(li.dataset.join), act);
      showToast(act === 'approve' ? `${name} 님을 회원으로 등록했어요. 이제 로그인할 수 있어요` : `${name} 님의 요청을 거절했어요`, 'good');
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
      btn.disabled = false;
    }
  });

  // 💬 받은 메시지 (오류 · 아이디어): 새 메시지 / 처리됨, 처리 완료 + 메모
  let reports = [];
  let reportTab = 'new';
  const KIND = { bug: '🐞 오류', idea: '💡 아이디어' };
  const metaText = (m) => (m ? [m.page && `화면 ${m.page}`, m.position, m.viewport, m.error && `오류: ${m.error}`].filter(Boolean).join(' · ') : '');
  const renderReports = (list) => {
    if (list !== undefined) reports = list;
    const box = el.querySelector('#report-list');
    if (reports == null || reports.some((r) => r.status === undefined)) return void (box.innerHTML = needSql('💬 받은 메시지', '메시지 처리'));
    const fresh = reports.filter((r) => r.status === 'new');
    const shown = reportTab === 'new' ? fresh : reports.filter((r) => r.status === 'done');
    box.innerHTML = `<h3>💬 받은 메시지 (오류 · 아이디어)</h3>
      <div class="report-tabs" role="tablist">
        <button type="button" class="chip" data-rtab="new" aria-pressed="${reportTab === 'new'}">새 메시지 ${fresh.length}</button>
        <button type="button" class="chip" data-rtab="done" aria-pressed="${reportTab === 'done'}">처리됨 ${reports.length - fresh.length}</button>
      </div>
      ${shown.length
        ? `<ul class="report-items">${shown
            .map(
              (r) => `<li data-report="${r.id}">
                <div><b>${KIND[r.kind] ?? esc(r.kind)}</b> <span class="muted small">${fmtTime(r.created_at)}</span></div>
                <p class="report-text">${esc(r.message)}</p>
                ${metaText(r.meta) ? `<p class="muted small">${esc(metaText(r.meta))}</p>` : ''}
                ${r.status === 'new'
                  ? `<div class="report-acts"><input class="report-note" maxlength="200" placeholder="메모 (선택) 예) 다음 업데이트에 고침" /><button type="button" class="btn small primary" data-report-act="done">✅ 처리 완료</button></div>`
                  : `<p class="small">✅ 처리함 ${fmtTime(r.done_at)}${r.note ? ` · 📝 ${esc(r.note)}` : ''} <button type="button" class="btn small ghost" data-report-act="new">↩️ 되돌리기</button></p>`}
              </li>`,
            )
            .join('')}</ul>`
        : `<p class="muted small">${reportTab === 'new' ? '새 메시지가 없어요 👍' : '처리한 메시지가 아직 없어요.'}</p>`}`;
  };
  el.querySelector('#report-list').addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-rtab]');
    if (tab) {
      reportTab = tab.dataset.rtab;
      return renderReports();
    }
    const btn = e.target.closest('[data-report-act]');
    if (!btn) return;
    const li = btn.closest('[data-report]');
    const status = btn.dataset.reportAct;
    const note = li.querySelector('.report-note')?.value;
    btn.disabled = true;
    try {
      const { report } = await hub.adminReport(code, Number(li.dataset.report), status, status === 'done' ? note ?? '' : undefined);
      reports = reports.map((r) => (r.id === report.id ? { ...r, ...report } : r));
      renderReports();
      showToast(status === 'done' ? '처리 완료로 옮겼어요 ✅' : '새 메시지로 되돌렸어요', 'good');
    } catch (err) {
      showToast(errText(err), 'bad');
      btn.disabled = false;
    }
  });

  const load = async () => {
    try {
      const out = await hub.adminList(code);
      members = out.members;
      renderJoins(out.joins);
      renderReports(out.reports);
      renderBrags(out.brags);
      try {
        sessionStorage.setItem(CODE_KEY, code);
      } catch {
        /* 저장 못 해도 동작 */
      }
      body.hidden = false;
      render();
    } catch (err) {
      body.hidden = true;
      showToast(errText(err), 'bad');
    }
  };
  const resetForm = () => {
    editing = null;
    el.querySelector('#admin-add').reset();
    el.querySelector('#admin-form-title').textContent = '➕ 회원 등록';
    el.querySelector('#m-submit').textContent = '등록';
    el.querySelector('#m-cancel').hidden = true;
    el.querySelector('#m-role').disabled = false;
  };

  el.querySelector('#admin-code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    code = el.querySelector('#admin-code').value.trim();
    load();
  });
  el.querySelector('#m-cancel').addEventListener('click', resetForm);
  el.querySelector('#admin-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el.querySelector('#m-name').value;
    const phone = el.querySelector('#m-phone').value;
    try {
      if (editing) {
        await hub.adminUpdate(code, { id: editing, name, phone });
        showToast(`${name.trim()} 정보를 고쳤어요`, 'good');
      } else {
        await hub.adminAdd(code, { name, phone, role: el.querySelector('#m-role').value });
        showToast(`${name.trim()} 님을 등록했어요`, 'good');
      }
      resetForm();
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  });
  rows.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const m = members.find((x) => x.id === Number(btn.closest('tr').dataset.id));
    try {
      if (btn.dataset.act === 'edit') {
        editing = m.id;
        el.querySelector('#m-name').value = m.name;
        el.querySelector('#m-phone').value = fmtPhone(m.phone);
        el.querySelector('#m-role').value = m.role;
        el.querySelector('#m-role').disabled = true; // 역할은 옆 버튼으로
        el.querySelector('#admin-form-title').textContent = `✏️ ${m.name} 정보 고치기`;
        el.querySelector('#m-submit').textContent = '저장';
        el.querySelector('#m-cancel').hidden = false;
        el.querySelector('#m-name').focus();
        return;
      }
      if (btn.dataset.act === 'role') await hub.adminUpdate(code, { id: m.id, role: m.role === 'admin' ? 'member' : 'admin' });
      if (btn.dataset.act === 'active') await hub.adminUpdate(code, { id: m.id, active: !m.active });
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
    }
  });
  // ----- 엑셀 일괄 등록 -----
  let preview = [];
  const bulkText = el.querySelector('#bulk-text');
  const showPreview = (rows) => {
    preview = rowsToMembers(rows, members.map((m) => m.phone));
    const ok = preview.filter((p) => !p.error);
    el.querySelector('#bulk-result').hidden = false;
    el.querySelector('#bulk-summary').textContent = preview.length
      ? `${preview.length}줄 중 ${ok.length}명 등록할 수 있어요${preview.length > ok.length ? ` · ${preview.length - ok.length}줄은 건너뛰어요` : ''}`
      : '읽을 줄이 없어요. 이름과 전화번호가 있는지 확인해 주세요.';
    el.querySelector('#bulk-rows').innerHTML = preview
      .map((p) => `<tr class="${p.error ? 'bad' : ''}"><td>${p.line}</td><td>${esc(p.name)}</td><td>${esc(p.error === 'bad_phone' ? p.phone : fmtPhone(p.phone))}</td>
        <td>${p.role === 'admin' ? '운영진' : p.role === 'member' ? '회원' : esc(p.role)}</td><td>${p.error ? `⚠️ ${IMPORT_ERROR_TEXT[p.error]}` : '✅'}</td></tr>`)
      .join('');
    const go = el.querySelector('#bulk-go');
    go.disabled = ok.length === 0;
    go.textContent = `✅ ${ok.length}명 등록하기`;
  };
  el.querySelector('#bulk-template').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: '회원명단_양식.csv' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el.querySelector('#bulk-preview').addEventListener('click', () => showPreview(parseDelimited(bulkText.value)));
  el.querySelector('#bulk-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readXlsx } = await import('../ui/xlsx-read.js');
        showPreview(await readXlsx(file));
      } else {
        showPreview(parseDelimited(await file.text()));
      }
      showToast(`${file.name} 을(를) 읽었어요. 미리보기를 확인해 주세요`, 'good');
    } catch {
      showToast('파일을 읽지 못했어요. .xlsx 나 .csv 로 저장하거나, 표를 복사해 붙여넣어 주세요', 'bad');
    }
  });
  el.querySelector('#bulk-go').addEventListener('click', async () => {
    const ok = preview.filter((p) => !p.error);
    if (!ok.length || !window.confirm(`${ok.length}명을 등록할까요?`)) return;
    const go = el.querySelector('#bulk-go');
    go.disabled = true;
    try {
      const { results } = await hub.adminBulk(code, ok.map(({ name, phone, role }) => ({ name, phone, role })));
      const added = results.filter((r) => r.ok).length;
      showToast(`${added}명을 등록했어요${added < results.length ? ` (${results.length - added}명은 이미 등록됐거나 형식이 맞지 않아 건너뜀)` : ''}`, 'good', 5000);
      bulkText.value = '';
      el.querySelector('#bulk-result').hidden = true;
      preview = [];
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
      go.disabled = false;
    }
  });

  if (code) load();
}
