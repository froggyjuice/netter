// 패스 퍼즐 전용 허브 화면 조각: 스테이지 목록 · 설명 · 진행도(별) 저장
import { PASS_STAGES, PASS_CHAPTERS } from '../games/pass-stages.js';
import { BALL_ICON, OPP_ICON, TEAMMATE_ICON } from './icons.js';

/** 스테이지에서 배우는 규칙 꼬리표 */
export const STAGE_RULE_LABEL = Object.freeze({
  shooting: '슛 (9.1)',
  overThird: '서드 건너뛰기 (12.3)',
  shortPass: '숏 패스 (12.1)',
  interception: '인터셉트 (16.6)',
  offside: '오프사이드 (14)',
  footwork: '풋워크 (13)',
  heldBall: '3초 (11.4)',
  thirdStep: '서드 한 발 (12.5)',
  mixed: '종합',
});

/** 진행도: { 스테이지 id: 최고 별 수 } (localStorage 'netball.pass') */
export function parseProgress(text) {
  try {
    const o = JSON.parse(text ?? '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}
// 앞 스테이지를 깼거나, 이미 별을 받은 스테이지(새 스테이지가 사이에 추가된 경우)면 열림
export const isUnlocked = (progress, i) =>
  i === 0 || (progress[PASS_STAGES[i - 1].id] ?? 0) > 0 || (progress[PASS_STAGES[i].id] ?? 0) > 0;
export const totalStars = (progress) => PASS_STAGES.reduce((s, st) => s + (progress[st.id] ?? 0), 0);

/** 챕터(규칙 모음)별로 묶은 스테이지 카드 */
export function stageCardsHtml(progress) {
  return PASS_CHAPTERS.map((ch, n) => {
    const stages = PASS_STAGES.filter((s) => s.chapter === ch.id);
    const got = stages.reduce((sum, s) => sum + (progress[s.id] ?? 0), 0);
    return `<section class="chapter">
      <h3><span class="ch-no">챕터 ${n + 1}</span> ${ch.title} <small>${ch.rules}</small><span class="ch-stars">⭐ ${got} / ${stages.length * 3}</span></h3>
      <div class="stage-list">${stages.map((s) => stageCard(progress, s)).join('')}</div>
    </section>`;
  }).join('');
}

function stageCard(progress, s) {
  const i = PASS_STAGES.indexOf(s);
  const open = isUnlocked(progress, i);
  const stars = progress[s.id] ?? 0;
  const starText = open ? `${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}` : '🔒';
  return `<button type="button" class="stage-card" data-stage="${s.id}" ${open ? '' : 'disabled'} data-cleared="${stars > 0}">
      <span class="no">${i + 1}</span><b>${s.title}</b><span class="stars">${starText}</span>
      <small>${STAGE_RULE_LABEL[s.rule] ?? ''}</small></button>`;
}

/** 패스 퍼즐 규칙 토글 블록 (설명 보기 · 일시정지 화면). p: id 접두사 */
export function passRulesHtml(p) {
  return `
    <div class="info-tabs" role="group" aria-label="패스 퍼즐 설명">
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-play">🎮 하는 법</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-rules">🏐 패스 규칙</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-zone">🧭 구역</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-foot">👣 피벗 · 3초</button>
    </div>
    <div class="info-panel" id="${p}-play" hidden>
      <p>스테이지는 <b>챕터(규칙 모음)</b>별로 묶여 있고, 앞 스테이지를 깨면 다음이 열려요.</p>
      <p>${BALL_ICON}공을 가진 선수(주황 머리)에서 <b>받을 동료를 누르면</b> 패스돼요.<br />
        골 서클(황금색) 안의 <b>GS·GA</b>가 공을 받으면 <b>🎯 슛</b>!</p>
      <p>${OPP_ICON}<b>상대</b>가 공의 길 위에 있으면 가로채여요(인터셉트). 마우스를 올리면 공의 길이 점선으로 보여요.</p>
      <p>규칙을 어기거나 가로채이면 상대에게 공이 넘어가요 → <b>↺ 다시</b> 해 봐요. 기준 패스 수 안에 넣으면 ⭐⭐⭐</p>
    </div>
    <div class="info-panel" id="${p}-rules" hidden>
      <p><b>숏 패스 금지</b>: 바로 옆(대각선 포함) 동료에게는 패스할 수 없어요. 상대가 가로챌 수 있을 만큼 떨어져 있어야 해요. (Rule 12.1)</p>
      <p><b>서드 건너뛰기 금지</b>: 공은 <b>수비 · 센터 · 공격 서드</b> 모두에서 잡혀야 해요. 수비 서드에서 공격 서드로 바로 던지면 반칙! (Rule 12.3)</p>
      <p class="muted small">코트 위쪽에 서드 이름이 적혀 있어요.</p>
    </div>
    <div class="info-panel" id="${p}-zone" hidden>
      <p>${TEAMMATE_ICON}선수마다 <b>설 수 있는 구역</b>이 달라요 (존 스네이크와 같아요).<br />
        <b>자리 잡기</b> 스테이지에서는 노란 테두리 선수를 끌어서 옮길 수 있어요. 설 수 없는 곳은 빗금 · 빨간 선(오프사이드, Rule 14).</p>
    </div>
    <div class="info-panel" id="${p}-foot" hidden>
      <p><b>피벗</b> (풋워크 챕터부터): 공을 든 선수 옆 칸(회색 네모)을 누르면 <b>한 발</b> 디뎌 패스 길을 바꿔요.<br />
        두 번째 발은 <b>풋워크 반칙</b>! (Rule 13) 옆 서드로 한 발 디뎌도 다음 패스는 처음 잡은 서드 기준이에요 (Rule 12.5).</p>
      <p><b>3초</b> (3초 챕터 · 종합 도전): 공을 든 선수 둘레의 링이 다 사라지기 전에 패스하거나 슛해야 해요 (Rule 11.4).</p>
    </div>`;
}

/** 실패 알림 문구 */
export function failText(ev) {
  const by = ev.reason === 'intercept' && ev.by ? `상대 ${ev.by}에게 ` : '';
  return `🚨 ${by}${ev.text} (${ev.rule})`;
}
