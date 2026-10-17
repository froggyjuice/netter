// 홈 화면 리듬 슈팅 '타이밍 연습': 실제 경기 전에 박자 맞추기만 연습한다 (점수 기록 없음).
// 공격(GS·GA): 줄어드는 원이 링에 겹칠 때 🎯 슛 / 수비(GK·GD): ① 0.9m에 멈춤 → ② 공이 올라갈 때 블록
// 판정은 실제 게임과 같은 함수(judge · judgeStop)와 난이도 배율을 쓴다.
import { THEME, hex, FONT } from '../shared/theme.js';
import { DIFFICULTY, WINDOWS, beatMsFor, judge } from '../games/rhythm-logic.js';
import { judgeStop, START_GAP, DEFENCE_GAP } from '../games/rhythm-defence-logic.js';

const W = 420;
const H = 200;
const PRACTICE_DIST = 3; // 공격 연습: 골대에서 3m 슛으로 판정
const GRADE_TEXT = { perfect: 'Perfect!', great: 'Great!', good: 'Good', miss: 'Miss' };
const GRADE_COLOR = { perfect: '#c0613a', great: '#3f63a8', good: '#4a8559', miss: '#6b7280' };
const KEY_ACT = { ArrowUp: 'up', KeyW: 'up', KeyJ: 'up', Enter: 'up', ArrowDown: 'down', KeyS: 'down', KeyK: 'down' };

/**
 * @param {{ root: HTMLElement, mode: 'attack'|'defence', difficulty: string, audio: object }} opts
 * @returns {{ stop(): void }}
 */
export function startRhythmPractice({ root, mode, difficulty, audio }) {
  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const k = cfg.window;
  const beat = beatMsFor(1);
  const defence = mode === 'defence';
  root.innerHTML = `
    <canvas class="practice-canvas" width="${W}" height="${H}" aria-label="타이밍 연습"></canvas>
    <div class="practice-pad">
      ${defence ? '<button type="button" data-act="down">① 🧍 멈춤 <small>↓</small></button>' : ''}
      <button type="button" data-act="up">${defence ? '② ✋ 블록' : '🎯 슛'} <small>↑</small></button>
    </div>
    <p class="practice-msg" aria-live="polite"></p>
    <p class="muted small practice-stats"></p>`;
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const msg = root.querySelector('.practice-msg');
  const statsEl = root.querySelector('.practice-stats');
  const stats = { perfect: 0, great: 0, good: 0, miss: 0 };
  let stopped = false;
  let raf = 0;
  let lastBeat = -1;
  const t0 = performance.now();
  let cycle = null;
  let result = null; // { text, color, until }

  const say = (text, kind = 'info') => {
    msg.textContent = text;
    msg.dataset.kind = kind;
  };
  const record = (grade) => {
    stats[grade] += 1;
    statsEl.textContent = `연습 기록 — Perfect ${stats.perfect} · Great ${stats.great} · Good ${stats.good} · Miss ${stats.miss} (${cfg.label})`;
  };
  const show = (text, color) => {
    result = { text, color, until: performance.now() + 900 };
  };
  const errText = (err) => (Math.abs(err) < 15 ? '딱 맞았어요' : `${Math.abs(Math.round(err))}ms ${err < 0 ? '빨랐어요' : '늦었어요'}`);

  /** 다음 연습 한 번: 박자 위에서 시작 */
  function newCycle(now) {
    const startBeat = Math.ceil((now - t0) / beat + 0.5);
    const start = t0 + startBeat * beat;
    const beats = cfg.approach[Math.floor(Math.random() * cfg.approach.length)];
    if (!defence) {
      cycle = { start, perfectAt: start + beats * beat, beats, done: false };
    } else {
      const markAt = start + beats * beat;
      cycle = { start, markAt, beats, releaseAt: markAt + beat, step: 1, stopGap: null, done: false };
    }
  }

  function press(act) {
    if (stopped) return;
    const now = performance.now();
    if (!cycle || cycle.done || now < cycle.start) {
      say('원이 나타나면 눌러 봐요', 'info');
      return;
    }
    if (!defence) {
      if (act !== 'up') return;
      const err = now - cycle.perfectAt;
      const grade = judge(err, PRACTICE_DIST, k);
      cycle.done = true;
      record(grade);
      show(GRADE_TEXT[grade], GRADE_COLOR[grade]);
      say(`${GRADE_TEXT[grade]} — ${errText(err)}`, grade === 'miss' ? 'bad' : 'good');
      if (grade === 'perfect') audio.sfx('goal');
      else if (grade !== 'miss') audio.sfx('ball');
      else audio.sfx('rim');
      return;
    }
    // 수비: ① 멈춤 → ② 블록
    if (cycle.step === 1) {
      if (act !== 'down') {
        say('① 🧍 멈춤이 먼저예요! 0.9m 원이 노랗게 빛날 때', 'bad');
        return;
      }
      const err = now - cycle.markAt;
      const grade = judgeStop(err, k);
      cycle.stopGap = gapAt(now);
      cycle.step = 2;
      if (grade === 'far') {
        record('miss');
        show('너무 멀어요', GRADE_COLOR.miss);
        say(`① 멈춤: 너무 일찍 멈췄어요 (${errText(err)}) — 이 거리에선 블록이 닿지 않아요`, 'bad');
        audio.sfx('wall');
      } else {
        record(grade);
        show(`0.9m ${GRADE_TEXT[grade]}`, GRADE_COLOR[grade]);
        say(`① 멈춤 ${GRADE_TEXT[grade]} — ${errText(err)}. 이제 슈터 머리 위 원이 작아질 때 ② 블록!`, 'good');
        audio.sfx(grade === 'perfect' ? 'circleBlock' : 'block');
      }
      return;
    }
    if (act !== 'up') {
      say('① 멈춤은 했어요. 이제 ② ✋ 블록!', 'info');
      return;
    }
    const err = now - cycle.releaseAt;
    const grade = judgeStop(err, k); // 같은 판정 범위: far = 너무 일찍 뜀, obstruction = 늦게 뜀(슛 방해)
    cycle.done = true;
    if (grade === 'far') {
      record('miss');
      show('너무 일찍 뜀', GRADE_COLOR.miss);
      say(`② 블록: 너무 일찍 뛰었어요 (${errText(err)}) — 공이 손을 떠날 때 뛰어야 해요`, 'bad');
    } else if (grade === 'obstruction') {
      record('miss');
      show('슛 방해!', '#b54a4a');
      say(`② 블록: 늦었어요 (${errText(err)}) — 링으로 떨어지는 공을 건드리면 슛 방해 (Rule 9.7)`, 'bad');
      audio.sfx('whistle');
    } else {
      record(grade);
      show(`블록 ${GRADE_TEXT[grade]}`, GRADE_COLOR[grade]);
      say(`② 블록 ${GRADE_TEXT[grade]} — ${errText(err)}. 정당한 블록! (Rule 16.6a)`, 'good');
      audio.sfx('circleBlock');
    }
  }

  /** 수비: 지금 슈터와의 거리(m) */
  function gapAt(now) {
    if (cycle.stopGap != null) return cycle.stopGap;
    if (now <= cycle.start) return START_GAP;
    const speed = (START_GAP - DEFENCE_GAP) / (cycle.markAt - cycle.start);
    return Math.max(0.35, START_GAP - (now - cycle.start) * speed);
  }

  function tick(now) {
    if (!cycle) newCycle(now);
    // 놓친 경우 · 다음 연습으로
    const goodWin = WINDOWS.good * k;
    if (!defence && !cycle.done && now > cycle.perfectAt + goodWin) {
      cycle.done = true;
      record('miss');
      show('놓쳤어요', GRADE_COLOR.miss);
      say('원이 링에 겹칠 때(노랗게 빛날 때) 🎯 슛!', 'bad');
    }
    if (defence && !cycle.done && cycle.step === 1 && now > cycle.markAt + goodWin) {
      cycle.done = true;
      record('miss');
      show('장애 반칙!', '#b54a4a');
      say('멈추지 않고 0.9m 안으로 들어갔어요 → 장애 반칙 (Obstruction · Rule 16.1). 원이 노랗게 빛날 때 ① 멈춤!', 'bad');
      audio.sfx('whistle');
    }
    if (defence && !cycle.done && cycle.step === 2 && now > cycle.releaseAt + goodWin * 2) {
      cycle.done = true;
      record('miss');
      show('블록 안 함', GRADE_COLOR.miss);
      say('공이 손을 떠나는 박(머리 위 원이 작아질 때)에 ② 블록!', 'bad');
    }
    const end = defence ? cycle.releaseAt : cycle.perfectAt;
    if (cycle.done && now > end + beat * 1.5) newCycle(now);
    // 박자 소리
    const b = Math.floor((now - t0) / beat);
    if (b !== lastBeat) {
      lastBeat = b;
      audio.beat(b % 4 === 0);
    }
  }

  function draw(now) {
    ctx.fillStyle = hex(THEME.allowed);
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    const near = (target, w) => Math.abs(now - target) <= WINDOWS[w] * k;
    if (!defence) {
      // 골 서클 일부 + 링
      const ring = { x: W / 2, y: 46 };
      ctx.fillStyle = hex(THEME.goalZone);
      ctx.beginPath();
      ctx.arc(W / 2, 0, 150, 0, Math.PI);
      ctx.fill();
      const R = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = hex(THEME.goalRing);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (cycle && !cycle.done && now >= cycle.start) {
        const kk = (cycle.perfectAt - now) / (cycle.beats * beat);
        const hot = near(cycle.perfectAt, 'great');
        ctx.strokeStyle = hot ? '#f2cf6b' : '#3f63a8';
        ctx.lineWidth = hot ? 6 : 3;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, R * (1 + Math.max(-0.15, kk) * 3.2), 0, Math.PI * 2);
        ctx.stroke();
      }
      // 나 (공을 든 애벌레)
      dot(W / 2, 150, 15, THEME.snakeHead);
      dot(W / 2 + 13, 136, 7, THEME.ball);
    } else {
      // 상대 슈터(보라) · 0.9m 원 · 다가오는 나(주황)
      const M = 52; // 1m
      const shooter = { x: W / 2 - 40, y: 110 };
      const gap = cycle ? gapAt(now) : START_GAP;
      const step1 = cycle && !cycle.done && cycle.step === 1 && now >= cycle.start;
      ctx.strokeStyle = step1 && near(cycle.markAt, 'great') ? '#f2cf6b' : gap < DEFENCE_GAP - 1e-6 ? hex(THEME.danger) : '#3f63a8';
      ctx.lineWidth = step1 && near(cycle.markAt, 'great') ? 6 : 2;
      ctx.beginPath();
      ctx.arc(shooter.x, shooter.y, DEFENCE_GAP * M, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hex(THEME.ink);
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('0.9m', shooter.x, shooter.y + DEFENCE_GAP * M + 14);
      dot(shooter.x, shooter.y, 17, THEME.opp);
      // 공: 슈터가 들고 있다가 놓는다
      const released = cycle && now >= cycle.releaseAt;
      if (!released) dot(shooter.x, shooter.y - 24, 8, THEME.ball);
      else {
        const t = Math.min(1, (now - cycle.releaseAt) / (beat * 0.6));
        dot(shooter.x + t * 30, shooter.y - 24 - Math.sin(t * Math.PI) * 50 - t * 20, 8, THEME.ball);
      }
      // ② 블록 타이밍 원 (슈터 머리 위)
      if (cycle && !cycle.done && cycle.step === 2 && now <= cycle.releaseAt + WINDOWS.good * k) {
        const kk = (cycle.releaseAt - now) / beat;
        const hot = near(cycle.releaseAt, 'great');
        ctx.strokeStyle = hot ? '#f2cf6b' : '#e07a4f';
        ctx.lineWidth = hot ? 6 : 3;
        ctx.beginPath();
        ctx.arc(shooter.x, shooter.y - 24, 11 * (1 + Math.max(0, kk) * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      dot(shooter.x + gap * M, shooter.y, 15, THEME.snakeHead);
      ctx.fillStyle = hex(THEME.ink);
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText(cycle?.step === 2 ? '② 블록 차례' : '① 멈춤 차례', W - 60, 24);
    }
    if (result && now < result.until) {
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(result.text, W / 2, H - 18);
      ctx.fillStyle = result.color;
      ctx.fillText(result.text, W / 2, H - 18);
    }
  }

  function dot(x, y, r, color) {
    ctx.fillStyle = hex(color);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    if (stopped) return;
    if (!canvas.isConnected) return stop();
    tick(now);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  const onKey = (e) => {
    const act = KEY_ACT[e.code];
    if (!act || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLButtonElement && e.code === 'Enter') return;
    e.preventDefault();
    press(act);
  };
  const onPad = (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    e.preventDefault();
    press(btn.dataset.act);
  };
  window.addEventListener('keydown', onKey);
  root.querySelector('.practice-pad').addEventListener('pointerdown', onPad);

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
  }

  say(defence ? '박자 소리에 맞춰 ① 0.9m 원이 빛날 때 멈춤 → ② 머리 위 원이 작아질 때 블록' : '박자 소리에 맞춰, 파란 원이 링에 겹칠 때 🎯 슛!', 'info');
  statsEl.textContent = `연습 기록 — 아직 없어요 (${cfg.label})`;
  raf = requestAnimationFrame(frame);
  return { stop };
}
