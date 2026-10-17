// 효과음 · 배경음악. 음원 파일 없이 Web Audio로 합성한다 (저작권 걱정 없음, 용량 0).
// 브라우저는 사용자 조작 전에는 소리를 막으므로, "시작" 버튼에서 unlock()을 부른다.

const KEYS = { sfx: 'netball.sfx', music: 'netball.music' };

function load(key) {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}
function save(key, on) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    /* 저장 못 해도 동작에는 문제없음 */
  }
}

let ctx = null;
let master = null;
let musicBus = null;
const settings = { sfx: load(KEYS.sfx), music: load(KEYS.music) };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = settings.music ? 1 : 0;
  musicBus.connect(master);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
  return ctx;
}

/** 사용자 조작(클릭) 안에서 호출해 오디오를 깨운다. */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

/** 짧은 음 하나. type: 'square' | 'triangle' | 'sine' | 'sawtooth' */
function tone(freq, { at = 0, dur = 0.12, type = 'square', vol = 0.18, slide = null, bus = master } = {}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SFX = {
  ball: () => {
    tone(880, { dur: 0.08, vol: 0.14 });
    tone(1320, { at: 0.06, dur: 0.1, vol: 0.12 });
  },
  goal: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.16, vol: 0.14 })),
  block: () => tone(220, { dur: 0.14, type: 'triangle', vol: 0.3, slide: 440 }),
  circleBlock: () => [330, 494, 659].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.15, type: 'triangle', vol: 0.28 })),
  pass: () => tone(660, { dur: 0.12, type: 'sine', vol: 0.22, slide: 1320 }),
  wall: () => tone(140, { dur: 0.08, type: 'triangle', vol: 0.25 }),
  offside: () => tone(330, { dur: 0.22, type: 'sawtooth', vol: 0.1, slide: 165 }),
  contact: () => tone(200, { dur: 0.12, type: 'square', vol: 0.1, slide: 120 }),
  conceded: () => [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.12, dur: 0.18, type: 'sawtooth', vol: 0.1 })),
  sub: () => [523, 659].forEach((f, i) => tone(f, { at: i * 0.08, dur: 0.1, vol: 0.12 })),
  whistle: () => {
    tone(2600, { dur: 0.18, type: 'square', vol: 0.07 });
    tone(2400, { at: 0.2, dur: 0.32, type: 'square', vol: 0.07 });
  },
  // 심판의 짧은 반칙 휘슬 (오프사이드 · 3초 · 브레이킹): 떨리는 '삑'
  whistleShort: () => {
    for (let i = 0; i < 4; i++) tone(i % 2 ? 2500 : 2750, { at: i * 0.045, dur: 0.05, type: 'square', vol: 0.06 });
  },
  badge: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, type: 'triangle', vol: 0.25 })),
  // 리듬 슈팅: 박자(메트로놈) · 림에 맞음
  tick: () => tone(1046, { dur: 0.04, type: 'square', vol: 0.05 }),
  tickStrong: () => tone(1568, { dur: 0.05, type: 'square', vol: 0.07 }),
  rim: () => tone(180, { dur: 0.16, type: 'triangle', vol: 0.3, slide: 120 }),
  over: () => [523, 392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.16, dur: 0.24, type: 'triangle', vol: 0.22 })),
};

/** 리듬 슈팅 박자 소리: 배경음악 설정(🎵)을 따른다 */
export function beat(strong = false) {
  if (!settings.music || !ensure() || ctx.state !== 'running') return;
  SFX[strong ? 'tickStrong' : 'tick']();
}

export function sfx(name) {
  if (!settings.sfx || !SFX[name] || !ensure() || ctx.state !== 'running') return;
  SFX[name]();
}

// ---------- 배경음악: 직접 만든 짧은 8비트풍 루프 (C장조, 120BPM, 8분음표) ----------
const N = { C3: 131, D3: 147, G2: 98, A2: 110, F2: 87, C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659 };
const MELODY = [
  'E4', 'G4', 'C5', 'G4', 'A4', 'G4', 'E4', null, 'D4', 'E4', 'G4', 'E4', 'D4', 'C4', 'D4', null,
  'E4', 'G4', 'C5', 'D5', 'E5', 'D5', 'C5', null, 'A4', 'G4', 'E4', 'G4', 'D4', 'E4', 'C4', null,
];
const BASS = ['C3', 'C3', 'A2', 'A2', 'F2', 'F2', 'G2', 'G2']; // 8분음표 4개마다 1음 → 멜로디(32칸)와 같은 길이로 반복
const STEP = 0.25; // 8분음표 길이(초)

// 패스 퍼즐: 생각할 시간을 주는 느긋한 루프 (F장조, 92BPM, 부드러운 사인파)
const PUZZLE_MELODY = [
  'C5', null, 'A4', null, 'G4', null, 'E4', null, 'F4', null, 'A4', null, 'C5', null, null, null,
  'D5', null, 'C5', null, 'A4', null, 'G4', null, 'E4', null, 'F4', null, 'G4', null, null, null,
];
const PUZZLE_BASS = ['F2', 'F2', 'C3', 'C3', 'D3', 'A2', 'G2', 'C3'];

/** 곡: 존 스네이크(main) · 패스 퍼즐(puzzle) */
const TRACKS = {
  main: { melody: MELODY, bass: BASS, step: STEP, wave: 'square', vol: 0.045, bassVol: 0.12 },
  puzzle: { melody: PUZZLE_MELODY, bass: PUZZLE_BASS, step: 60 / 92 / 2, wave: 'sine', vol: 0.07, bassVol: 0.1 },
};
let track = TRACKS.main;

let timer = null;
let nextAt = 0;
let stepNo = 0;

function schedule() {
  while (nextAt < ctx.currentTime + 0.3) {
    const at = nextAt - ctx.currentTime;
    const { melody, bass, step, wave, vol, bassVol } = track;
    const m = melody[stepNo % melody.length];
    if (m) tone(N[m], { at, dur: step * (wave === 'sine' ? 1.6 : 0.9), type: wave, vol, bus: musicBus });
    if (stepNo % 4 === 0) {
      const b = bass[Math.floor(stepNo / 4) % bass.length];
      tone(N[b], { at, dur: step * 3.6, type: 'triangle', vol: bassVol, bus: musicBus });
    }
    nextAt += step;
    stepNo += 1;
  }
}

/** name: 'main'(존 스네이크) · 'puzzle'(패스 퍼즐) */
export function startMusic(name = 'main') {
  if (timer || !ensure()) return;
  track = TRACKS[name] ?? TRACKS.main;
  nextAt = ctx.currentTime + 0.1;
  stepNo = 0;
  timer = setInterval(schedule, 100);
  schedule();
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}

export function getSettings() {
  return { ...settings };
}

export function setSfx(on) {
  settings.sfx = on;
  save(KEYS.sfx, on);
}

export function setMusic(on) {
  settings.music = on;
  save(KEYS.music, on);
  if (musicBus) musicBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
}
