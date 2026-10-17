// 동아리 허브 화면: 🏠 홈 · 📅 캘린더(2단계 예정) · 👤 내 정보 · ⚙️ 운영진
// ctx: { hub, showToast, onSavesChanged(), openLogin() }
import { SAVE_LABELS, isEmptySave } from '../shared/save-bundle.js';
import { HUB_ERROR_TEXT } from './hub-client.js';

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
}

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
        <button type="button" class="btn small" id="save-up">⬆️ 이 기기 기록 → 계정</button>
        <button type="button" class="btn small" id="save-down">⬇️ 계정 기록 → 이 기기</button>
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
      <form class="admin-add" id="admin-add">
        <h3 id="admin-form-title">➕ 회원 등록</h3>
        <input id="m-name" placeholder="이름" maxlength="20" required />
        <input id="m-phone" placeholder="휴대폰 010-0000-0000" inputmode="tel" required />
        <select id="m-role"><option value="member">회원</option><option value="admin">운영진</option></select>
        <button class="btn primary small" type="submit" id="m-submit">등록</button>
        <button class="btn ghost small" type="button" id="m-cancel" hidden>취소</button>
      </form>
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
  const load = async () => {
    try {
      members = (await hub.adminList(code)).members;
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
  if (code) load();
}
