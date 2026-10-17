// 리듬 슈팅 전용 허브 화면 조각: 설명 · 일시정지 규칙 · 경기 복습 · 게임 알림(hooks)
// main.js 가 화면(소개 카드·HUD·알림·쿼터·종료)을 함께 쓰고, 게임마다 다른 내용만 여기서 만든다.
import { GOAL_THIRD, DIFFICULTY, DIFFICULTY_KEYS } from '../games/rhythm-logic.js';
import { BALL_ICON, TEAMMATE_ICON, OPP_ICON } from './icons.js';

/** 리듬 슈팅: 슈터 GS·GA(공격 · 슛) + 슈터를 막는 GK·GD(수비) */
export const RHYTHM_POSITIONS = Object.freeze(['GS', 'GA', 'GK', 'GD']);
export const SHOOT_POSITIONS = Object.freeze(['GS', 'GA']);
export const rhythmModeOf = (pos) => (SHOOT_POSITIONS.includes(pos) ? 'attack' : 'defence');
/** 화면 아래 두 버튼 (↓ · ↑) */
export const RHYTHM_BUTTONS = Object.freeze({
  attack: { pass: '🤝 패스', shoot: '🎯 슛' },
  defence: { pass: '① 🧍 멈춤', shoot: '② ✋ 블록' }, // 멈춤 먼저, 블록 나중
});
/** 홈 카드 한 줄 설명 */
export const RHYTHM_HOW = Object.freeze({
  attack: '박자에 맞춰 날아오는 패스를 잡고, 줄어드는 원이 링에 겹칠 때 🎯 슛!<br />서클 밖에서 잡으면 🤝 패스.',
  defence: '① 상대 슈터에게 다가가 0.9m 원이 빛나는 박에 🧍 멈춤<br />② 공이 올라가는 박에 ✋ 블록!',
});
/** 화면 비율 (너비 ÷ 높이): 골 서드 15.25m × 10.17m */
export const RHYTHM_RATIO = GOAL_THIRD.w / GOAL_THIRD.h;
export { DIFFICULTY, DIFFICULTY_KEYS };


const REBOUND_KEY = '두 버튼 중 <b>아무거나</b>';

/** 공격 모드(GS·GA) 토글 블록. p: id 접두사 */
function attackRulesHtml(p) {
  return `
    <div class="info-tabs" role="group" aria-label="공격 모드 설명">
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-shot">🎯 슛 타이밍</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-circle">🟡 골 서클</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-reb">🏀 리바운드</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-held">⏱️ 3초 룰</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-def">🥷 상대 수비</button>
    </div>
    <div class="info-panel" id="${p}-shot" hidden>
      <p>${TEAMMATE_ICON}동료의 패스가 박자에 맞춰 날아와요. 공을 잡으면 링 둘레에 <b>파란 원</b>이 나타나 줄어들어요.</p>
      <p>원이 <b>링에 딱 겹칠 때</b>(노랗게 빛날 때) <b>🎯 슛</b> 버튼!<br />
        <b>Perfect +30 · Great +20 · Good +10</b>(보통), 너무 빠르거나 늦으면 Miss.<br />
        골대에서 멀수록 타이밍 범위가 좁아져요.</p>
      <p>성공(골·올바른 패스·리바운드)이 <b>5번 이어지면</b> 그때부터 한 번에 <b>+10 보너스</b>.</p>
    </div>
    <div class="info-panel" id="${p}-circle" hidden>
      <p>골은 <b>GS·GA</b>가 <b>골 서클 안(선 포함)</b>에서 쏜 슛만 인정돼요. (Rule 9.1)</p>
      <p>${BALL_ICON}공을 <b>서클 밖</b>에서 잡았다면 슛하면 안 돼요!<br />
        서클 밖 슛은 <b>Incorrect shot</b>: 골이 인정되지 않고 상대 팀 프리 패스예요. (Rule 9.6a)<br />
        이때는 <b>🤝 패스</b> 버튼으로 서클 안의 짝 슈터에게 넘기면 정답 <b>+10</b>.</p>
      <p>👣 <b>서클 선 위</b>에서 잡으면 서클 안이에요(슛 가능). <b>선 바로 밖</b>에서 잡았다면 한 발 들어가도 슛할 수 없어요 — 잡을 때 밖을 밟았으니까요. (Rule 9.1·9.6a)</p>
      <p class="muted small">서클 안에서 패스해도 반칙은 아니에요. 점수는 없지만 연속은 이어져요.</p>
    </div>
    <div class="info-panel" id="${p}-reb" hidden>
      <p>아깝게 빗나가면 공이 <b>링에 맞고 튕겨요</b>. 공이 떨어질 자리에 원이 줄어들어요.</p>
      <p>원이 작아져 노랗게 빛나는 박에 ${REBOUND_KEY}(🤝 패스 · 🎯 슛) 누르면 <b>리바운드 +10</b>,<br />
        잡은 자리에서 다시 3초 — 바로 슛할 수 있어요. (Rule 11.1c)</p>
      <p>링에도 안 닿은 <b>에어볼</b>은 슛한 사람이 다시 잡을 수 없어요. (Repossession · Rule 11.6)</p>
    </div>
    <div class="info-panel" id="${p}-held" hidden>
      <p>공을 잡으면 내 둘레의 링이 3초 동안 줄어들어요.<br />
        <b>3초 안에</b> 슛하거나 패스해야 해요. 넘기면 <b>Held ball</b>, 상대 팀 프리 패스. (Rule 9.6b)</p>
    </div>
    <div class="info-panel" id="${p}-def" hidden>
      <p>상대 팀 ${OPP_ICON}<b>맞수</b>(GS↔GK, GA↔GD)가 손을 들고 슛을 막아요.<br />
        공을 가진 선수와는 <b>0.9m 이상</b> 떨어져야 해서, 내 둘레의 0.9m 원 밖에 서 있어요. (Rule 16.1)</p>
      <p>🚨 가끔 맞수가 <b>링으로 떨어지는 공을 건드려요</b> → <b>슛 방해</b>(Rule 9.7)!<br />
        들어간 슛은 그대로 골이고, 우리 팀이 그 자리에서 <b>페널티 패스</b>를 얻어요.<br />
        골 서클 안이니 <b>슛해도 돼요</b>(Rule 6.6). 맞수는 옆에 비켜서서 못 움직여요(Rule 6.4).</p>
    </div>`;
}

/** 수비 모드(GK·GD) 토글 블록. p: id 접두사 */
function defenceRulesHtml(p) {
  return `
    <div class="info-tabs" role="group" aria-label="수비 모드 설명">
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-stop">① 🧍 멈춤</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-block">② ✋ 블록</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-dreb">🏀 리바운드</button>
      <button type="button" class="info-tab" aria-expanded="false" aria-controls="${p}-foul">🚨 반칙</button>
    </div>
    <div class="info-panel" id="${p}-stop" hidden>
      <p><b>GK·GD</b>로 뛰면 상대 슈터(GK↔GS, GD↔GA)를 막아요. 한 번의 수비는 <b>① 멈춤 → ② 블록</b> 순서예요.</p>
      <p><b>① 🧍 멈춤</b>: 상대가 서클 안에서 공을 잡으면 내가 슈터에게 다가가요.<br />
        슈터 둘레의 <b>0.9m 원이 노랗게 빛나는 박</b>에 ① 멈춤! Perfect <b>+20</b>(보통)</p>
      <p>너무 일찍 멈추면 멀어서 ② 블록이 닿지 않고, 너무 늦으면 0.9m 안으로 들어가 <b>장애 반칙(Obstruction)</b>이에요. (Rule 16.1)</p>
    </div>
    <div class="info-panel" id="${p}-block" hidden>
      <p><b>② ✋ 블록</b>: ① 멈춤 다음, 슈터 머리 위의 <b>주황 원이 작아지는 박</b>에 공이 손을 떠나요.<br />
        그때 ② 블록 = <b>정당한 블록 +30</b> (Rule 16.6a)</p>
      <p>늦게 뛰면 링으로 <b>떨어지는 공</b>을 건드린 <b>슛 방해</b>예요 (아래 🚨 반칙).<br />
        너무 일찍 뛰면 슈터가 기다렸다 쏴서 더 잘 들어가요.</p>
      <p class="muted small">① 멈춤 전에 ② 블록을 누르면 아무 일도 일어나지 않아요. 0.9m에 가까이 잘 붙을수록 상대 슛이 덜 들어가요.</p>
    </div>
    <div class="info-panel" id="${p}-dreb" hidden>
      <p>상대 슛이 빗나가면 공이 <b>링에 맞고 튕겨요</b>. 떨어질 자리에 원이 줄어들어요.</p>
      <p>원이 작아져 노랗게 빛나는 박에 ${REBOUND_KEY}(① 멈춤 · ② 블록) 누르면 <b>리바운드 +10</b>. (Rule 16.8b)<br />
        놓치면 상대 슈터가 다시 잡아요.</p>
    </div>
    <div class="info-panel" id="${p}-foul" hidden>
      <p><b>장애 반칙 (Obstruction)</b>: ① 멈춤이 늦어 0.9m 안으로 들어가면 상대 팀 <b>페널티 패스</b>.<br />
        나는 옆에 비켜서서 공이 떠날 때까지 못 움직여요(OUT). (Rule 16.1·6.4)</p>
      <p><b>슛 방해 (Interference)</b>: ② 블록이 늦어 링으로 떨어지는 공을 건드리면 상대 팀 <b>페널티 패스</b>,<br />
        들어갈 슛이었다면 골도 인정돼요. (Rule 9.7)</p>
      <p class="muted small">실점은 기록만 남아요(목숨 없음).</p>
    </div>`;
}

/** 일시정지 화면: 지금 모드의 설명만. mode: 'attack' | 'defence' */
export function rhythmRulesHtml(p, mode = 'attack') {
  return mode === 'defence' ? defenceRulesHtml(p) : attackRulesHtml(p);
}

/** 설명 보기: 공통 → 공격 모드 → 수비 모드를 나눠서 */
export function rhythmHelpHtml() {
  return `
    <p class="desc">
      포지션에 따라 모드가 정해져요. <b>GS·GA</b> = 🎯 공격 모드, <b>GK·GD</b> = 🛡️ 수비 모드.<br />
      🔒 <b>WA · WD · C</b>는 골 서클에 들어갈 수 없어 슛도, 슈터 수비도 못 해요 (Rule 9.1). 눌러 보면 갈 수 있는 구역이 미니 코트에 보여요.<br />
      4쿼터 경기(한 쿼터 30초 = 실제 15분), 쿼터마다 <b>박자가 빨라져요</b>.
    </p>
    <p class="small">🎯 <b>타이밍 연습</b>: 홈의 연습 버튼으로 실제 경기 전에 박자 맞추기만 해 볼 수 있어요 (기록은 안 남아요).<br />
      🏆 <b>최고 기록</b>은 공격 · 수비 모드마다 따로, 🏅 <b>배지</b>와 함께 이 기기의 브라우저에 저장돼요.</p>
    <section class="help-mode">
      <h4>🎯 공격 모드 (GS·GA)</h4>
      <p class="small">${RHYTHM_HOW.attack}</p>
      ${attackRulesHtml('help-a')}
      <p class="controls">🎯 슛: ↑ · W · J · Enter / 🤝 패스: ↓ · S · K</p>
    </section>
    <section class="help-mode">
      <h4>🛡️ 수비 모드 (GK·GD)</h4>
      <p class="small">${RHYTHM_HOW.defence}</p>
      ${defenceRulesHtml('help-d')}
      <p class="controls">① 🧍 멈춤: ↓ · S · K / ② ✋ 블록: ↑ · W · J · Enter</p>
    </section>
    <p class="controls">🏀 리바운드는 두 모드 모두 <b>아무 버튼이나</b> · 화면 아래 버튼도 돼요<br />일시정지 — 스페이스 키 · ⏸ 버튼 · 🎵 버튼은 박자 소리 켜기/끄기</p>`;
}

/** 경기 복습 줄: [아이콘, 이름, 값] */
export function rhythmReviewRows(r) {
  const rows = r.mode === 'defence' ? defenceRows(r) : attackRows(r);
  if (r.quarters?.length) rows.unshift(['⏱️', '쿼터별 점수', r.quarters.map((q) => `${q.quarter}Q ${q.score}`).join(' · ')]);
  return rows;
}

function defenceRows(r) {
  return [
    ['🧍', '0.9m 멈춤 Perfect · Great · Good', `${r.stopPerfects ?? 0} · ${r.stopGreats ?? 0} · ${r.stopGoods ?? 0}`],
    ['↔️', '너무 멀리 멈춤', `${r.farStops ?? 0}번`],
    ['✋', '정당한 블록', `${r.blocks ?? 0}번 / ${r.plays ?? 0}번 수비`],
    ['🏀', '리바운드 잡음 / 놓침', `${r.rebounds ?? 0} / ${r.reboundsLost ?? 0}`],
    ['🧱', '상대 슛 빗나감', `${r.saves ?? 0}번`],
    ['💔', '실점', `${r.conceded ?? 0}번`],
    ['🚨', '장애 반칙 (0.9m 안)', `${r.obstructions ?? 0}번`],
    ['🥷', '슛 방해 (늦은 블록)', `${r.interferences ?? 0}번`],
    ['⏩', '너무 일찍 뜀', `${r.earlyJumps ?? 0}번`],
    ['🔥', '최대 연속', `${r.bestCombo ?? 0}번`],
  ];
}

function attackRows(r) {
  return [
    ['🎯', '골 (슛 성공 / 슛)', `${r.goals ?? 0} / ${r.shots ?? 0}`],
    ['✨', 'Perfect · Great · Good', `${r.perfects ?? 0} · ${r.greats ?? 0} · ${r.goods ?? 0}`],
    ['💨', 'Miss (에어볼)', `${r.misses ?? 0}번 (${r.airBalls ?? 0}번)`],
    ['🏀', '리바운드 잡음 / 놓침', `${r.rebounds ?? 0} / ${r.reboundsLost ?? 0}`],
    ['👣', '서클 선 위에서 슛', `${r.lineShots ?? 0}번`],
    ['🤝', '서클 밖 → 올바른 패스', `${r.feeds ?? 0}번`],
    ['🔥', '최대 연속', `${r.bestCombo ?? 0}번`],
    ['🚫', '서클 밖 슛 (Incorrect shot)', `${r.incorrectShots ?? 0}번`],
    ['⏱️', '3초 지남 (Held ball)', `${r.helds ?? 0}번`],
    ['🥷', '슛 방해 → 페널티 패스', `${r.interferences ?? 0}번 (페널티 슛 ${r.penaltyShots ?? 0}번)`],
  ];
}

/**
 * 게임 알림 hooks. deps: { showToast, ruleLog() → 지금 경기의 규칙 기록, audio }
 * 같은 알림이 매 플레이마다 반복되지 않도록 처음 몇 번만 자세히 안내한다.
 */
export function rhythmHooks({ showToast, ruleLog, audio }) {
  let catchTips = 0;
  let lineTips = 0;
  let airTip = false;
  let lateTips = 0;
  let circlePassTip = false;
  let lastNoBall = 0;
  let approachTips = 0;
  const once = new Set(); // 한 번만 보여 줄 안내
  const tipOnce = (key, text, kind = 'info', ms = 3500) => {
    if (once.has(key)) return;
    once.add(key);
    showToast(text, kind, ms);
  };
  let lastNudge = 0;
  const nudge = (text) => {
    const now = performance.now();
    if (now - lastNudge < 1500) return;
    lastNudge = now;
    showToast(text, 'info', 2200);
  };
  return {
    onBeat: (n) => audio.beat(n % 4 === 0),
    onWhistle: () => {
      audio.sfx('whistle');
      ruleLog().add('quarters');
      ruleLog().add('shotDefence');
    },
    onCatch: ({ inCircle, penalty, line }) => {
      if (line) {
        ruleLog().add('onTheLine');
        if (lineTips < 2) {
          lineTips += 1;
          if (line === 'on') showToast('👣 선 위에서 잡았어요 — 선 위는 서클 안! 슛할 수 있어요 (Rule 9.1)', 'good', 3000);
          else showToast('👣 선 바로 밖에서 잡았어요 — 한 발 들어가도 슛할 수 없어요. 패스! (Rule 9.6a)', 'bad', 3500);
        }
        return;
      }
      if (penalty) {
        ruleLog().add('penaltyShoot');
        ruleLog().add('outOfPlay');
        showToast('골 서클 안 페널티 패스! 맞수는 옆에 비켜섰어요. 슛해도 돼요 (Rule 6.4·6.6)', 'good', 4000);
        return;
      }
      if (catchTips >= 2) return;
      catchTips += 1;
      if (inCircle) showToast('서클 안! 파란 원이 링에 겹칠 때 🎯 슛', 'good', 2500);
      else showToast('서클 밖이에요! 슛 대신 🤝 패스로 서클 안 짝에게 (Rule 9.6a)', 'bad', 3000);
    },
    onShot: (ev) => {
      ruleLog().add('shooting');
      if (ev.goal) {
        ruleLog().add('goalScored');
        audio.sfx(ev.grade === 'perfect' ? 'goal' : 'ball');
        if (ev.combo === 5 || (ev.combo > 5 && ev.combo % 5 === 0)) showToast(`🔥 ${ev.combo}연속! 이제부터 +10 보너스`, 'good', 2500);
      } else {
        audio.sfx('rim');
        if (ev.miss === 'rim') ruleLog().add('rebound');
        if (ev.miss === 'air') {
          ruleLog().add('repossession');
          if (!airTip) {
            airTip = true;
            showToast('에어볼! 링에도 안 닿은 공은 슛한 사람이 다시 잡을 수 없어요 (Repossession · Rule 11.6)', 'bad', 4000);
          }
        }
      }
      if (ev.interference) {
        audio.sfx('whistle');
        ruleLog().add('interference');
        const goal = ev.goal ? '들어간 슛은 골 인정!' : '슛은 빗나갔지만';
        showToast(`🚨 상대 팀 ${ev.who} 슛 방해! ${goal} 우리 팀 페널티 패스 (Rule 9.7)`, 'good', 5000);
      }
    },
    onRebound: () => {
      audio.sfx('pass');
      ruleLog().add('rebound');
    },
    onReboundLost: ({ who }) => {
      audio.sfx('offside');
      showToast(`상대 팀 ${who}가 리바운드를 잡았어요. 공이 떨어지는 박에 맞춰 눌러 봐요!`, 'bad', 3000);
    },
    onIncorrect: () => {
      audio.sfx('offside');
      ruleLog().add('incorrectShot');
      showToast('🚫 서클 밖에서 슛! 골 무효, 상대 팀 프리 패스 (Incorrect shot · Rule 9.6a)', 'bad', 4000);
    },
    onFeed: () => audio.sfx('pass'),
    onCirclePass: () => {
      audio.sfx('pass');
      if (circlePassTip) return;
      circlePassTip = true;
      showToast('서클 안에서는 슛할 수 있어요! 패스도 반칙은 아니지만 점수는 없어요', 'info', 3000);
    },
    onHeld: () => {
      audio.sfx('offside');
      ruleLog().add('shotHeld');
      showToast('3초가 지났어요! Held ball → 상대 팀 프리 패스 (Rule 9.6b)', 'bad', 3500);
    },
    onLate: () => {
      if (lateTips >= 1) return;
      lateTips += 1;
      showToast('타이밍을 놓쳤어요. 3초 전에 🤝 패스하면 공을 지킬 수 있어요', 'info', 3000);
    },
    // ---------- 수비 모드 (GK·GD) ----------
    onOppCatch: ({ penalty }) => {
      if (penalty) {
        ruleLog().add('outOfPlay');
        showToast('상대 팀 페널티 패스! 나는 옆에 비켜서서 공이 떠날 때까지 못 움직여요 (Rule 6.4)', 'bad', 3500);
        return;
      }
      if (approachTips >= 2) return;
      approachTips += 1;
      showToast('다가가요! 0.9m 원이 노랗게 빛나는 박에 ① 🧍 멈춤', 'good', 2500);
    },
    onStop: ({ grade }) => {
      ruleLog().add('obstruction');
      if (grade === 'far') {
        audio.sfx('wall');
        tipOnce('far', '너무 일찍 멈춰서 멀어요. 이 거리에서는 블록이 닿지 않아요', 'info', 3000);
      } else {
        audio.sfx(grade === 'perfect' ? 'circleBlock' : 'block');
        tipOnce('stopOk', '0.9m를 지켰어요! 이제 슈터 머리 위 원이 작아지는 박에 ② ✋ 블록', 'good', 3000);
      }
    },
    onObstruction: () => {
      audio.sfx('whistle');
      ruleLog().add('obstruction');
      ruleLog().add('outOfPlay');
      showToast('🚨 장애 반칙! 0.9m 안으로 들어갔어요 → 상대 팀 페널티 패스 (Rule 16.1)', 'bad', 4000);
    },
    onBlock: () => {
      audio.sfx('circleBlock');
      ruleLog().add('blockLegal');
      tipOnce('block', '정당한 블록! 0.9m를 지키고 공이 올라갈 때 막았어요 (Rule 16.6a)', 'good', 3500);
    },
    onEarlyJump: () => nudge('너무 일찍 뛰었어요. 슈터가 기다렸다 쏴요'),
    onTooFar: () => nudge('너무 멀리 서서 손이 닿지 않아요. ① 멈춤을 0.9m에 맞춰 봐요'),
    onNotYet: () => nudge('① 🧍 멈춤이 먼저예요! 0.9m 원에 맞춰 멈춘 뒤 ② 블록'),
    onOutOfPlay: () => nudge('페널티 패스 중에는 공이 떠날 때까지 플레이할 수 없어요 (Rule 6.4)'),
    onInterference: ({ who }) => {
      audio.sfx('whistle');
      ruleLog().add('interference');
      showToast(`🚨 슛 방해! 링으로 떨어지는 공을 건드렸어요 → 상대 팀 ${who} 페널티 패스 (Rule 9.7)`, 'bad', 4500);
    },
    onConceded: ({ who, interference }) => {
      audio.sfx('conceded');
      if (!interference) nudge(`실점! 상대 팀 ${who}의 슛이 들어갔어요`);
      else showToast('들어갈 슛이었으니 골은 인정돼요 (Rule 9.7)', 'bad', 3000);
    },
    onOppMiss: () => {
      audio.sfx('rim');
      ruleLog().add('rebound');
      tipOnce('oppMiss', '빗나갔어요! 공이 떨어지는 박에 두 버튼 중 아무거나 → 리바운드 (Rule 16.8b)', 'good', 3000);
    },
    onNoBall: () => {
      const now = performance.now();
      if (now - lastNoBall < 1500) return;
      lastNoBall = now;
      showToast('아직 공이 날아오는 중이에요. 공을 잡은 다음에 눌러 봐요', 'info', 2000);
    },
  };
}
