// 허브: 탭 · 게임 설명 카드 · 시작 → 게임 → 결과/닉네임 등록 · 리더보드
import './fonts.css';
import './style.css';
import { FONT } from './shared/theme.js';
import { installErrorLogging } from './shared/error-log.js';
import { createHubClient, HUB_ERROR_TEXT } from './hub/hub-client.js';
import { renderHome, renderCalendar, renderMe, renderAdmin } from './hub/hub-pages.js';
import { SAVE_KEYS } from './shared/save-bundle.js';
import { SITE_NAME } from './config.js';
import { GAMES } from './games/registry.js';
import { modeFor } from './games/snake-logic.js';
import { createRuleLog } from './shared/rule-notes.js';
import { POSITIONS, POSITION_KEYS, ZONE_NAMES } from './shared/zones.js';
import { submitScore, submitReport, fetchLikes, sendLike, ERROR_TEXT } from './shared/api.js';
import { createBoard } from './ui/board.js';
import { drawCourtPreview } from './ui/court-preview.js';
import * as audio from './shared/audio.js';
import { setupInstall } from './ui/install.js';
import { RULEBOOK, OFFICIAL_RULES_URL, searchRules, chapterOf } from './shared/rulebook.js';
import { HIGHLIGHT_KEY, parseHighlights, addHighlight, removeHighlight, markedHtml, lineKey } from './shared/highlights.js';
import { linkifyRules } from './ui/rule-links.js';
import { drawDevPreview } from './ui/dev-preview.js';
import { drawRuleSceneReady } from './ui/rule-scenes.js';
import { ruleOfDay, dayLabel } from './shared/daily-rule.js';
import { startSnakeTaste } from './ui/snake-taste.js';
import { startRhythmPractice } from './ui/rhythm-practice.js';
import { PASS_STAGES } from './games/pass-stages.js';
import { parseProgress, isUnlocked, totalStars, stageCardsHtml, passRulesHtml, failText } from './ui/pass-ui.js';
import { TEAMMATE_ICON, OPP_ICON, BALL_ICON, ROLL_ICON } from './ui/icons.js';
import { BADGES, parseProfile, applyResult, remainingPositions, progress } from './shared/badges-logic.js';
import {
  RHYTHM_BADGES, rhythmBook, parseRhythmSave, applyRhythmResult, bestFor, serializeRhythmSave,
} from './games/rhythm-records.js';
import {
  RHYTHM_POSITIONS, RHYTHM_RATIO, RHYTHM_BUTTONS, rhythmModeOf,
  rhythmRulesHtml, rhythmHelpHtml, rhythmReviewRows, rhythmHooks,
} from './ui/rhythm-ui.js';

const $ = (sel) => document.querySelector(sel);

// 오류 자동 기록 (/api/log): 닉네임·이름은 보내지 않고 화면 상황만. 한 세션 최대 5개
const errorLog = installErrorLogging({
  getContext: () => ({
    page: (location.hash.replace(/^#\/?/, '') || 'snake').slice(0, 40),
    playing: !document.querySelector('#stage')?.hidden,
    orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ua: navigator.userAgent,
    version: __APP_VERSION__,
  }),
});

// 폰을 세로로 들고 있으면 코트도 세로로 그린다 (터치 기기에서만. PC 창은 항상 가로)
const portraitQuery = matchMedia('(orientation: portrait) and (hover: none), (orientation: portrait) and (pointer: coarse)');
const orientationNow = () => (portraitQuery.matches ? 'portrait' : 'landscape');
const touchQuery = matchMedia('(hover: none), (pointer: coarse)'); // style.css 의 폰 전용 규칙과 같은 조건
document.body.dataset.orient = orientationNow();

// localStorage 는 막혀 있을 수 있으므로 항상 try/catch
let hubReady = false; // store.set 이 허브보다 먼저 불려도 안전하게
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 저장 못 해도 게임은 정상 동작 */
    }
    if (SAVE_KEYS.includes(key)) scheduleAccountSave();
  },
};

// ---------- 동아리 허브: 로그인 · 놀이터 기록 계정 저장 ----------
const hub = createHubClient(store);
hubReady = true;
let accountSaveTimer = 0;
/** 계정 저장 모드면 기록이 바뀐 뒤 잠깐 모아서 한 번에 계정에 올린다 */
function scheduleAccountSave() {
  if (!hubReady || hub.saveMode !== 'account') return;
  clearTimeout(accountSaveTimer);
  accountSaveTimer = setTimeout(() => hub.uploadSave().catch(() => {}), 800);
}

const els = {
  tabs: $('#tabs'),
  intro: $('#intro'),
  stage: $('#stage'),
  board: $('#board'),
  comments: $('#comments'),
  parent: $('#game-parent'),
  over: $('#over'),
  toast: $('#toast'),
  nick: $('#nick'),
  overForm: $('#over-form'),
  overMsg: $('#over-msg'),
  btnSubmit: $('#btn-submit'),
};

document.title = SITE_NAME;
$('#brand').textContent = `🏐 ${SITE_NAME}`;

let current = GAMES[0];
const RANDOM = 'RANDOM'; // 포지션·센터 모드의 '랜덤' 선택 (시작할 때 정해진다)
let position = [...POSITION_KEYS, RANDOM].includes(store.get('netball.pos')) ? store.get('netball.pos') : 'GS';
let ctl = null; // 실행 중인 게임 컨트롤러
let runToken = 0; // 게임 로딩 중 취소 처리용
let result = null;
let submitted = false;
let centreMode = ['attack', 'defence', RANDOM].includes(store.get('netball.cmode')) ? store.get('netball.cmode') : 'attack'; // 센터(C)의 공격/수비 선택
let startPosition = position;
let startMode = centreMode;
let lastSubmitted = null;
let profile = parseProfile(store.get('netball.profile')); // 배지·뛴 포지션 (2단계 로그인 후 saves로 이전)
let passTipShown = false; // 첫 패스 안내는 한 판에 한 번만
let lastBadTurnToast = 0;
let homeDemo = null; // 홈 화면의 맛보기·타이밍 연습 (게임을 시작하거나 화면이 바뀌면 멈춘다)
function stopHomeDemo() {
  homeDemo?.stop();
  homeDemo = null;
}
// 리듬 슈팅: 슈터 GS·GA(공격) · 슈터를 막는 GK·GD(수비) 또는 넷 중 랜덤
let rhythmPos = [...RHYTHM_POSITIONS, RANDOM].includes(store.get('netball.rpos')) ? store.get('netball.rpos') : 'GS';
const isRhythm = () => current.id === 'rhythm';
/** 계정에서 가져온 기록으로 화면의 기록 값을 다시 읽는다 */
function reloadSaves() {
  profile = parseProfile(store.get('netball.profile'));
  passProgress = parseProgress(store.get('netball.pass'));
  rhythmSave = parseRhythmSave(store.get('netball.rhythm'));
}
const isPass = () => current.id === 'pass';
let passProgress = parseProgress(store.get('netball.pass')); // 패스 퍼즐 스테이지별 최고 별
let rhythmMode = 'attack'; // 지금 경기의 모드 (GS·GA 공격 · GK·GD 수비)
let rhythmSave = parseRhythmSave(store.get('netball.rhythm')); // 리듬 슈팅 최고 기록 · 배지 (이 브라우저)
const rhythmDiff = 'normal'; // 난이도는 '보통' 하나로 (쉬움·어려움은 없앰)

// ---------- 공통 ----------
function zoneNote(pos) {
  const p = POSITIONS[pos];
  const names = p.zones.map((z) => ZONE_NAMES[z]).join(', ');
  return `${pos} ${p.name} — 허용 구역 ${p.zones.join('·')} (${names}) · ${p.note}`;
}

const CHIP_ORDER = ['C', 'GS', 'GK', 'GA', 'GD', 'WA', 'WD']; // 첫 줄은 [랜덤 | C]

/** 포지션 색 구분: 공격(진한 초록) · 수비(연한 초록) · 센터(노랑) */
const groupOf = (pos) => (pos === 'C' ? 'centre' : modeFor(pos));

/** 칩 안에 넣는 공격/수비 설명 */
const CHIP_MODE = {
  attack: '⚔️',
  defence: '🛡️',
  centre: '⚔️ 🛡️',
};

/** 랜덤 선택을 실제 포지션·모드로 정한다 */
function resolveChoice(pos, cmode) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const p = pos === RANDOM ? pick(POSITION_KEYS) : pos;
  const m = cmode === RANDOM ? pick(['attack', 'defence']) : cmode;
  return { pos: p, mode: m };
}

const MODE_TEXT = {
  attack: '⚔️ 공격 — 코트의 공을 먹어요',
  defence: '🛡️ 수비 — 굴러오는 공을 막아요',
};

const MAX_TOASTS = 3;
let gameLog = []; // 이번 경기의 알림 기록 (경기 후 '알림 다시 보기')
let ruleLog = createRuleLog(); // 이번 경기에서 겪은 넷볼 규칙 (경기 후 '규칙 복습')

/** 알림: 최대 3개까지 쌓여 보이고 하나씩 사라진다. 경기 중 알림은 기록해 둔다 */
function showToast(text, kind = 'info', ms = 3600) {
  const item = document.createElement('p');
  item.className = 'toast-item';
  item.dataset.kind = kind;
  item.textContent = text;
  els.toast.append(item);
  while (els.toast.children.length > MAX_TOASTS) els.toast.firstElementChild.remove();
  setTimeout(() => {
    item.classList.add('hide');
    setTimeout(() => item.remove(), 300);
  }, ms);
  if (ctl && !els.stage.hidden) gameLog.push({ clock: $('#hud-clock').textContent, text, kind });
}
function clearToasts() {
  els.toast.replaceChildren();
}

/** 교체 안내: 새 포지션이 공격수인지 수비수인지와 뛰는 곳 */
function subMessage(from, to, mode) {
  const role =
    to === 'C'
      ? `공격과 수비를 잇는 센터예요 (지금은 ${mode === 'defence' ? '🛡️ 수비' : '⚔️ 공격'})`
      : mode === 'defence'
        ? '🛡️ 수비수예요. 굴러오는 공을 막아요'
        : '⚔️ 공격수예요. 코트의 공을 먹어요';
  // 폰에서는 안내 줄이 두 줄까지라 구역 설명은 뺀다 (코트의 빨간 선으로 보인다)
  const note = touchQuery.matches ? '' : ` ${POSITIONS[to].note}`;
  return `포지션 변경: ${from} → ${to} · ${to}(${POSITIONS[to].name})는 ${role}.${note}`;
}

// ---------- 탭 / 라우팅 ----------
/** activeId: 선택된 게임 탭 (랭킹·댓글 페이지에서는 null) */
function renderTabs(activeId = current.id) {
  els.tabs.replaceChildren(
    ...GAMES.map((g) => {
      const a = document.createElement('a');
      a.className = 'tab';
      a.href = `#/${g.id}`;
      a.textContent = `${g.icon} ${g.title}`;
      if (g.id === activeId) a.setAttribute('aria-current', 'page');
      if (!g.ready) {
        a.classList.add('dev'); // 개발 중인 게임 탭은 투명하게
        const badge = document.createElement('small');
        badge.textContent = '개발중';
        a.append(badge);
      }
      return a;
    }),
  );
}

function route() {
  if (hlPop) hlPop.hidden = true; // 다른 화면으로 가면 형광펜 버튼 닫기
  const wasPlaying = !els.stage.hidden;
  stopGame();
  const id = location.hash.replace(/^#\/?/, '');
  // 동아리 허브 화면: 홈 · 캘린더 · 내 정보 · 운영진 (주소가 없으면 홈)
  const hubPage = id === '' || id === 'home' ? 'home' : ['calendar', 'me', 'admin'].includes(id) ? id : null;
  syncNav(hubPage ?? (id.startsWith('rules') ? 'rules' : 'play'));
  els.tabs.hidden = Boolean(hubPage) || id.startsWith('rules');
  if (hubPage) {
    document.body.dataset.page = 'hub';
    document.body.dataset.game = '';
    els.board.hidden = true;
    els.comments.hidden = true;
    els.stage.hidden = true;
    els.intro.hidden = false;
    $('#btn-board').setAttribute('aria-current', 'false');
    const ctx = { hub, showToast, onSavesChanged: reloadSaves, openLogin };
    ({ home: renderHome, calendar: renderCalendar, me: renderMe, admin: renderAdmin })[hubPage](els.intro, ctx);
    window.scrollTo(0, 0);
    return;
  }
  const onBoard = id === 'board'; // 랭킹·댓글 페이지
  document.body.dataset.page = onBoard ? 'board' : 'game';
  $('#btn-board').setAttribute('aria-current', onBoard ? 'page' : 'false');
  els.board.hidden = !onBoard;
  els.comments.hidden = !onBoard;
  els.stage.hidden = true;
  els.intro.hidden = onBoard;
  if (onBoard) {
    renderTabs(null);
    board.show();
    window.scrollTo(0, 0);
    return;
  }
  // 넷볼 규칙 사전: #/rules · #/rules/9 (9장이 있는 쪽으로 바로 이동)
  const rulesMatch = /^rules(?:\/(\d+))?$/.exec(id);
  if (rulesMatch) {
    document.body.dataset.page = 'rules';
    document.body.dataset.game = '';
    renderTabs('rules');
    renderRulesPage(rulesMatch[1] ? Number(rulesMatch[1]) : null);
    return;
  }
  current = GAMES.find((g) => g.id === id) ?? GAMES[0];
  document.body.dataset.game = current.id; // 게임별 화면(코트 비율·버튼) 구분
  renderTabs(current.id);
  renderIntro();
  if (wasPlaying) window.scrollTo(0, 0); // 게임 화면에서 돌아오면 맨 위(포지션 선택)부터 보여준다
}
window.addEventListener('hashchange', route);

/** 위쪽 큰 메뉴: 지금 있는 곳 표시 */
function syncNav(section) {
  document.querySelectorAll('#mainnav a').forEach((a) => a.setAttribute('aria-current', a.dataset.nav === section ? 'page' : 'false'));
}

// ---------- 로그인 ----------
const loginDialog = $('#login-dialog');
/** 위쪽 버튼: 로그인 전 '🔑 로그인', 로그인 후 '👤 이름' (내 정보로) */
function syncLoginButton() {
  const me = hub.session?.member;
  $('#btn-login').textContent = me ? `👤 ${me.name}` : '🔑 로그인';
}
function openLogin() {
  $('#login-msg').textContent = '';
  $('#login-send').disabled = false;
  if (typeof loginDialog.showModal === 'function') loginDialog.showModal();
  $('#login-name').focus();
}
$('#btn-login').addEventListener('click', () => {
  if (hub.session) location.hash = '#/me';
  else openLogin();
});
$('#login-cancel').addEventListener('click', () => loginDialog.close());
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-send').disabled = true;
  $('#login-msg').textContent = '확인 중…';
  try {
    const me = await hub.login($('#login-name').value, $('#login-phone').value);
    loginDialog.close();
    syncLoginButton();
    showToast(`👋 ${me.name}님, 반가워요!`, 'good');
    route(); // 지금 화면을 로그인 상태로 다시 그린다
  } catch (err) {
    $('#login-msg').textContent = HUB_ERROR_TEXT[err.code] ?? '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    $('#login-send').disabled = false;
  }
});
window.addEventListener('storage', (e) => {
  if (e.key === 'netball.session') syncLoginButton(); // 다른 탭에서 로그인·로그아웃
});

// ---------- 규칙 설명 (소개 카드와 일시정지 화면이 함께 쓴다) ----------
/** 포지션 / 3초 룰 / 맞수 토글 블록. p: id 접두사 (화면마다 달라야 함) */
function rulesHtml(p) {
  return `
    <div class="info-tabs" role="group" aria-label="규칙 설명">
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-pos">🧭 포지션</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-mode">⚔️ 공격 · 🛡️ 수비</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-pass">⏱️ 3초 룰</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-opp">🥷 맞수</button>
    </div>
    <div class="info-panel" id="${p}-pos" hidden>
      <p>포지션마다 <b>들어갈 수 있는 구역</b>이 달라요.<br />갈 수 없는 곳은 빗금, 그 경계는 <b>빨간 선</b>이에요.</p>
      <p>벽에 닿으면 옆으로 튕겨요.<br />다른 구역에 들어가려 하면 <b>오프사이드 −10점</b>!</p>
      <p>시작은 <b>센터 패스</b>처럼: C만 센터 서드에서, 나머지는 자기 서드에서 출발해요.<br />
        휘슬(3·2·1) 전에 움직이려 하면 <b>브레이킹 반칙(Breaking)</b>이에요.</p>
      <p>${BALL_ICON}공을 5개 모은 뒤 가끔 나오는 <b>교체 아이템</b>을 먹으면 포지션이 바뀌어요.</p>
      <p>⏱️ 경기는 실제처럼 <b>4쿼터</b>예요. 한 쿼터 45초가 실제 15분(시계는 15:00부터)이고, 쿼터 사이에 쉬는 시간이 있어요.<br />
        쿼터마다 <b>진영이 바뀌고</b>(우리 골이 반대편으로), 센터 패스는 두 팀이 <b>번갈아</b> 해요. (Rule 2.1·2.2·8.1)<br />
        목숨은 없어요. 몸에 부딪히면 그 쿼터만 끝나요.</p>
      <p class="muted small">자기 몸에 부딪히면 경기가 끝나요.</p>
    </div>
    <div class="info-panel" id="${p}-mode" hidden>
      <p><b>⚔️ 공격 (GS·GA·WA)</b><br />코트의 ${BALL_ICON}공을 먹으면 <b>+10</b>.<br />GS·GA가 <b>황금색 골 서클</b> 안에서 먹으면 슈팅 성공 <b>+30</b>!</p>
      <p><b>🛡️ 수비 (GK·GD·WD)</b><br />상대 골 쪽에서 굴러오는 ${ROLL_ICON}공을 머리나 몸으로 막으면 <b>+10</b>.<br />GK·GD가 수비 서클 안에서 막으면 <b>+30</b>.<br />공을 놓치면 <b>실점</b>이에요.</p>
      <p><b>🟡 센터 (C)</b><br />공격과 수비 중 골라서 뛰어요.</p>
    </div>
    <div class="info-panel" id="${p}-pass" hidden>
      <p>${BALL_ICON}공을 잡으면 근처에 ${TEAMMATE_ICON}<b>파란 동료</b>가 나타나요.<br />줄어드는 링이 다 사라지기 전, <b>3초 안에</b> 닿으면 패스 성공 <b>+20</b>!<br />연속으로 성공하면 패스 체인이 이어져요.</p>
      <p class="muted small">실제 규칙: 공을 가진 선수는 3초 안에 패스하거나 슛해야 해요 (Rules of Netball 2024, Rule 11.4).<br />
        실제로는 공을 든 채 달릴 수 없지만 게임에서는 단순화했어요.</p>
      <p class="muted small">동료가 너무 가까이 나타나지 않는 건 <b>숏 패스 금지</b> 때문이에요. 패스할 때는 상대가 가로챌 수 있을 만큼 공간이 있어야 해요 (Rule 12.1).</p>
    </div>
    <div class="info-panel" id="${p}-opp" hidden>
      <p>상대 팀 ${OPP_ICON}<b>맞수</b>가 처음부터 같은 구역에 있어요.<br />GS↔GK, GA↔GD, WA↔WD, C↔C는 <b>같은 구역에서 서로 맞서는 짝</b>이에요.<br />
        시작할 땐 맞수 C만 센터 서드에 서 있어요. 맞수는 처음엔 느리고, ${BALL_ICON}공 5개마다 조금씩 빨라져요.</p>
      <p>공격할 땐 맞수가 ${BALL_ICON}공과 패스를 <b>가로채러</b> 오고, 수비할 땐 내 앞을 <b>막아서요</b>.<br />
        0.9m를 지키고 가로채면 <b>정당한 인터셉트</b>예요 (Rule 16.6).</p>
      <p>🚨 <b>장애 반칙(Obstruction · 맞수 반칙)</b>: 내가 공을 잡고 있는데 맞수가 <b>0.9m(한 칸)</b> 안으로 들어오면 <b>페널티 패스</b>!<br />
        맞수는 옆에 비켜서서 패스가 끝날 때까지 못 움직이고(<b>아웃 오브 플레이</b>), 내 3초는 다시 시작돼요. (Rule 6.4·16.1)<br />
        GS·GA가 <b>골 서클 안</b>에서 페널티 패스를 얻으면 패스 대신 <b>슛</b>(골대 앞 ‘슛’ 칸, +30)도 할 수 있어요. (Rule 6.6)</p>
      <p>🚨 <b>접촉 반칙(Contact · 내 반칙)</b>: 머리로 맞수에 부딪히면 공이 상대에게 넘어가요.<br />맞수가 그 자리에서 페널티 패스를 하고, 그 <b>공이 손을 떠날 때까지</b> 나는 못 움직여요(아웃 오브 플레이). (Rule 6.4c·17)</p>
    </div>`;
}

/** 토글 블록: 누르면 해당 설명이 열리고, 다시 누르거나 다른 블록을 누르면 닫힌다 */
function bindRuleTabs(root, selector = '.info-tabs .info-tab') {
  const tabs = [...root.querySelectorAll(selector)];
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      const open = tab.getAttribute('aria-expanded') !== 'true';
      for (const t of tabs) {
        const on = t === tab && open;
        t.setAttribute('aria-expanded', String(on));
        root.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      }
    }),
  );
}

// ---------- 소개 카드 ----------
function renderIntro() {
  if (!current.ready) {
    // 개발 중인 게임: 소개 · 배울 규칙 · 개발 계획만 보여준다
    els.intro.innerHTML = `
      <h2>${current.icon} ${current.title}</h2>
      <p class="dev-badge">🛠️ 개발 중이에요. 곧 만나요!</p>
      ${audienceHtml()}
      <p class="desc">${current.teaser}</p>
      <figure class="dev-preview">
        <canvas id="dev-preview" width="720" height="360" aria-label="${current.title} 예상 화면"></canvas>
        <figcaption>🖼️ 미리보기 — 이런 화면을 만들 예정이에요</figcaption>
      </figure>
      ${current.rules ? `<p class="small"><b>📖 배울 규칙</b> ${current.rules}</p>` : ''}
      ${current.plan ? `<div class="dev-plan"><b>🗺️ 개발 계획</b><ul>${current.plan.map((p) => `<li>${p}</li>`).join('')}</ul></div>` : ''}
      <div class="like-row">
        <button type="button" class="btn like-btn" id="btn-like" aria-pressed="${likedGames().includes(current.id)}">❤️ 좋아요 <b id="like-count">·</b></button>
        <span class="muted small" id="like-msg">빨리 해 보고 싶다면 좋아요! 좋아요가 많은 게임부터 만들어요.</span>
      </div>
      <div class="dev-priority"><b>🏁 개발 우선순위 (좋아요 순)</b><ol id="dev-rank"></ol></div>`;
    if (!drawDevPreview($('#dev-preview'), current.id)) $('#dev-preview').closest('figure').remove();
    setupLikes();
    return;
  }
  if (isRhythm()) {
    renderRhythmIntro();
    return;
  }
  if (isPass()) {
    renderPassIntro();
    return;
  }

  // 첫 줄은 [랜덤 | C], 그 아래는 공격(왼쪽)과 수비(오른쪽)를 서로 맞서는 짝끼리 한 줄에 둔다
  const chips =
    `<button type="button" class="chip random" data-pos="${RANDOM}" aria-pressed="${position === RANDOM}"><span class="chip-title"><b>🎲 랜덤</b><span>무작위</span></span><small>🎲</small></button>` +
    CHIP_ORDER.map(
      (k) =>
        `<button type="button" class="chip" data-pos="${k}" data-group="${groupOf(k)}" aria-pressed="${k === position}"><span class="chip-title"><b>${k}</b><span>${POSITIONS[k].name}</span></span><small>${CHIP_MODE[groupOf(k)]}</small></button>`,
    ).join('');

  // 간단히: 한 줄 소개 + 포지션 선택 + 시작만. 자세히: 규칙 카드·조작법·구역 설명까지 (선택은 기억)
  els.intro.innerHTML = `
    <div class="intro-head">
      <h2>${current.icon} ${current.title}</h2>
      <button type="button" class="btn small help-btn" id="btn-help">📖 설명 보기</button>
    </div>
    ${audienceHtml()}
    <div class="picker">
      <div>
        <div class="chips positions" role="group" aria-label="포지션 선택">${chips}</div>
      </div>
      <div>
        <figure class="preview">
          <canvas id="preview" width="720" height="360" aria-label="선택한 포지션의 이동 가능 구역"></canvas>
          <div class="preview-random" id="preview-random" hidden>🎲<span>시작하면 7개 포지션 중 하나가 무작위로 정해져요</span></div>
        </figure>
        <div class="try-row">
          <button type="button" class="btn small try-btn" id="btn-try">🐍 맛보기</button>
          <span class="muted small try-msg" id="try-msg" aria-live="polite">고른 포지션으로 20초 동안 움직여 봐요</span>
        </div>
        <div class="start-row">
          <div class="mode-pick" id="mode-pick">
            <p>센터는 어떻게 뛸까요?</p>
            <div class="chips" role="group" aria-label="센터 모드 선택">
              <button type="button" class="chip" data-mode="attack" data-group="attack"><b>⚔️ 공격</b></button>
              <button type="button" class="chip" data-mode="defence" data-group="defence"><b>🛡️ 수비</b></button>
              <button type="button" class="chip random" data-mode="${RANDOM}"><b>🎲 랜덤</b></button>
            </div>
          </div>
          <button class="btn primary" id="btn-start" type="button">시작 ▶</button>
        </div>
      </div>
    </div>
    <section class="badges" aria-label="배지">
      <h3>🏅 내 배지 <small>${Object.keys(profile.badges).length} / ${BADGES.length}</small></h3>
      <ul>${BADGES.map((b) => badgeItem(b)).join('')}</ul>
      ${bragHtml('snake-badges', BADGES.every((b) => profile.badges[b.id]))}
    </section>`;

  const tryBtn = $('#btn-try');
  const tryMsg = $('#try-msg');
  const endTaste = (text) => {
    stopHomeDemo();
    tryBtn.textContent = '🐍 맛보기';
    tryBtn.setAttribute('aria-pressed', 'false');
    if (text != null) tryMsg.textContent = text;
  };
  tryBtn.addEventListener('click', () => {
    if (homeDemo) {
      endTaste('고른 포지션으로 20초 동안 움직여 봐요');
      sync();
      return;
    }
    if (position === RANDOM) return;
    homeDemo = startSnakeTaste({
      canvas: $('#preview'),
      position,
      orientation: orientationNow(),
      onMessage: (text, kind) => {
        tryMsg.textContent = text;
        tryMsg.dataset.kind = kind;
      },
      onEnd: ({ balls, goals, offsides }) => {
        endTaste(`맛보기 끝! 공 ${balls}개${goals ? ` (골 ${goals})` : ''} · 오프사이드 ${offsides}번 — 시작 ▶으로 진짜 경기를 해 봐요`);
        tryMsg.dataset.kind = 'good';
        sync();
      },
    });
    tryBtn.textContent = '맛보기 끝 ✕';
    tryBtn.setAttribute('aria-pressed', 'true');
    tryMsg.dataset.kind = '';
    tryMsg.textContent = '방향키 · WASD · 미니 코트를 스와이프해서 움직여요';
  });

  const sync = () => {
    const random = position === RANDOM;
    if (homeDemo) endTaste(); // 포지션을 바꾸면 맛보기는 멈추고 미리보기로
    tryBtn.disabled = random;
    tryBtn.title = random ? '랜덤일 때는 맛보기를 할 수 없어요. 포지션을 골라 주세요' : '';
    $('#preview').hidden = random;
    $('#preview-random').hidden = !random;
    if (!random) drawCourtPreview($('#preview'), position, orientationNow());
    els.intro.querySelectorAll('.chip[data-pos]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.pos === position)));
    els.intro.querySelectorAll('.chip[data-mode]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.mode === centreMode)));
    // 센터 모드 선택은 C(또는 랜덤 — C가 나올 수 있으므로)일 때만
    $('#mode-pick').hidden = position !== 'C' && !random;
  };
  els.intro.querySelectorAll('.chip[data-mode]').forEach((chip) =>
    chip.addEventListener('click', () => {
      centreMode = chip.dataset.mode;
      store.set('netball.cmode', centreMode);
      sync();
    }),
  );
  els.intro.querySelectorAll('.chip[data-pos]').forEach((chip) =>
    chip.addEventListener('click', () => {
      position = chip.dataset.pos;
      store.set('netball.pos', position);
      sync();
    }),
  );
  $('#btn-start').addEventListener('click', () => startGame(position, centreMode));
  $('#btn-help').addEventListener('click', openHelp);
  els.intro.querySelectorAll('.badge button').forEach((btn) =>
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      $(`#${btn.getAttribute('aria-controls')}`).hidden = !open;
    }),
  );
  sync();
}

// ---------- 리듬 슈팅 소개 카드 ----------
function renderRhythmIntro() {
  // GS·GA만 고를 수 있고, 나머지 포지션은 잠긴 칩 (누르면 왜 안 되는지 알려준다 · Rule 9.1)
  const chips =
    `<button type="button" class="chip random" data-pos="${RANDOM}"><span class="chip-title"><b>🎲 랜덤</b><span>GS·GA·GK·GD</span></span></button>` +
    CHIP_ORDER.map((k) => {
      const ok = RHYTHM_POSITIONS.includes(k);
      return `<button type="button" class="chip${ok ? '' : ' locked'}" data-pos="${k}" data-group="${groupOf(k)}" ${ok ? '' : 'data-locked="true"'}><span class="chip-title"><b>${k}</b><span>${POSITIONS[k].name}</span></span><small>${ok ? (rhythmModeOf(k) === 'attack' ? '🎯' : '🛡️') : '🔒'}</small></button>`;
    }).join('');
  els.intro.innerHTML = `
    <div class="intro-head">
      <h2>${current.icon} ${current.title}</h2>
      <button type="button" class="btn small help-btn" id="btn-help">📖 설명 보기</button>
    </div>
    ${audienceHtml()}
    <div class="picker">
      <div>
        <div class="chips positions" role="group" aria-label="포지션 선택">${chips}</div>
        <p class="lock-note" id="lock-note" aria-live="polite"></p>
      </div>
      <div>
        <figure class="preview">
          <canvas id="preview" width="720" height="360" aria-label="선택한 포지션의 이동 가능 구역"></canvas>
          <div class="preview-random" id="preview-random" hidden>🎲<span>시작하면 GS·GA·GK·GD 중 하나가 무작위로 정해져요</span></div>
        </figure>
        <p class="best-line" id="best-line"></p>
        <div class="try-row">
          <button type="button" class="btn small try-btn" id="btn-try">🎯 타이밍 연습</button>
          <span class="muted small try-msg" id="try-msg"></span>
        </div>
        <div class="practice" id="practice" hidden></div>
        <div class="start-row">
          <button class="btn primary" id="btn-start" type="button">시작 ▶</button>
        </div>
      </div>
    </div>
    <section class="badges" aria-label="리듬 슈팅 배지">
      <h3>🏅 내 배지 <small>${Object.keys(rhythmSave.badges).length} / ${RHYTHM_BADGES.length}</small></h3>
      <ul>${RHYTHM_BADGES.map((b) => badgeItem(b, rhythmSave, rhythmBook.progress)).join('')}</ul>
      ${bragHtml('rhythm-badges', RHYTHM_BADGES.every((b) => rhythmSave.badges[b.id]))}
    </section>`;
  els.intro.querySelectorAll('.badge button').forEach((btn) =>
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      $(`#${btn.getAttribute('aria-controls')}`).hidden = !open;
    }),
  );
  const tryBtn = $('#btn-try');
  const practiceEl = $('#practice');
  const practiceMode = () => (rhythmPos === RANDOM ? 'attack' : rhythmModeOf(rhythmPos));
  const startPractice = () => {
    stopHomeDemo();
    audio.unlock(); // 클릭 안에서 깨워야 박자 소리가 난다
    practiceEl.hidden = false;
    homeDemo = startRhythmPractice({ root: practiceEl, mode: practiceMode(), difficulty: rhythmDiff, audio });
    tryBtn.textContent = '연습 끝 ✕';
    tryBtn.setAttribute('aria-pressed', 'true');
    $('#try-msg').textContent = practiceMode() === 'defence' ? '🛡️ 수비 연습: ① 멈춤 → ② 블록' : '🎯 공격 연습: 슛 타이밍';
  };
  const endPractice = () => {
    stopHomeDemo();
    practiceEl.hidden = true;
    practiceEl.replaceChildren();
    tryBtn.textContent = '🎯 타이밍 연습';
    tryBtn.setAttribute('aria-pressed', 'false');
    $('#try-msg').textContent = '';
  };
  tryBtn.addEventListener('click', () => (homeDemo ? endPractice() : startPractice()));

  const sync = () => {
    if (homeDemo) startPractice(); // 포지션을 바꾸면 연습도 그에 맞게 다시
    els.intro.querySelectorAll('.chip[data-pos]').forEach((c) => c.removeAttribute('data-peek'));
    const random = rhythmPos === RANDOM;
    $('#best-line').innerHTML = bestLine(random ? ['attack', 'defence'] : [rhythmModeOf(rhythmPos)], rhythmDiff);
    $('#preview').hidden = random;
    $('#preview-random').hidden = !random;
    if (!random) drawCourtPreview($('#preview'), rhythmPos, orientationNow());
    els.intro.querySelectorAll('.chip[data-pos]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.pos === rhythmPos)));
  };
  els.intro.querySelectorAll('.chip[data-pos]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const k = chip.dataset.pos;
      if (chip.dataset.locked) {
        const note = $('#lock-note');
        note.innerHTML = `🔒 ${k}(${POSITIONS[k].name})는 골 서클에 들어갈 수 없어 슛도, 슈터 수비도 못 해요. 골은 <b>GS·GA</b>가 <b>골 서클 안</b>에서 쏜 슛만 인정돼요 (Rule 9.1)`;
        note.dataset.warn = 'true';
        // 선택은 바꾸지 않고, 그 포지션이 갈 수 있는 구역만 미니 코트에 보여준다 (골 서클 = 빗금)
        els.intro.querySelectorAll('.chip[data-pos]').forEach((c) => c.toggleAttribute('data-peek', c === chip));
        $('#preview').hidden = false;
        $('#preview-random').hidden = true;
        drawCourtPreview($('#preview'), k, orientationNow());
        return;
      }
      rhythmPos = k;
      $('#lock-note').textContent = ''; // 잠긴 포지션 안내는 지운다
      store.set('netball.rpos', rhythmPos);
      sync();
    }),
  );
  $('#btn-start').addEventListener('click', () => startGame(rhythmPos));
  $('#btn-help').addEventListener('click', openHelp);
  sync();
}

/** 소개 카드의 '이런 분께 추천' 한 줄 */
function audienceHtml(g = current) {
  return g.audience ? `<p class="audience">👍 <b>이런 분께 추천</b> ${g.audience}</p>` : '';
}

// ---------- 개발 중인 게임 좋아요 (개발 우선순위) ----------
let likeCounts = null; // 서버에서 받은 { [game]: 수 }
const devGames = () => GAMES.filter((g) => !g.ready);
function likedGames() {
  try {
    const v = JSON.parse(store.get('netball.likes') ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
/** 이 기기의 무작위 토큰 (서버에는 해시만 저장) */
function voterToken() {
  let t = store.get('netball.voter');
  if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    t = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    store.set('netball.voter', t);
  }
  return t;
}

function renderLikes() {
  const btn = $('#btn-like');
  if (!btn) return;
  const mine = likedGames();
  btn.setAttribute('aria-pressed', String(mine.includes(current.id)));
  $('#like-count').textContent = likeCounts ? String(likeCounts[current.id] ?? 0) : '·';
  const ranked = devGames()
    .map((g, i) => ({ g, i, n: likeCounts?.[g.id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i);
  $('#dev-rank').innerHTML = ranked
    .map(({ g, n }) => `<li${g.id === current.id ? ' class="me"' : ''}><a href="#/${g.id}">${g.icon} ${g.title}</a> <span class="n">❤️ ${likeCounts ? n : '·'}</span>${mine.includes(g.id) ? ' <small>(내 좋아요)</small>' : ''}</li>`)
    .join('');
}

async function setupLikes() {
  const btn = $('#btn-like');
  renderLikes();
  btn.addEventListener('click', async () => {
    const game = current.id;
    const mine = likedGames();
    const like = !mine.includes(game);
    const next = like ? [...mine, game] : mine.filter((g) => g !== game);
    store.set('netball.likes', JSON.stringify(next));
    if (likeCounts) likeCounts = { ...likeCounts, [game]: Math.max(0, (likeCounts[game] ?? 0) + (like ? 1 : -1)) };
    renderLikes(); // 먼저 화면에 반영하고 서버에 보낸다
    btn.disabled = true;
    try {
      const out = await sendLike({ game, token: voterToken(), like });
      likeCounts = out.counts;
      $('#like-msg').textContent = like ? '고마워요! 💚 좋아요가 많은 게임부터 만들어요.' : '좋아요를 취소했어요.';
    } catch (err) {
      store.set('netball.likes', JSON.stringify(mine)); // 실패하면 되돌린다
      if (likeCounts) likeCounts = { ...likeCounts, [game]: Math.max(0, (likeCounts[game] ?? 0) + (like ? -1 : 1)) };
      $('#like-msg').textContent = err.code === 'too_fast' ? '조금 천천히 눌러 주세요.' : '지금은 좋아요를 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.';
    } finally {
      btn.disabled = false;
      renderLikes();
    }
  });
  try {
    likeCounts = await fetchLikes();
  } catch {
    $('#like-msg').textContent = '좋아요 수를 불러오지 못했어요. (배포 후 서버가 연결되면 보여요)';
  }
  renderLikes();
}

// ---------- 넷볼 규칙 사전 (Rule 1~21 요약 · 5개씩 쪽 나누기 · 검색 · 연습 게임 연결) ----------
const RULES_PER_PAGE = 5; // 한 쪽에 규칙 5개 (Rule 1~21 → 5쪽)
let rulesTurn = null; // 넷볼 규칙 사전이 열려 있을 때 쪽 넘기기
let rulesOnSelect = null; // 넷볼 규칙 사전이 열려 있을 때 글자 고르기 → 형광펜 버튼
document.addEventListener('selectionchange', () => rulesOnSelect?.());
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** 형광펜 버튼 (칠하기 · 지우기): 페이지에 하나만 두고 글자 아래에 띄운다 */
let hlPop = null;
function highlightPop() {
  if (!hlPop) {
    hlPop = Object.assign(document.createElement('button'), { type: 'button', className: 'hl-pop', hidden: true });
    hlPop.addEventListener('pointerdown', (e) => e.preventDefault()); // 누르는 순간 글자 선택이 풀리지 않게
    document.body.append(hlPop);
  }
  return hlPop;
}
// ← → 키로 책장 넘기기 (넷볼 규칙 사전에서만, 글자 입력 중이 아닐 때)
window.addEventListener('keydown', (e) => {
  if (document.body.dataset.page !== 'rules' || !rulesTurn || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'ArrowRight') rulesTurn(1);
  else if (e.code === 'ArrowLeft') rulesTurn(-1);
});
function renderRulesPage(focusNo) {
  const gameLink = (id) => {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return '';
    // 개발 중인 게임은 회색 글씨로 (아직 연습할 수 없음)
    if (!g.ready) return `<a class="rule-game dev" href="#/${g.id}" title="개발 중이에요">${g.icon} ${g.title} <small>(개발 중)</small></a>`;
    return `<a class="rule-game" href="#/${g.id}">${g.icon} ${g.title}</a>`;
  };
  // 형광펜: 이 기기 / 계정(로그인 + 계정 저장)에 놀이터 기록과 함께 저장
  let marks = parseHighlights(store.get(HIGHLIGHT_KEY));
  const lineHtml = (r, i) => markedHtml(r.points[i].t, marks[lineKey(r.no, i)], escHtml);
  const card = (r) => `
    <article class="rule-card" id="rule-${r.no}">
      <h3><span class="rule-no">Rule ${r.no}</span> ${r.title}</h3>
      <ul class="rule-lines">${r.points.map((p, i) => `<li data-line="${lineKey(r.no, i)}">${lineHtml(r, i)}</li>`).join('')}</ul>
      <details class="rule-src">
        <summary>📜 근거 원문보기</summary>
        <ol>${r.points
          .map((p) => `<li><b>Rule ${escHtml(p.ref)}</b> <span class="muted small">· 규정집 ${p.p}쪽</span><br /><q lang="en">${escHtml(p.en)}</q></li>`)
          .join('')}</ol>
        <p class="small muted">위 줄과 같은 순서예요. 원문은 저작권 때문에 핵심 구절만 보여 줘요 — <a href="${OFFICIAL_RULES_URL}" target="_blank" rel="noopener">공식 규정집 전체 보기 ↗</a></p>
      </details>
      ${r.games.length ? `<p class="rule-games">🎮 연습해요: ${r.games.map(gameLink).join(' ')}</p>` : ''}
    </article>`;
  const pages = [];
  for (let i = 0; i < RULEBOOK.length; i += RULES_PER_PAGE) pages.push(RULEBOOK.slice(i, i + RULES_PER_PAGE));
  let page = focusNo ? Math.floor((focusNo - 1) / RULES_PER_PAGE) : 0;
  const range = (p) => {
    const a = p[0].no;
    const b = p[p.length - 1].no;
    return a === b ? `Rule ${a}` : `Rule ${a}~${b}`;
  };
  els.intro.innerHTML = `
    <div class="intro-head">
      <h2>📖 넷볼 규칙 사전</h2>
      <a class="btn small help-btn" href="${OFFICIAL_RULES_URL}" target="_blank" rel="noopener">🌐 공식 규정집 보기</a>
    </div>
    <p class="muted small">World Netball「Rules of Netball」2024를 AI가 풀어 쓴 요약이에요. 정확한 원문은 공식 사이트(영문, 무료)에서 확인하세요. ٩(•᎑•)✦</p>
    ${todayRuleHtml()}
    <p class="hl-tip small muted">🖍️ 글자를 드래그해서(폰은 길게 눌러) 고르면 형광펜으로 칠할 수 있어요. 칠한 곳을 누르면 지워요. ${hub.saveMode === 'account' ? '내 계정에 저장돼요.' : '이 기기에 저장돼요.'}</p>
    <input class="rule-search" id="rule-search" type="search" placeholder="🔍 찾기 — 예) 3초, 오프사이드, 페널티 패스" aria-label="규칙 찾기" />
    <div class="book" id="book">
      <div class="book-page" id="book-page">
        <div class="rule-list" id="rule-list"></div>
        <p class="muted small" id="rule-empty" hidden>찾는 규칙이 없어요. 다른 낱말로 찾아 봐요.</p>
        <p class="book-foot" id="book-foot"></p>
      </div>
      <div class="page-hint" id="page-hint" aria-hidden="true" hidden></div>
    </div>
    <nav class="rule-pager" id="rule-pager" aria-label="쪽 넘기기">
      <button type="button" class="pg pg-arrow" id="rule-prev" aria-label="이전 쪽">‹</button>
      ${pages.map((p, i) => `<button type="button" class="pg" data-page="${i}" title="${range(p)}" aria-label="${i + 1}쪽 (${range(p)})">${i + 1}</button>`).join('')}
      <button type="button" class="pg pg-arrow" id="rule-next" aria-label="다음 쪽">›</button>
    </nav>`;
  setupTodayRule(focusNo);
  const list = $('#rule-list');
  const sheet = $('#book-page');
  const book = $('#book');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let finishFlip = null; // 넘기는 중인 책장을 바로 끝내기
  /** 지금 책장 내용을 복사한 '넘어가는 종이' (id 는 겹치지 않게 지운다) */
  const makeLeaf = (dir) => {
    const leaf = document.createElement('div');
    leaf.className = `leaf ${dir > 0 ? 'leaf-next' : 'leaf-prev'}`;
    leaf.setAttribute('aria-hidden', 'true');
    leaf.innerHTML = `<div class="leaf-front">${sheet.innerHTML}</div><div class="leaf-back"></div>`;
    leaf.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    return leaf;
  };
  const fill = () => {
    list.innerHTML = pages[page].map(card).join('');
    $('#book-foot').hidden = false;
    $('#book-foot').textContent = `— ${page + 1} —`;
    $('#rule-empty').hidden = true;
  };
  /**
   * 쪽 넘기기: 오른쪽 아래 귀퉁이부터 종이가 들려 올라가 책 등(왼쪽)을 축으로 넘어간다.
   * 다음 쪽: 지금 종이가 넘어가고 아래에 새 쪽이 보인다. 이전 쪽: 왼쪽에 넘겨 둔 종이가 거꾸로 되돌아와 덮는다.
   */
  const flip = (dir, after) => {
    finishFlip?.();
    if (!dir || reduceMotion.matches) {
      fill();
      after?.();
      return;
    }
    // 책장이 길어서, 3D 시점을 화면에 보이는 부분의 가운데에 둔다
    const r = book.getBoundingClientRect();
    const mid = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2 - r.top;
    book.style.perspectiveOrigin = `50% ${Math.round(mid)}px`;
    let leaf;
    if (dir > 0) {
      leaf = makeLeaf(dir); // 옛 쪽을 들고
      fill(); // 아래에는 새 쪽
    } else {
      fill();
      leaf = makeLeaf(dir); // 새 쪽이 왼쪽에서 되돌아온다
      sheet.classList.add('under-old'); // 덮을 때까지 아래 쪽 글씨는 감춘다 (옛 쪽 대신 빈 종이처럼)
    }
    book.append(leaf);
    const done = () => {
      leaf.remove();
      sheet.classList.remove('under-old');
      finishFlip = null;
      after?.();
    };
    finishFlip = done;
    leaf.addEventListener('animationend', (e) => {
      if (e.target === leaf) done();
    });
  };
  const showPage = (i, scroll = true) => {
    highlightPop().hidden = true;
    const next = Math.max(0, Math.min(pages.length - 1, i));
    const dir = scroll && next !== page ? Math.sign(next - page) : 0;
    page = next;
    // 아래쪽 번호를 눌렀으면 그 자리에서 책장을 넘긴 뒤 책 맨 위로
    flip(dir, () => {
      if (scroll && book.getBoundingClientRect().top < 0) book.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('#rule-pager').hidden = false;
    els.intro.querySelectorAll('#rule-pager [data-page]').forEach((b) => b.setAttribute('aria-current', String(Number(b.dataset.page) === page)));
    $('#rule-prev').disabled = page === 0;
    $('#rule-next').disabled = page === pages.length - 1;
  };
  // 폰: 책장을 옆으로 밀어 넘기기 (검색 중에는 쪽이 없다)
  let swipeX = null;
  sheet.addEventListener('pointerdown', (e) => {
    swipeX = e.pointerType === 'mouse' ? null : e.clientX;
  });
  sheet.addEventListener('pointerup', (e) => {
    if (swipeX == null || $('#rule-pager').hidden) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 60) showPage(page + (dx < 0 ? 1 : -1));
  });
  rulesTurn = (d) => showPage(page + d); // ← → 키 (아래 keydown)

  // ----- 형광펜 -----
  const pop = highlightPop();
  let pending = null; // { mode: 'add', key, start, end } | { mode: 'del', key, at }
  const hidePop = () => {
    pop.hidden = true;
    pending = null;
  };
  const showPop = (rect, text, what) => {
    pending = what;
    pop.textContent = text;
    pop.hidden = false;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 50), innerWidth - 50);
    pop.style.left = `${Math.round(x + scrollX)}px`;
    pop.style.top = `${Math.round(rect.bottom + scrollY + 8)}px`;
  };
  const lineOf = (node) => (node instanceof Element ? node : node?.parentElement)?.closest('li[data-line]');
  const offsetIn = (li, node, off) => {
    const r = document.createRange();
    r.selectNodeContents(li);
    r.setEnd(node, off);
    return r.toString().length;
  };
  const textOf = (key) => {
    const [no, i] = key.split('-').map(Number);
    return RULEBOOK.find((r) => r.no === no)?.points[i]?.t ?? '';
  };
  rulesOnSelect = () => {
    if (!list.isConnected) return;
    const sel = getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) {
      if (pending?.mode === 'add') hidePop();
      return;
    }
    const range = sel.getRangeAt(0);
    const li = lineOf(range.startContainer);
    if (!li || li !== lineOf(range.endContainer) || !list.contains(li)) {
      if (pending?.mode === 'add') hidePop();
      return;
    }
    const start = offsetIn(li, range.startContainer, range.startOffset);
    const end = offsetIn(li, range.endContainer, range.endOffset);
    showPop(range.getBoundingClientRect(), '🖍️ 칠하기', { mode: 'add', key: li.dataset.line, start, end });
  };
  // 칠한 곳을 누르면 '지우기'
  list.addEventListener('click', (e) => {
    const mark = e.target instanceof Element ? e.target.closest('mark.hl') : null;
    if (!mark) {
      if (pending?.mode === 'del') hidePop();
      return;
    }
    if (String(getSelection?.() ?? '')) return;
    showPop(mark.getBoundingClientRect(), '🧽 지우기', { mode: 'del', key: mark.closest('li[data-line]').dataset.line, at: Number(mark.dataset.at) });
  });
  pop.onclick = () => {
    if (!pending) return;
    const { key } = pending;
    const text = textOf(key);
    marks = pending.mode === 'add' ? addHighlight(marks, key, text, pending.start, pending.end) : removeHighlight(marks, key, text, pending.at);
    store.set(HIGHLIGHT_KEY, JSON.stringify(marks));
    els.intro.querySelectorAll(`li[data-line="${key}"]`).forEach((li) => {
      li.innerHTML = markedHtml(text, marks[key], escHtml);
    });
    getSelection()?.removeAllRanges();
    hidePop();
  };
  // 책장 가운데를 기준으로 오른쪽을 누르면 다음 쪽, 왼쪽을 누르면 이전 쪽 (링크 · 버튼 · 글자 고르기는 빼고)
  const hint = $('#page-hint');
  const sideOf = (e) => {
    const r = sheet.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  const canTurn = (d) => !$('#rule-pager').hidden && (d < 0 ? page > 0 : page < pages.length - 1);
  const onControl = (e) => e.target instanceof Element && e.target.closest('a, button, input, summary, details, mark.hl');
  sheet.addEventListener('click', (e) => {
    if (onControl(e) || String(getSelection?.() ?? '')) return;
    const d = sideOf(e);
    if (canTurn(d)) showPage(page + d);
  });
  // 마우스를 올리면 그쪽에 화살표 (마우스 높이를 따라)
  const hideHint = () => {
    hint.hidden = true;
    sheet.classList.remove('turnable');
  };
  sheet.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const d = sideOf(e);
    if (onControl(e) || !canTurn(d)) return hideHint();
    const top = e.clientY - book.getBoundingClientRect().top;
    hint.hidden = false;
    hint.dataset.side = d > 0 ? 'next' : 'prev';
    hint.textContent = d > 0 ? '›' : '‹';
    hint.style.top = `${Math.round(top)}px`;
    sheet.classList.add('turnable');
  });
  sheet.addEventListener('pointerleave', hideHint);
  els.intro.querySelectorAll('#rule-pager [data-page]').forEach((b) => b.addEventListener('click', () => showPage(Number(b.dataset.page))));
  $('#rule-prev').addEventListener('click', () => showPage(page - 1));
  $('#rule-next').addEventListener('click', () => showPage(page + 1));
  // 찾기: 낱말이 있으면 쪽 구분 없이 찾은 규칙을 모두 보여준다
  $('#rule-search').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (!q) {
      showPage(page, false);
      return;
    }
    finishFlip?.();
    const found = searchRules(q);
    list.innerHTML = found.map(card).join('');
    $('#book-foot').hidden = true;
    $('#rule-empty').hidden = found.length > 0;
    $('#rule-pager').hidden = true;
  });
  showPage(page, false);
  if (focusNo) {
    const el = $(`#rule-${focusNo}`);
    el?.classList.add('focus');
    setTimeout(() => {
      el?.scrollIntoView({ block: 'start' }); // 화면이 다 그려진 뒤에 이동
      // 따라온 규칙이 어디인지 알 수 있게 잠깐 반짝인다 (책장이 넘어온 뒤에)
      setTimeout(() => el?.classList.add('flash'), 450);
    }, 0);
  } else {
    window.scrollTo(0, 0);
  }
}

// ---------- 오늘의 규칙 한 줄 (넷볼 규칙 사전 맨 위) ----------
let today = null;
let todayFile = null; // 공유할 장면 그림 (누르는 순간 바로 공유하려고 미리 만든다)
function todayRuleHtml() {
  today = ruleOfDay();
  return `
    <section class="today-rule" aria-labelledby="today-title">
      <div class="today-head"><h3 id="today-title">📌 오늘의 규칙 한 줄</h3><span class="muted small">${dayLabel(today.day)}</span></div>
      <canvas class="today-scene" id="today-scene" width="720" height="360" role="img" aria-label="애벌레로 그린 장면: ${today.text}"></canvas>
      <p class="today-text">${today.text}</p>
      <div class="today-acts">
        <a class="btn small ghost" id="today-more" href="#/rules/${today.rule}">📖 Rule ${today.rule} 자세히</a>
        <button type="button" class="btn small primary" id="today-share">💬 카톡으로 공유</button>
      </div>
    </section>`;
}
function setupTodayRule(focusNo) {
  const canvas = $('#today-scene');
  todayFile = null;
  drawRuleSceneReady(canvas, today.scene).then((ok) => {
    if (!ok) return canvas.remove();
    canvas.toBlob((blob) => {
      if (blob) todayFile = new File([blob], 'netter-오늘의-규칙.png', { type: 'image/png' });
    }, 'image/png');
  });
  // 이미 그 규칙을 보고 있으면 주소가 같아 이동이 없으니, 직접 그 규칙으로
  $('#today-more').addEventListener('click', (e) => {
    if (focusNo !== today.rule) return;
    e.preventDefault();
    renderRulesPage(today.rule);
  });
  $('#today-share').addEventListener('click', shareToday);
}
/** 폰: 공유창(카카오톡 고르기)으로 그림 + 문구 + 링크. PC: 문구 복사 */
async function shareToday() {
  const url = `${location.origin}${location.pathname}#/rules/${today.rule}`;
  const text = `📌 오늘의 넷볼 규칙 한 줄 (Rule ${today.rule})
${today.text}

👉 ${url}`;
  if (touchQuery.matches && navigator.share) {
    try {
      if (todayFile && navigator.canShare?.({ files: [todayFile] })) await navigator.share({ files: [todayFile], text });
      else await navigator.share({ title: '오늘의 넷볼 규칙 한 줄', text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // 공유창을 닫음
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('공유 문구를 복사했어요. 카톡 대화창에 붙여넣어 주세요 📋', 'good', 4500);
  } catch {
    window.prompt('아래 문구를 복사해 카톡에 붙여넣어 주세요', text);
  }
}

// ---------- 🏆 회장에게 자랑하기 (배지 · 별을 모두 모았을 때 → 운영진 화면에 보인다) ----------
const BRAGGED_KEY = 'netball.bragged'; // 이 기기에서 이미 자랑한 것
const bragged = () => {
  try {
    const v = JSON.parse(store.get(BRAGGED_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
function bragHtml(kind, complete) {
  if (!complete) return '';
  const done = bragged().includes(kind);
  return `<div class="brag"><p>🎉 모두 모았어요! 대단해요</p>
    <button type="button" class="btn brag-btn" data-brag="${kind}" ${done ? 'disabled' : ''}>${done ? '✅ 회장님께 자랑했어요' : '🏆 회장에게 자랑하기!'}</button></div>`;
}
els.intro.addEventListener('click', async (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-brag]') : null;
  if (!btn || btn.disabled) return;
  if (!hub.session) {
    showToast('로그인하면 회장님께 자랑할 수 있어요 🔑');
    openLogin();
    return;
  }
  btn.disabled = true;
  try {
    const out = await hub.brag(btn.dataset.brag);
    store.set(BRAGGED_KEY, JSON.stringify([...new Set([...bragged(), btn.dataset.brag])]));
    btn.textContent = '✅ 회장님께 자랑했어요';
    showToast(out.already ? '이미 자랑했어요. 회장님이 알고 계세요 😊' : '회장님께 자랑했어요! 🎉', 'good');
  } catch (err) {
    btn.disabled = false;
    showToast(HUB_ERROR_TEXT[err?.code] ?? '잠시 뒤 다시 시도해 주세요.', 'bad');
  }
});

// ---------- 패스 퍼즐 소개 카드: 스테이지 목록 ----------
function renderPassIntro() {
  els.intro.innerHTML = `
    <div class="intro-head">
      <h2>${current.icon} ${current.title}</h2>
      <button type="button" class="btn small help-btn" id="btn-help">📖 설명 보기</button>
    </div>
    ${audienceHtml()}
    <p class="pass-total">⭐ ${totalStars(passProgress)} / ${PASS_STAGES.length * 3}</p>
    ${bragHtml('pass-stars', totalStars(passProgress) >= PASS_STAGES.length * 3)}
    <div class="chapters">${stageCardsHtml(passProgress)}</div>`;
  els.intro.querySelectorAll('.stage-card').forEach((card) => card.addEventListener('click', () => startGame(card.dataset.stage)));
  $('#btn-help').addEventListener('click', openHelp);
}

// ---------- 설명 보기 (홈에서 분리한 설명 전체) ----------
function openHelp() {
  const dlg = $('#help-dialog');
  $('#help-title').textContent = `📖 ${current.title} 설명`;
  if (isPass()) {
    $('#help-body').innerHTML = `<p class="desc">공을 가진 선수 → <b>받을 동료를 누르면</b> 패스돼요! 실제 넷볼 패스 규칙을 지켜 골 서클 안 <b>GS·GA</b>까지 보내고 🎯 슛.<br />
      반칙 패스를 하거나 가로채이면 상대에게 공이 넘어가요. 기준 패스 수 안에 넣으면 ⭐⭐⭐</p>
      ${passRulesHtml('help')}
      <p class="muted small">🏅 별과 진행도는 이 기기의 브라우저에 저장돼요.</p>`;
    bindRuleTabs($('#help-body'));
    linkifyRules($('#help-body')); // 규칙 낱말 → 넷볼 규칙 사전
    if (typeof dlg.showModal === 'function') dlg.showModal();
    return;
  }
  if (isRhythm()) {
    $('#help-body').innerHTML = rhythmHelpHtml();
    bindRuleTabs($('#help-body'));
    linkifyRules($('#help-body')); // 규칙 낱말 → 넷볼 규칙 사전
    if (typeof dlg.showModal === 'function') dlg.showModal();
    return;
  }
  $('#help-body').innerHTML = `
    <p class="desc">
      <b>선택한 포지션의 구역 안에서만</b> 움직일 수 있어요.<br />
      벽에 닿으면 옆으로 튕기고, 다른 구역에 들어가려 하면 <b>오프사이드 −10점</b>!<br />
      미니 코트의 <b>황금색 1구역</b>이 우리 팀이 슛하는 골이에요.
    </p>
    <p class="muted small">⚔️ 공격 포지션 · 🛡️ 수비 포지션 — 아래 카드를 눌러 자세히 보세요.</p>
    ${rulesHtml('help')}
    <p class="controls">조작 — 방향키 · WASD (폰은 스와이프 · 방향 버튼)<br />일시정지 — 스페이스 키 · ⏸ 버튼</p>
    <p class="muted small">🏅 배지와 기록은 이 기기의 브라우저에 저장돼요.</p>`;
  bindRuleTabs($('#help-body'));
    linkifyRules($('#help-body')); // 규칙 낱말 → 넷볼 규칙 사전
  if (typeof dlg.showModal === 'function') dlg.showModal();
}
$('#help-close').addEventListener('click', () => $('#help-dialog').close());
// 설명 속 규칙 링크를 누르면 설명 창을 닫고 넷볼 규칙 사전으로
$('#help-body').addEventListener('click', (e) => {
  if (e.target.closest('a.rule-link')) $('#help-dialog').close();
});

/** prof: 그 게임의 저장 기록 · prog: 진행도 함수 (기본은 존 스네이크) */
function badgeItem(b, prof = profile, prog = progress) {
  const got = Boolean(prof.badges[b.id]);
  // 누르면 그 배지의 설명이 펼쳐진다 (배지마다 따로)
  // 모든 배지가 같은 크기가 되도록 [아이콘 | 이름 / 진행(숫자+막대)] 두 줄로 고정한다
  let desc = b.desc;
  let meta;
  if (got) {
    meta = '<span class="count">획득 ✓</span>';
  } else {
    // 진행도는 이 브라우저에 저장된 기록(지금까지 한 판 최고 기록 · 뛴 포지션)으로 센다
    const { value, goal } = prog(b, prof);
    const unit = b.unit ?? '';
    meta = `<span class="count">${value}/${goal}</span><span class="bar" aria-hidden="true"><i style="width:${Math.round((value / goal) * 100)}%"></i></span>`;
    if (b.id === 'all-rounder') desc += `<br />남은 포지션: <b>${remainingPositions(prof).join(' · ')}</b>`;
    else if (goal > 1) desc += `<br />${b.total ? '지금까지 누적' : '지금까지 한 판 최고'}: <b>${value}${unit}</b> / 목표 ${goal}${unit}`;
  }
  return `<li class="badge" data-got="${got}"><button type="button" aria-expanded="false" aria-controls="badge-${b.id}" title="${b.title}"><span class="icon">${got ? b.icon : '🔒'}</span><b class="name">${b.title}</b><span class="meta">${meta}</span></button><small id="badge-${b.id}" hidden>${desc}</small></li>`;
}

// ---------- 게임 실행 ----------
function renderHud(s) {
  // 폰에서는 이름(.long)을 숨기고 포지션 코드만 보여준다
  $('#hud-pos').innerHTML = `<b>${s.position}</b><span class="long"> · ${POSITIONS[s.position].name}</span>`;
  $('#hud-pos').dataset.group = groupOf(s.position);
  $('#hud-score').textContent = String(s.score);
  // 한 줄로만 보여준다(길면 …, 전체는 마우스를 올리면). 줄 수가 바뀌어 코트 크기가 흔들리지 않게
  const zone = `${MODE_TEXT[s.mode]} · ${zoneNote(s.position)}`;
  $('#hud-zone').textContent = zone;
  $('#hud-zone').title = zone;
}

/**
 * 코트가 브라우저 창 안에 다 보이도록 크기를 정한다 (가로 2:1 · 세로 1:2 비율 유지).
 * 게임 카드 맨 위를 화면 맨 위에 맞췄을 때 기준으로, 코트 위의 HUD와 아래의 방향 버튼·안내 줄까지 들어오게 한다.
 * 안내 줄(토스트)은 지금 글자 길이가 아니라 미리 정한 높이(min-height)로 계산한다 → 긴 토스트가 떠도 코트가 줄지 않는다.
 * 게임 시작·창 크기 변경·화면 회전 때만 다시 맞춘다.
 * Phaser는 부모 크기가 바뀌면 스스로 다시 맞춘다(Scale.FIT).
 */
function fitCourt() {
  if (els.stage.hidden) return;
  const wrap = els.parent;
  const play = wrap.parentElement;
  const dpad = isRhythm() ? $('#rpad') : isPass() ? $('#ppad') : $('#dpad'); // 방향 버튼 (리듬 슈팅·패스 퍼즐은 각자 버튼)
  const dpadShown = getComputedStyle(dpad).display !== 'none';
  const sideBySide = dpadShown && getComputedStyle(play).display === 'flex'; // 폰 가로: 버튼이 옆에
  const ratio = isRhythm() ? RHYTHM_RATIO : document.body.dataset.orient === 'portrait' ? 0.5 : 2; // 너비 ÷ 높이

  const stageTop = els.stage.getBoundingClientRect().top;
  const wrapRect = wrap.getBoundingClientRect();
  const above = wrapRect.top - stageTop + 8; // 8 = 게임 카드 위 여백(scroll-margin)
  const toastSpace = parseFloat(getComputedStyle(els.toast).minHeight) || 0;
  const below = els.toast.getBoundingClientRect().top - wrapRect.bottom + toastSpace + 12; // 방향 버튼(아래에 있을 때)·안내 줄
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const maxW = play.clientWidth - (sideBySide ? dpad.offsetWidth + 12 : 0);
  const w = Math.max(160, Math.min(maxW, (viewH - above - below) * ratio));
  wrap.style.width = `${Math.floor(w)}px`;
}

function stopGame() {
  stopHomeDemo();
  runToken += 1;
  $('#quarter').hidden = true;
  if (ctl) {
    ctl.destroy();
    ctl = null;
  }
  els.over.hidden = true;
  showPaused(false);
  clearToasts();
  audio.stopMusic();
}

// ---------- 일시정지 (버튼 · 스페이스 키) ----------
function showPaused(on) {
  $('#pause').hidden = !on;
  const btn = $('#btn-pause');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? '▶' : '⏸';
  btn.setAttribute('aria-label', on ? '계속하기' : '일시정지');
  if (on) {
    // 열 때마다 규칙 블록을 닫힌 상태로 새로 그린다
    $('#pause-note').innerHTML = isRhythm()
      ? rhythmMode === 'defence'
        ? '① 0.9m 원이 빛나는 박에 🧍 멈춤 → ② 슈터 머리 위 원이 작아질 때 ✋ 블록!<br />리바운드는 두 버튼 중 아무거나.'
        : '파란 원이 링에 겹칠 때 🎯 슛! 서클 밖에서는 🤝 패스.<br />리바운드는 두 버튼 중 아무거나.'
      : '선택한 포지션의 구역 안에서만 움직여요.<br />벽은 튕기고, 다른 구역에 들어가면 <b>오프사이드 −10점</b>!';
    if (isPass()) $('#pause-note').innerHTML = '받을 동료를 눌러 패스! 숏 패스·서드 건너뛰기는 반칙이에요.';
    $('#pause-rules').innerHTML = isPass() ? passRulesHtml('pause') : isRhythm() ? rhythmRulesHtml('pause', rhythmMode) : rulesHtml('pause');
    bindRuleTabs($('#pause-rules'));
    linkifyRules($('#pause'), { newTab: true }); // 경기 중이라 새 탭으로
  }
}

function togglePause() {
  if (!ctl || !els.over.hidden || ctl.inBreak()) return; // 게임 중이 아니거나, 끝났거나, 쉬는 시간이면 무시
  const on = !ctl.isPaused();
  if (!ctl.setPaused(on)) return;
  showPaused(on);
  if (on) audio.stopMusic();
  else if (current.id === 'snake') audio.startMusic();
  else if (isPass()) audio.startMusic('puzzle'); // 리듬 슈팅은 배경음악 대신 박자 소리
}

/**
 * 게임 코드 + 게임 화면(캔버스) 글꼴을 함께 준비한다.
 * 캔버스 글씨는 한 번 그리면 다시 그리지 않으므로, 굵은 글꼴(주아)을 먼저 받아 둔다. 느리면 1.5초 뒤 기본 글꼴로 진행.
 */
const CANVAS_TEXT = '골서클센터드공격수비슛패스시작준비잘했어요좋아요아웃반칙파울다시점수콤보스테이지 0123456789GSAWCDK!?';
function loadWithFonts(game) {
  const fonts = document.fonts?.load
    ? Promise.race([document.fonts.load(`700 20px ${FONT}`, CANVAS_TEXT), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
    : null;
  return Promise.all([game.load(), fonts]).then(([start]) => start);
}

async function startGame(choicePos, choiceMode) {
  if (isRhythm()) return startRhythm(choicePos);
  if (isPass()) return startPassStage(choicePos);
  stopGame();
  const token = runToken;
  startPosition = choicePos; // '다시' 할 때도 같은 선택(랜덤이면 다시 랜덤)
  startMode = choiceMode;
  const { pos, mode } = resolveChoice(choicePos, choiceMode);
  const rolled = choicePos === RANDOM || (pos === 'C' && choiceMode === RANDOM);
  audio.unlock(); // 클릭 안에서 깨워야 브라우저가 소리를 허용한다
  passTipShown = false;
  els.intro.hidden = true;
  els.stage.hidden = false; // Phaser가 부모 크기를 읽으므로 먼저 보이게 한다
  // 시작 버튼이 화면 아래쪽에 있었다면 스크롤이 남아 코트가 잘리므로, 게임 화면으로 맞춘다.
  els.stage.scrollIntoView({ block: 'start' });
  renderHud({ position: pos, mode: modeFor(pos, mode), score: 0 });
  gameLog = [];
  ruleLog = createRuleLog();
  clearToasts();
  fitCourt();
  showToast('불러오는 중…');

  let start;
  try {
    start = await loadWithFonts(current);
  } catch (err) {
    errorLog.report({ kind: 'load', message: `게임 불러오기 실패(${current.id}): ${err?.message ?? err}`, stack: err?.stack });
    showToast('게임을 불러오지 못했어요. 새로고침 해주세요.', 'bad');
    return;
  }
  if (token !== runToken) return; // 로딩 중에 그만뒀다
  clearToasts();
  audio.startMusic();
  if (rolled) {
    const m = modeFor(pos, mode) === 'defence' ? '🛡️ 수비' : '⚔️ 공격';
    showToast(`🎲 랜덤 결과: ${pos} ${POSITIONS[pos].name} (${m})`, 'good', 4000);
  }

  ctl = start({
    parent: els.parent,
    position: pos,
    mode,
    orientation: orientationNow(),
    hooks: {
      onHud: renderHud,
      onClock: ({ quarter, clock }) => {
        $('#hud-clock').textContent = `${quarter}Q ${clock}`;
      },
      onQuarterEnd: showQuarterEnd,
      onBreakTick: (ms) => {
        $('#q-break').textContent = `쉬는 시간 ${Math.ceil(ms / 1000)}초 남음 (${breakLabel}) — 바로 시작해도 돼요`;
      },
      onQuarterStart: ({ quarter, swapEnds, ourCentre }) => {
        $('#quarter').hidden = true;
        ruleLog.add('changeEnds');
        ruleLog.add('centreAlternate');
        const where = orientationNow() === 'portrait' ? (swapEnds ? '아래' : '위') : swapEnds ? '왼쪽' : '오른쪽';
        showToast(`${quarter}쿼터! 진영이 바뀌어 우리 골은 ${where}이에요 · ${ourCentre ? '우리 팀' : '상대 팀'} 센터 패스 (Rule 2.2·8.1)`, 'good', 5000);
      },
      onBall: (ev) => {
        audio.sfx(ev.type === 'block' ? (ev.circle ? 'circleBlock' : 'block') : ev.goal ? 'goal' : 'ball');
        if (ev.goal) ruleLog.add('shooting');
        if (ev.penaltyShot) showToast('페널티 슛 성공! 🎯', 'good');
        if (ev.circle) ruleLog.add('circleDefence');
      },
      onSub: ({ from, to, mode: m }) => {
        audio.sfx('sub');
        showToast(subMessage(from, to, m), 'good', 6000); // 읽을 내용이 많아 조금 더 오래 보여준다
      },
      onPassStart: () => {
        if (passTipShown) return;
        passTipShown = true;
        showToast('공을 잡았어요! 파란 동료에게 3초 안에 패스해 봐요', 'good');
      },
      onPass: ({ chain, centre }) => {
        ruleLog.add(centre ? 'centrePass' : 'heldBall');
        if (centre) showToast('센터 패스 성공! 👏', 'good');
        audio.sfx('pass');
        if (chain >= 3) showToast(`패스 ${chain}연속! 👏`, 'good');
      },
      onHeld: () => {
        audio.sfx('whistleShort');
        ruleLog.add('heldBall');
        showToast('3초가 지났어요. 공을 잡으면 3초 안에 패스해야 해요 (Rule 11.4)');
      },
      onOppEnter: ({ who }) => {
        audio.sfx('sub');
        showToast(`상대 팀 맞수 ${who} 등장! 맞수는 나와 같은 구역에서 뛰어요`, 'bad');
      },
      onFoul: ({ who, lost }) => {
        audio.sfx('whistle');
        ruleLog.add('contact');
        ruleLog.add('outOfPlay');
        const what = lost === 'pass' ? '잡고 있던 공이' : lost === 'ball' ? '공이' : '공격권이';
        showToast(`🚨 내 접촉 반칙! 상대 팀 ${who}와 부딪혀서 ${what} 상대에게 넘어갔어요 (Rule 17)`, 'bad', 4500);
        showToast(`상대 팀 ${who}가 그 자리에서 페널티 패스! 공이 손을 떠날 때까지 나는 아웃 오브 플레이예요 (Rule 6.4)`, 'bad', 4500);
      },
      onPenaltyRelease: () => showToast('공이 손을 떠났어요 → 다시 플레이! (Rule 6.4c)', 'good', 2500),
      onPenalty: ({ who, shot }) => {
        audio.sfx('whistle');
        ruleLog.add('obstruction');
        ruleLog.add('outOfPlay');
        showToast(`🚨 상대 팀 ${who} 장애 반칙 → 우리 팀 페널티 패스! 상대 ${who}는 패스가 끝날 때까지 못 움직여요 (Rule 6.4·16.1)`, 'good', 5000);
        if (shot) {
          ruleLog.add('penaltyShoot');
          showToast('골 서클 안 페널티 패스예요! 동료에게 패스(+20)하거나 골대 앞 ‘슛’ 칸으로 슛(+30)할 수 있어요 (Rule 6.6)', 'good', 6000);
        }
      },
      onIntercept: ({ who, what, legal }) => {
        audio.sfx('offside');
        if (legal) ruleLog.add('interception');
        const how = legal ? ' 0.9m를 지킨 정당한 인터셉트예요 (Rule 16.6)' : '';
        showToast(`상대 팀 ${who}가 ${what === 'pass' ? '패스를' : '공을'} 가로챘어요!${how}`, 'bad', legal ? 4500 : 3600);
      },
      onWhistle: ({ centre, ours } = {}) => {
        audio.sfx('whistle');
        ruleLog.add('quarters');
        ruleLog.add('centrePass');
        if (!centre) showToast(`${ours ? '우리 팀' : '상대 팀'} 센터 패스! 공은 센터 서클에서 센터 서드로 (Rule 8.14)`, 'good', 4000);
        if (centre) showToast('센터 패스! 센터 서드 안의 파란 동료에게 3초 안에 패스해 봐요 (Rule 8.14)', 'good', 5000);
      },
      onBreaking: () => {
        const now = performance.now();
        if (now - lastBadTurnToast < 1500) return;
        lastBadTurnToast = now;
        audio.sfx('whistleShort');
        ruleLog.add('breaking');
        showToast('휘슬 전에는 움직일 수 없어요 (브레이킹 반칙 · Rule 8.11)', 'bad');
      },
      onBadTurn: () => {
        // 연타해도 토스트가 깜빡이지 않게 1.5초에 한 번만
        const now = performance.now();
        if (now - lastBadTurnToast < 1500) return;
        lastBadTurnToast = now;
        showToast('반대 방향으로는 바로 돌 수 없어요. 옆으로 한 번 꺾은 뒤 돌아요', 'bad');
      },
      onWall: () => {
        audio.sfx('wall');
        showToast('벽이에요! 옆으로 튕겨 나왔어요');
      },
      onOffside: ({ position: p, zone, penalty }) => {
        audio.sfx('whistleShort'); // 심판 휘슬 (반칙)
        ruleLog.add('offside');
        showToast(`오프사이드! ${p}는 ${ZONE_NAMES[zone]}(${zone}구역)에 들어갈 수 없어요${penalty ? ` −${penalty}점` : ''}`, 'bad');
      },
      onConceded: ({ position: p }) => {
        audio.sfx('conceded');
        showToast(`실점! 공이 ${p} 구역을 빠져나갔어요`, 'bad');
      },
      onOver: showOver,
    },
  });
}

// ---------- 패스 퍼즐 실행 ----------
let passStageId = null;
function syncPassPad(phase, result) {
  const pad = $('#ppad');
  pad.querySelector('[data-act="start"]').hidden = phase !== 'place';
  pad.querySelector('[data-act="shoot"]').hidden = phase !== 'play';
  const i = PASS_STAGES.findIndex((s) => s.id === passStageId);
  const next = PASS_STAGES[i + 1];
  pad.querySelector('[data-act="next"]').hidden = !(phase === 'done' && result?.win && next);
  pad.querySelector('[data-act="quit"]').hidden = !(phase === 'done' && result); // 반칙으로 실패했거나 클리어했을 때
}

async function startPassStage(stageId) {
  stopGame();
  const token = runToken;
  passStageId = stageId;
  startPosition = stageId;
  const stage = PASS_STAGES.find((s) => s.id === stageId) ?? PASS_STAGES[0];
  audio.unlock();
  els.intro.hidden = true;
  els.stage.hidden = false;
  els.stage.scrollIntoView({ block: 'start' });
  gameLog = [];
  ruleLog = createRuleLog();
  clearToasts();
  syncPassPad('play');
  // 스테이지 설명은 알림처럼 사라지지 않고 코트 위에 계속 보인다
  $('#stage-brief').innerHTML = `<p class="goal">🎯 <b>목표</b> ${stage.goal}</p><p class="hint">💡 ${stage.hint}</p>`;
  fitCourt(); // 설명 높이까지 빼고 코트 크기를 맞춘다
  let start;
  try {
    start = await loadWithFonts(current);
  } catch (err) {
    errorLog.report({ kind: 'load', message: `게임 불러오기 실패(${current.id}): ${err?.message ?? err}`, stack: err?.stack });
    showToast('게임을 불러오지 못했어요. 새로고침 해주세요.', 'bad');
    return;
  }
  if (token !== runToken) return;
  audio.startMusic('puzzle'); // 패스 퍼즐 전용 느긋한 배경음악 (🎵 버튼으로 끄기)
  let lastResult = null;
  ctl = start({
    parent: els.parent,
    stageId,
    orientation: orientationNow(),
    hooks: {
      onHud: ({ stage: st, index, passes, phase }) => {
        $('#hud-pos').innerHTML = `<b>${index + 1}</b><span class="long"> · ${st.title}</span>`;
        $('#hud-pos').dataset.group = 'centre';
        $('#hud-clock').textContent = `패스 ${passes} · 기준 ${st.par}`;
        const best = passProgress[st.id] ?? 0;
        $('#hud-score').textContent = best ? '⭐'.repeat(best) : '-';
        $('#hud-zone').textContent = st.goal;
        syncPassPad(phase, lastResult);
        if (phase !== 'done') lastResult = null;
      },
      onEvent: (ev) => {
        if (ev.type === 'pass' && ev.ok) audio.sfx('pass');
        else if (ev.type === 'fail') {
          audio.sfx('whistle');
          showToast(failText(ev), 'bad', 6000);
        } else if (ev.type === 'goal') audio.sfx('goal');
        else if (ev.type === 'step') {
          audio.sfx('wall');
          showToast(ev.thirdChanged ? '한 발 피벗! 옆 서드로 디뎠지만 다음 패스는 처음 잡은 서드 기준이에요 (Rule 12.5)' : '한 발 피벗! 두 번째 발은 반칙이에요 (Rule 13)', 'good', 3500);
        } else if (ev.type === 'noPivot') showToast('이 스테이지는 피벗 없이 풀어요 (피벗은 풋워크 챕터에서 배워요)', 'info', 2500);
        else if (ev.type === 'placeError') {
          audio.sfx('offside');
          const names = ev.problems.map((p) => `${p.pos}${p.reason === 'offside' ? '(구역 밖)' : '(자리 겹침)'}`).join(', ');
          showToast(`아직 시작할 수 없어요: ${names}. 빗금이 아닌 자기 구역에 세워 봐요 (Rule 14)`, 'bad', 4500);
        } else if (ev.type === 'fixed') showToast(`${ev.pos}는 고정이에요. 노란 테두리 선수만 옮길 수 있어요`, 'info', 2500);
        else if (ev.type === 'placed') showToast('시작! 공을 가진 선수에서 받을 동료를 누르면 패스돼요', 'good', 3000);
      },
      onResult: (r) => {
        lastResult = r;
        if (r.win) {
          const prev = passProgress[r.stage.id] ?? 0;
          if (r.stars > prev) {
            passProgress = { ...passProgress, [r.stage.id]: r.stars };
            store.set('netball.pass', JSON.stringify(passProgress));
          }
          const next = PASS_STAGES[r.index + 1];
          showToast(`${'⭐'.repeat(r.stars)} 클리어! 패스 ${r.passes}번 (기준 ${r.par}번)${r.stars < 3 ? ' — 더 적은 패스로 ⭐⭐⭐에 도전!' : ''}${next ? ' · 다음 스테이지가 열렸어요' : ' · 모든 스테이지 완료! 🎉'}`, 'good', 6000);
        }
        syncPassPad('done', r);
        $('#hud-score').textContent = passProgress[r.stage.id] ? '⭐'.repeat(passProgress[r.stage.id]) : '-';
      },
    },
  });
}

$('#ppad').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn || !ctl) return;
  const act = btn.dataset.act;
  if (act === 'quit') {
    route(); // 홈(스테이지 목록)으로
    return;
  }
  if (act === 'next') {
    const i = PASS_STAGES.findIndex((s) => s.id === passStageId);
    if (PASS_STAGES[i + 1] && isUnlocked(passProgress, i + 1)) startPassStage(PASS_STAGES[i + 1].id);
    return;
  }
  if (act === 'retry') clearToasts();
  ctl.input(act);
});

/** 홈의 최고 기록 줄: 고른 모드 칸 (난이도는 보통 하나) */
function bestLine(modes, diff) {
  const label = { attack: '🎯 공격', defence: '🛡️ 수비' };
  return modes
    .map((m) => {
      const b = bestFor(rhythmSave, m, diff);
      const head = label[m];
      return b
        ? `🏆 ${head} 최고 <b>${b.score.toLocaleString()}점</b> · 🔥 ${b.combo}연속 <span class="muted small">(${b.position} · ${b.date})</span>`
        : `🏆 ${head} — 아직 기록이 없어요. 첫 기록을 남겨 봐요!`;
    })
    .join('<br />');
}

// ---------- 리듬 슈팅 실행 ----------
function renderRhythmHud(s) {
  $('#hud-pos').innerHTML = `<b>${s.position}</b><span class="long"> · ${POSITIONS[s.position].name}</span>`;
  const mode = rhythmModeOf(s.position);
  $('#hud-pos').dataset.group = mode;
  $('#hud-score').textContent = String(s.score);
  const what = mode === 'attack' ? '🎯 골 서클 안에서만 슛 · 밖에서는 패스' : '🛡️ ① 0.9m에 멈춤 → ② 공이 올라갈 때 블록';
  const note = `${s.position} — ${what}${s.bpm ? ` · ${s.bpm} BPM` : ''}`;
  $('#hud-zone').textContent = note;
  $('#hud-zone').title = note;
}

async function startRhythm(choicePos) {
  stopGame();
  const token = runToken;
  startPosition = choicePos;
  const pos = choicePos === RANDOM ? RHYTHM_POSITIONS[Math.floor(Math.random() * RHYTHM_POSITIONS.length)] : choicePos;
  // 아래 두 버튼: 공격(패스 · 슛) / 수비(멈춤 · 블록)
  rhythmMode = rhythmModeOf(pos);
  const bestBefore = bestFor(rhythmSave, rhythmMode, rhythmDiff)?.score ?? 0;
  let recordToast = false;
  const labels = RHYTHM_BUTTONS[rhythmMode];
  $('#rpad [data-act="pass"]').innerHTML = `${labels.pass} <small>↓</small>`;
  $('#rpad [data-act="shoot"]').innerHTML = `${labels.shoot} <small>↑</small>`;
  audio.unlock();
  els.intro.hidden = true;
  els.stage.hidden = false;
  els.stage.scrollIntoView({ block: 'start' });
  renderRhythmHud({ position: pos, score: 0 });
  $('#hud-clock').textContent = '1Q 15:00';
  gameLog = [];
  ruleLog = createRuleLog();
  clearToasts();
  fitCourt();
  showToast('불러오는 중…');
  let start;
  try {
    start = await loadWithFonts(current);
  } catch (err) {
    errorLog.report({ kind: 'load', message: `게임 불러오기 실패(${current.id}): ${err?.message ?? err}`, stack: err?.stack });
    showToast('게임을 불러오지 못했어요. 새로고침 해주세요.', 'bad');
    return;
  }
  if (token !== runToken) return;
  clearToasts();
  if (choicePos === RANDOM) showToast(`🎲 랜덤 결과: ${pos} ${POSITIONS[pos].name}`, 'good', 3000);
  ctl = start({
    parent: els.parent,
    position: pos,
    difficulty: rhythmDiff,
    hooks: {
      ...rhythmHooks({ showToast, ruleLog: () => ruleLog, audio }),
      onHud: (snap) => {
        renderRhythmHud(snap);
        if (bestBefore > 0 && !recordToast && snap.score > bestBefore) {
          recordToast = true; // 한 경기에 한 번만
          audio.sfx('badge');
          showToast(`🏆 최고 기록 돌파! (이전 ${bestBefore.toLocaleString()}점)`, 'good', 3500);
        }
      },
      onClock: ({ quarter, clock }) => {
        $('#hud-clock').textContent = `${quarter}Q ${clock}`;
      },
      onQuarterEnd: showQuarterEnd,
      onBreakTick: (ms) => {
        $('#q-break').textContent = `쉬는 시간 ${Math.ceil(ms / 1000)}초 남음 (${breakLabel}) — 바로 시작해도 돼요`;
      },
      onQuarterStart: ({ quarter, bpm }) => {
        $('#quarter').hidden = true;
        showToast(`${quarter}쿼터! 박자가 빨라졌어요 (${bpm} BPM)`, 'good', 3500);
      },
      onOver: showOver,
    },
  });
}

// ---------- 결과 / 닉네임 등록 ----------
// 자기 몸에 부딪혔을 때 무작위로 하나 (토스트 + 종료 화면)
const CRASH_MESSAGES = [
  '꼬리가 길면 밟힌다더니...',
  '내 몸이 제일 끈질긴 수비수였네요',
  '셀프 블로킹! 상대 팀이 박수 쳐요 👏',
  '앗, 내 꼬리에 걸려 넘어졌어요',
  '코트가 좁은 게 아니라 내가 길었던 거예요',
  '뱀은 자기 꼬리를 무는 게 아니랍니다…',
  '너무 신나서 내 몸을 못 봤어요',
  '다음엔 크게 돌아서 가요!',
];

const REASONS = {
  fulltime: '🏁 풀타임! 4쿼터 경기가 끝났어요.',
  crash: '자기 몸에 부딪혔어요.',
  full: '코트를 가득 채웠어요. 대단해요!',
};

// ---------- 쿼터 사이 (쉬는 시간) ----------
const QUARTER_REASONS = {
  time: '⏱️ 쿼터 시간이 끝났어요',
  crash: '💥 몸에 부딪혀서 이번 쿼터가 일찍 끝났어요',
  full: '🎉 코트를 가득 채웠어요!',
};
let breakLabel = '';
function showQuarterEnd({ quarter, reason, quarterScore, totalScore, next, nextSwap, nextOurCentre }) {
  audio.sfx('whistle');
  $('#q-title').textContent = `${quarter}쿼터 끝!`;
  $('#q-reason').textContent = QUARTER_REASONS[reason] ?? '';
  $('#q-score').textContent = String(quarterScore);
  $('#q-total').textContent = String(totalScore);
  const portrait = orientationNow() === 'portrait';
  const goal = nextSwap ? (portrait ? '아래' : '왼쪽') : portrait ? '위' : '오른쪽';
  $('#q-next').textContent = isRhythm()
    ? `다음은 ${next}쿼터: 박자가 더 빨라져요!`
    : `다음은 ${next}쿼터: 진영 교대로 우리 골이 ${goal}에 있어요 · ${nextOurCentre ? '우리 팀' : '상대 팀'} 센터 패스로 시작 (Rule 2.2·8.1)`;
  breakLabel = quarter === 2 ? '하프타임 · 실제 12분' : '실제 4분';
  $('#q-break').textContent = '';
  $('#quarter').hidden = false;
}
$('#btn-next-quarter').addEventListener('click', () => ctl?.nextQuarter());
$('#btn-q-quit').addEventListener('click', route);

// ---------- 경기 후 복습 (경기 기록 · 규칙) ----------
/** 경기 복습: 이번 판 기록. 0인 항목도 보여 줘서 무엇을 더 해 볼지 알 수 있게 */
function renderReview(r) {
  const rows = isRhythm() ? rhythmReviewRows(r) : snakeReviewRows(r);
  fillReview(rows);
}

function snakeReviewRows(r) {
  const rows = [
    ['🏐', '먹은 공 · 막은 공', `${r.balls}개`],
    ['🎯', '슈팅 성공 (GS·GA 골 서클)', `${r.goals ?? 0}번`],
    ['🧱', '막은 공 (서클 안 +30)', `${r.blocks ?? 0}개 (${r.circleBlocks ?? 0}개)`],
    ['🤝', '3초 패스 성공', `${r.passes}번 (최대 ${r.bestChain}연속)`],
    ['🚩', '오프사이드', `${r.offsides}번`],
    ['🚨', '내 접촉 반칙', `${r.contacts}번`],
    ['🟢', '맞수 장애 반칙 → 페널티 패스', `${r.penaltiesWon ?? 0}번`],
    ['🥷', '맞수에게 가로채임', `${r.intercepts ?? 0}번`],
  ];
  if (r.mode === 'defence' || r.conceded) rows.push(['💔', '실점', `${r.conceded}번`]);
  if (r.played?.length > 1) rows.push(['🔁', '뛴 포지션', r.played.join(' → ')]);
  if (r.quarters?.length) {
    const mark = { crash: '💥', conceded: '💔', full: '🎉' };
    rows.unshift(['⏱️', '쿼터별 점수', r.quarters.map((q) => `${q.quarter}Q ${q.score}${mark[q.reason] ?? ''}`).join(' · ')]);
  }
  return rows;
}

function fillReview(rows) {
  const list = $('#review-stats');
  list.replaceChildren(
    ...rows.map(([icon, label, value]) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="i"></span><span class="l"></span><b class="v"></b>';
      li.querySelector('.i').textContent = icon;
      li.querySelector('.l').textContent = label;
      li.querySelector('.v').textContent = value;
      return li;
    }),
  );
  // 규칙 복습: 이번 경기에서 직접 겪은 실제 넷볼 규칙
  const rules = ruleLog.entries();
  const ruleList = $('#review-rules-list');
  if (rules.length === 0) {
    ruleList.innerHTML = '<li class="muted">이번 경기에서는 따로 겪은 규칙이 없어요.</li>';
  } else {
    ruleList.replaceChildren(
      ...rules.map((n) => {
        const li = document.createElement('li');
        li.innerHTML = '<div class="h"><b class="t"></b><span class="r"></span><span class="n"></span></div><p></p>';
        li.querySelector('.t').textContent = n.title;
        li.querySelector('.r').textContent = n.rule;
        const ch = chapterOf(n.rule);
        if (ch) {
          const link = document.createElement('a');
          link.className = 'rule-more';
          link.href = `#/rules/${ch}`;
          link.target = '_blank'; // 경기 결과 화면은 그대로 두고 새 탭에서
          link.rel = 'noopener';
          link.textContent = '넷볼 규칙 사전 →';
          li.querySelector('.h').append(link);
        }
        li.querySelector('.n').textContent = n.count > 1 ? `×${n.count}` : '';
        li.querySelector('p').textContent = n.text;
        return li;
      }),
    );
  }
  // 알림 다시 보기: 경기 중 떴던 알림 전부 (스크롤)
  const logList = $('#review-log-list');
  if (gameLog.length === 0) logList.innerHTML = '<li class="muted">알림이 없었어요.</li>';
  else {
    logList.replaceChildren(
      ...gameLog.map((g) => {
        const li = document.createElement('li');
        li.dataset.kind = g.kind;
        li.innerHTML = '<span class="c"></span><span class="x"></span>';
        li.querySelector('.c').textContent = g.clock;
        li.querySelector('.x').textContent = g.text;
        return li;
      }),
    );
  }
  // 두 토글은 닫힌 채로 시작, 하나를 열면 다른 하나는 닫힌다
  document.querySelectorAll('.review-tabs .info-tab').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
    $(`#${t.getAttribute('aria-controls')}`).hidden = true;
  });
}
bindRuleTabs(document.querySelector('.review-tabs').parentElement, '.review-tabs .info-tab');

function showOver(r) {
  audio.stopMusic();
  result = r;
  const crashMsg = r.reason === 'crash' ? CRASH_MESSAGES[Math.floor(Math.random() * CRASH_MESSAGES.length)] : null;

  renderOverPicks();
  // 배지 판정·저장 (게임마다 따로: 존 스네이크 'netball.profile' · 리듬 슈팅 'netball.rhythm')
  let out;
  let recordText = '';
  if (isRhythm()) {
    const ro = applyRhythmResult(rhythmSave, r);
    rhythmSave = ro.save;
    store.set('netball.rhythm', serializeRhythmSave(rhythmSave));
    out = { earned: ro.earned };
    if (ro.newRecord) recordText = ro.prev ? ` 🎉 새 최고 기록! (이전 ${ro.prev.score.toLocaleString()}점)` : ' 🎉 첫 기록이에요!';
  } else {
    out = applyResult(profile, r);
    profile = out.profile;
    store.set('netball.profile', JSON.stringify(profile));
  }
  const earnedEl = $('#over-badges');
  // 획득한 배지를 누르면 아래에 설명이 나온다 (다시 누르면 닫힘)
  const descEl = $('#over-badge-desc');
  descEl.hidden = true;
  earnedEl.replaceChildren(
    ...out.earned.map((b) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${b.icon} ${b.title}`;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'over-badge-desc');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        earnedEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-expanded', 'false'));
        btn.setAttribute('aria-expanded', String(open));
        descEl.textContent = `${b.icon} ${b.title} — ${b.desc}`;
        descEl.hidden = !open;
      });
      li.append(btn);
      return li;
    }),
  );
  earnedEl.hidden = out.earned.length === 0;
  audio.sfx(out.earned.length ? 'badge' : 'over');
  if (out.earned.length) showToast(`🏅 새 배지! ${out.earned.map((b) => b.title).join(', ')}`, 'good');
  else if (crashMsg) showToast(`💥 ${crashMsg} 경기 종료!`, 'bad');
  submitted = false;
  $('#over-reason').textContent = (crashMsg ? `💥 ${crashMsg}` : (REASONS[r.reason] ?? '경기 종료')) + recordText;
  $('#over-score').textContent = String(r.score);
  renderReview(r);
  els.nick.value = store.get('netball.nick') ?? '';
  els.overMsg.textContent = '';
  els.btnSubmit.disabled = false;

  const canSubmit = r.score > 0;
  els.overForm.hidden = !canSubmit;
  if (!canSubmit) els.overMsg.textContent = '0점은 리더보드에 등록하지 않아요.';
  els.over.hidden = false;
  if (canSubmit && matchMedia('(hover: hover)').matches) els.nick.focus();
}

els.overForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!result || submitted) return;
  const nickname = els.nick.value.trim();
  if (!nickname) {
    els.overMsg.textContent = '닉네임을 입력해 주세요.';
    return;
  }
  els.btnSubmit.disabled = true;
  els.overMsg.textContent = '등록 중…';
  try {
    const out = await submitScore({
      game: current.id,
      nickname,
      score: result.score,
      durationMs: result.durationMs,
      meta: isRhythm()
        ? {
            goals: result.goals, shots: result.shots, perfects: result.perfects, bestCombo: result.bestCombo, rebounds: result.rebounds,
            blocks: result.blocks, conceded: result.conceded, position: result.position, mode: result.mode, difficulty: result.difficulty,
          }
        : {
            balls: result.balls, offsides: result.offsides, conceded: result.conceded, passes: result.passes,
            position: result.position, mode: result.mode,
          },
    });
    submitted = true;
    store.set('netball.nick', nickname);
    lastSubmitted = { nickname, score: result.score };
    els.overMsg.innerHTML = `🎉 현재 ${Number(out.rank)}위로 등록됐어요! <a href="#/board">랭킹 보기</a>`;
    els.overForm.hidden = true;
  } catch (err) {
    els.overMsg.textContent = ERROR_TEXT[err.code] ?? '등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    els.btnSubmit.disabled = false;
  }
});

$('#btn-again').addEventListener('click', () => startGame(startPosition, startMode));
$('#btn-pause').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', togglePause);
$('#btn-pause-quit').addEventListener('click', route);

// 스페이스 키 = 일시정지/계속. 버튼에 포커스가 있어도 버튼이 눌리지 않도록 keyup까지 막는다.
const spaceForPause = (e) => {
  if (e.code !== 'Space' || !ctl || els.stage.hidden || !els.over.hidden) return false;
  const t = e.target;
  return !(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement);
};
window.addEventListener('keydown', (e) => {
  if (!spaceForPause(e)) return;
  e.preventDefault();
  if (!e.repeat) togglePause();
});
window.addEventListener('keyup', (e) => {
  if (spaceForPause(e)) e.preventDefault();
});
$('#btn-again-random').addEventListener('click', () => startGame(RANDOM, RANDOM));
$('#btn-home').addEventListener('click', route);

// 종료 화면: 포지션을 골라 바로 시작 (C는 홈에서 고른 공격/수비 설정을 따른다 · 리듬 슈팅은 GS·GA만)
function renderOverPicks() {
  const keys = isRhythm() ? RHYTHM_POSITIONS : CHIP_ORDER;
  $('#over-picks').innerHTML = keys
    .map((k) => `<button type="button" class="pick" data-pos="${k}" data-group="${groupOf(k)}" title="${POSITIONS[k].name}">${k}</button>`)
    .join('');
  $('#btn-again-random').textContent = '🎲 랜덤 포지션으로 다시';
}
$('#over-picks').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-pos]');
  if (!btn) return;
  if (isRhythm()) {
    rhythmPos = btn.dataset.pos;
    store.set('netball.rpos', rhythmPos);
    startGame(rhythmPos);
    return;
  }
  position = btn.dataset.pos;
  store.set('netball.pos', position);
  startGame(position, centreMode);
});
$('#btn-quit').addEventListener('click', route);

// 소리 켜기/끄기 (설정은 기억된다)
function syncSoundButtons() {
  const { sfx, music } = audio.getSettings();
  $('#btn-sfx').setAttribute('aria-pressed', String(sfx));
  $('#btn-music').setAttribute('aria-pressed', String(music));
}
$('#btn-sfx').addEventListener('click', () => {
  audio.setSfx(!audio.getSettings().sfx);
  syncSoundButtons();
});
$('#btn-music').addEventListener('click', () => {
  audio.setMusic(!audio.getSettings().music);
  syncSoundButtons();
});
syncSoundButtons();

// 모바일 방향 버튼
$('#dpad').addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button[data-dir]');
  if (!btn) return;
  e.preventDefault();
  ctl?.input(btn.dataset.dir);
});

// 리듬 슈팅 슛·패스 버튼 (누르는 순간 판정되도록 pointerdown)
$('#rpad').addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  e.preventDefault();
  ctl?.input(btn.dataset.act);
});

// ---------- 랭킹·댓글 페이지 ----------
const board = createBoard({ rankingEl: els.board, commentsEl: els.comments, store, getHighlight: () => lastSubmitted });

// 폰을 돌리면: 게임 중이면 일시정지하고 코트를 새 방향으로 다시 그린다 (계속하기로 이어서)
// 기기마다 알려주는 이벤트가 달라서 change·resize 둘 다 듣고, 방향이 실제로 바뀌었을 때만 처리한다.
function syncOrientation() {
  const o = orientationNow();
  if (o === document.body.dataset.orient) return;
  document.body.dataset.orient = o;
  fitCourt();
  if (homeDemo && !els.intro.hidden) {
    renderIntro(); // 맛보기·연습 중에 폰을 돌리면 처음 상태로 다시 그린다
    return;
  }
  const shown = isRhythm() ? rhythmPos : position;
  if (!els.intro.hidden && $('#preview') && shown !== RANDOM) drawCourtPreview($('#preview'), shown, o);
  if (!ctl) return;
  if (!ctl.isPaused() && els.over.hidden) togglePause();
  ctl.setOrientation(o);
}
portraitQuery.addEventListener('change', syncOrientation);
window.addEventListener('resize', () => {
  syncOrientation();
  fitCourt(); // 창 크기를 바꾸면 게임 중에도 코트 크기를 다시 맞춘다
});
window.visualViewport?.addEventListener('resize', fitCourt); // 폰 주소창이 나타나거나 사라질 때

// 범례의 동료·맞수 표시도 게임 속 캐릭터 아이콘으로
document.querySelector('.legend .dot.pass')?.replaceWith(document.createRange().createContextualFragment(TEAMMATE_ICON));
document.querySelector('.legend .dot.opp')?.replaceWith(document.createRange().createContextualFragment(OPP_ICON));
document.querySelector('.legend .dot.ball')?.replaceWith(document.createRange().createContextualFragment(BALL_ICON));
document.querySelector('.legend .dot.roll')?.replaceWith(document.createRange().createContextualFragment(ROLL_ICON));

// ---------- 오류·아이디어 신고 ----------
const reportDialog = $('#report-dialog');
const reportMsg = $('#report-msg');
function openReport(kind) {
  if (ctl && !ctl.isPaused() && els.over.hidden) togglePause(); // 게임 중이면 멈춰 두고 쓴다
  if (kind) reportDialog.querySelector(`input[name="kind"][value="${kind}"]`).checked = true;
  reportMsg.textContent = '';
  $('#report-send').disabled = false;
  if (typeof reportDialog.showModal === 'function') reportDialog.showModal();
  $('#report-message').focus();
}
$('#btn-report').addEventListener('click', () => openReport());
// 게임 화면 안의 '🐞 문제 신고' (일시정지 · 경기 종료)
document.querySelectorAll('.btn-bug').forEach((b) => b.addEventListener('click', () => openReport('bug')));
$('#report-cancel').addEventListener('click', () => reportDialog.close());
$('#report-message').addEventListener('input', (e) => {
  $('#report-count').textContent = String(e.target.value.length);
});
$('#report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = $('#report-message').value.trim();
  if (message.length < 2) {
    reportMsg.textContent = '내용을 2자 이상 적어 주세요.';
    return;
  }
  const playing = !els.stage.hidden;
  const snap = playing ? { position: $('#hud-pos b')?.textContent, mode: $('#hud-zone').textContent.startsWith('🛡️') ? 'defence' : 'attack' } : {};
  $('#report-send').disabled = true;
  reportMsg.textContent = '보내는 중…';
  try {
    await submitReport({
      kind: reportDialog.querySelector('input[name="kind"]:checked').value,
      message,
      context: {
        page: `${current.id}${playing ? ':playing' : ''}`,
        ...snap,
        orientation: orientationNow(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        ua: navigator.userAgent,
        error: errorLog.lastError()?.message, // 최근 자동 기록 오류 (있으면)
      },
    });
    $('#report-message').value = '';
    $('#report-count').textContent = '0';
    reportMsg.textContent = '';
    reportDialog.close();
    showToast('보내 주셔서 고마워요! 💚', 'good');
  } catch (err) {
    reportMsg.textContent =
      err.code === 'too_fast'
        ? '조금 전에 보냈어요. 10초 뒤에 다시 보내 주세요.'
        : (ERROR_TEXT[err.code] ?? '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    $('#report-send').disabled = false;
  }
});

setupInstall({ installBtn: $('#btn-install'), helpDialog: $('#install-help'), fullscreenBtn: $('#btn-fullscreen') });
syncLoginButton();
route();
if (hub.session) {
  // 이름·역할이 바뀌었을 수 있으니 새로 받고, 계정 저장 모드면 계정 기록을 이 기기로
  (async () => {
    try {
      await hub.me();
      if (hub.saveMode === 'account' && (await hub.downloadSave()).length) {
        reloadSaves();
        if (!els.intro.hidden && document.body.dataset.page !== 'hub') renderIntro();
      }
    } catch {
      /* 오프라인 등: 이 기기 기록으로 계속 */
    }
    syncLoginButton();
  })();
}
