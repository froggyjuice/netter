// 허브 화면: 🏠 홈 · ⚙️ 운영진 (회원 · 일정 · 투표는 동아리 앱이 맡는다)
// ctx: { hub, showToast, todayRule: { html(), setup() } }
import { HUB_ERROR_TEXT } from './hub-client.js';
import { CLUB_APP_URL } from '../config.js';
import { icon } from '../ui/lucide.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const errText = (err) => HUB_ERROR_TEXT[err?.code] ?? '잠시 뒤 다시 시도해 주세요.';
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const BRAG_LABELS = Object.freeze({
  'snake-badges': '🐍 존 스네이크 배지 전부',
  'rhythm-badges': '🎯 리듬 슈팅 배지 전부',
  'pass-stars': '🧩 패스 퍼즐 별 전부',
});

/** 🏠 홈 */
export function renderHome(el, { hub, todayRule }) {
  el.innerHTML = `
    <section class="hero">
      <p class="smallcaps">NETTER PLAYGROUND</p>
      <h2 class="hero-title">넷볼 규칙, 게임으로 익혀요</h2>
      <p class="hero-sub">포지션 구역 · 3초 룰 · 골 서클 슈팅을 놀면서 배우는 연습장이에요.</p>
      <a class="lime" href="#/snake">${icon('Gamepad2')} 게임하러가기!</a>
    </section>
    <div class="tiles">
      <a class="tile" href="#/board"><span class="tile-ico">${icon('Trophy', 22)}</span><strong>랭킹 · 댓글</strong><small>기록과 한마디</small></a>
      <a class="tile" href="#/rules"><span class="tile-ico">${icon('BookOpen', 22)}</span><strong>넷볼 규칙 사전</strong><small>Rule 1~21 요약 · 근거 원문 · 형광펜</small></a>
    </div>
    ${todayRule.html()}
    <a class="paper club-card" href="${CLUB_APP_URL}" target="_blank" rel="noopener">
      <span class="club-ico">${icon('CalendarDays', 22)}</span>
      <span><b>훈련 일정 · 참석 투표 · 공지</b><small>동아리 앱에서 확인해요</small></span>
      ${icon('ExternalLink', 16)}
    </a>`;
  todayRule.setup();
  // 회장님이 보낸 축하 (이 기기에서 자랑한 것)
  hub
    .newCheers()
    .then((cheers) => {
      if (!cheers.length || !el.isConnected || el.querySelector('.cheer-box')) return;
      el.querySelector('.hero')?.insertAdjacentHTML(
        'afterend',
        `<div class="cheer-box paper">
          <p class="cheer-title">🎉 회장님이 축하를 보냈어요!</p>
          ${cheers.map((c) => `<p>${BRAG_LABELS[c.kind] ?? ''} — <b>“${esc(c.cheer)}”</b></p>`).join('')}
          <button type="button" class="btn small" id="cheer-ok">고마워요 💚</button>
        </div>`,
      );
      el.querySelector('#cheer-ok').addEventListener('click', () => {
        el.querySelector('.cheer-box')?.remove();
        hub.cheersSeen(cheers);
      });
    })
    .catch(() => {});
}

/** ⚙️ 운영진: 운영진 코드 하나로 연다 (받은 메시지 · 자랑 목록) */
export async function renderAdmin(el, { hub, showToast }) {
  const CODE_KEY = 'netball.adminCode';
  let code = '';
  try {
    code = sessionStorage.getItem(CODE_KEY) ?? '';
  } catch {
    code = '';
  }
  el.innerHTML = `
    <div class="intro-head"><h2>${icon('Settings', 20)} 운영진</h2></div>
    <p class="muted small">운영진 코드를 아는 사람만 열 수 있어요. 회원 · 일정 관리는 <a href="${CLUB_APP_URL}" target="_blank" rel="noopener">동아리 앱 ↗</a>에서 해요.</p>
    <form class="admin-code" id="admin-code-form">
      <label>운영진 코드 <input id="admin-code" type="password" autocomplete="off" value="${esc(code)}" /></label>
      <button class="btn small primary" type="submit">열기</button>
    </form>
    <div id="admin-body" hidden>
      <section class="admin-box" id="report-list"></section>
      <section class="brag-list" id="brag-list"></section>
    </div>`;
  const body = el.querySelector('#admin-body');
  const needSql = (title, what) => `<h3>${title}</h3><p class="muted small">${what}을(를) 쓰려면 Supabase SQL Editor 에서 schema.sql 의 새 부분을 한 번 실행해 주세요.</p>`;

  // 🏆 회장에게 자랑하기 목록 (보면 '새 자랑' 표시가 꺼진다)
  const renderBrags = (brags) => {
    const box = el.querySelector('#brag-list');
    if (brags == null || brags.some((b) => b.name === undefined)) return void (box.innerHTML = needSql('🏆 자랑 목록', '자랑 목록'));
    const fresh = brags.filter((b) => !b.seen).length;
    box.innerHTML = `<h3>🏆 자랑 목록 <small>${fresh ? `새 자랑 ${fresh}개` : ''}</small></h3>${
      brags.length
        ? `<ul>${brags
            .map(
              (b) => `<li data-brag-id="${b.id}" class="${b.seen ? '' : 'new'}">${b.seen ? '' : '<span class="new-tag">NEW</span>'}<b>${esc(b.name ?? '(이름 없음)')}</b> · ${BRAG_LABELS[b.kind] ?? esc(b.kind)} <span class="muted small">${fmtTime(b.created_at)}</span>
                ${b.cheered_at
                  ? `<br /><span class="small">🎉 축하 보냄 ${fmtTime(b.cheered_at)} · “${esc(b.cheer ?? '')}”</span>`
                  : `<span class="cheer-row"><input class="cheer-input" maxlength="100" placeholder="한마디 (비우면 '정말 대단해요! 축하해요 🎉')" /><button type="button" class="btn small" data-cheer>🎉 축하 보내기</button></span>`}
              </li>`,
            )
            .join('')}</ul>`
        : '<p class="muted small">아직 자랑이 없어요. 배지나 별을 모두 모은 사람이 자랑하면 여기에 보여요.</p>'
    }`;
    if (fresh) hub.adminBragsSeen(code).catch(() => {});
  };

  // 💬 받은 메시지 (오류 · 의견): 새 메시지 / 처리됨, 처리 완료 + 메모
  let reports = [];
  let reportTab = 'new';
  const KIND = { bug: '🐞 오류', idea: '💡 의견' };
  const metaText = (m) => (m ? [m.page && `화면 ${m.page}`, m.position, m.viewport, m.error && `오류: ${m.error}`].filter(Boolean).join(' · ') : '');
  const renderReports = (list) => {
    if (list !== undefined) reports = list;
    const box = el.querySelector('#report-list');
    if (reports == null || reports.some((r) => r.status === undefined)) return void (box.innerHTML = needSql('💬 받은 메시지', '메시지 처리'));
    const fresh = reports.filter((r) => r.status === 'new');
    const shown = reportTab === 'new' ? fresh : reports.filter((r) => r.status === 'done');
    box.innerHTML = `<h3>💬 받은 메시지 (오류 · 의견)</h3>
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

  el.querySelector('#brag-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-cheer]');
    if (!btn) return;
    const li = btn.closest('[data-brag-id]');
    btn.disabled = true;
    try {
      await hub.adminCheer(code, Number(li.dataset.bragId), li.querySelector('.cheer-input').value);
      showToast(`${li.querySelector('b').textContent} 님에게 축하를 보냈어요 🎉 (자랑한 기기에서 홈에 들어오면 보여요)`, 'good');
      await load();
    } catch (err) {
      showToast(errText(err), 'bad');
      btn.disabled = false;
    }
  });

  const load = async () => {
    try {
      const out = await hub.adminList(code);
      renderReports(out.reports);
      renderBrags(out.brags);
      try {
        sessionStorage.setItem(CODE_KEY, code);
      } catch {
        /* 저장 못 해도 동작 */
      }
      body.hidden = false;
    } catch (err) {
      body.hidden = true;
      showToast(errText(err), 'bad');
    }
  };
  el.querySelector('#admin-code-form').addEventListener('submit', (e) => {
    e.preventDefault();
    code = el.querySelector('#admin-code').value.trim();
    load();
  });
  if (code) load();
}
